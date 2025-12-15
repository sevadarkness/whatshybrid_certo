const prisma = require("../prisma");
const { sendTextMessage, uploadMediaFromDataUrl, sendMediaMessageById } = require("./whatsappService");

// Worker loop settings
const TICK_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePhone(raw) {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("00") ? digits.slice(2) : digits;
}

function safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch (_) {
    return fallback;
  }
}

/**
 * Replace placeholders like {{nome}} using vars.
 * - Supports nested keys with dot notation: {{cliente.nome}}
 * - Leaves placeholder untouched if not found
 */
function applyVariables(template, vars) {
  if (!template || !vars) return template;
  return String(template).replace(/{{\s*([\w.-]+)\s*}}/g, (m, key) => {
    const parts = String(key).split(".");
    let cur = vars;
    for (const p of parts) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, p)) cur = cur[p];
      else {
        cur = undefined;
        break;
      }
    }
    if (cur === undefined || cur === null) return m;
    return String(cur);
  });
}

function buildRecipientIndex(messagesJson) {
  if (!messagesJson) return null;
  const list = safeJsonParse(messagesJson, null);
  if (!Array.isArray(list)) return null;

  const idx = new Map();
  for (const entry of list) {
    if (!entry) continue;
    const phone = normalizePhone(entry.phone || entry.to || entry.numero || entry.number);
    if (!phone) continue;
    idx.set(phone, entry);
  }
  return idx;
}

function buildVars(entry, phone) {
  if (!entry) return { phone };

  const vars = { phone };

  // explicit vars
  if (entry.vars && typeof entry.vars === "object" && !Array.isArray(entry.vars)) {
    Object.assign(vars, entry.vars);
  }

  // promote primitive fields (e.g., name, nome, cidade)
  for (const [k, v] of Object.entries(entry)) {
    if (k === "vars" || k === "phone" || k === "to" || k === "numero" || k === "number" || k === "message") continue;
    if (v === null || v === undefined) continue;
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") {
      vars[k] = v;
    }
  }

  return vars;
}

async function sendCampaignItem(item, campaign, mediaList, recipientIndex) {
  const normalized = normalizePhone(item.phone);
  const entry = recipientIndex ? recipientIndex.get(normalized) : null;
  const vars = buildVars(entry, normalized);

  const template = (entry && typeof entry.message === "string" && entry.message.trim()) ? entry.message : campaign.message;
  const text = applyVariables((template || "").trim(), vars).trim();

  if (text) {
    await sendTextMessage(item.phone, text);
  }

  if (Array.isArray(mediaList) && mediaList.length) {
    for (const m of mediaList) {
      if (m && m.waMediaId) {
        const caption = applyVariables(String(m.caption || ""), vars);
        await sendMediaMessageById(item.phone, { id: m.waMediaId, mimetype: m.type, filename: m.name }, caption);
      }
    }
  }
}

async function getDueCampaigns() {
  const now = new Date();
  return prisma.campaign.findMany({
    where: {
      status: { in: ["PENDING", "RUNNING"] },
      scheduleAt: { lte: now }
    },
    orderBy: { scheduleAt: "asc" },
    take: 5
  });
}

async function getCampaignStatus(id) {
  const c = await prisma.campaign.findUnique({ where: { id }, select: { status: true } });
  return c?.status || null;
}

async function processCampaign(campaign) {
  // Start campaign
  if (campaign.status === "PENDING") {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "RUNNING", startedAt: new Date() }
    });
  }

  // Load recipient personalization index once
  const recipientIndex = buildRecipientIndex(campaign.messages);

  // Load media list and ensure media is uploaded once per campaign
  let mediaList = [];
  if (campaign.media) {
    const parsed = safeJsonParse(campaign.media, []);
    if (Array.isArray(parsed)) {
      mediaList = parsed;
    }

    // upload if needed
    let changed = false;
    for (const m of mediaList) {
      if (!m || m.waMediaId) continue;
      if (!m.base64) continue;
      try {
        const up = await uploadMediaFromDataUrl(m.base64, m.name, m.type);
        m.waMediaId = up.id;
        changed = true;
      } catch (e) {
        // keep going, but worker will fail on send if media missing
        m.uploadError = String(e?.message || e);
        changed = true;
      }
    }

    if (changed) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { media: JSON.stringify(mediaList) }
      });
    }
  }

  const batchSize = campaign.batchSize || 5;
  const intervalSeconds = campaign.intervalSeconds || 2;

  // Loop until no more pending items or campaign is paused/cancelled
  while (true) {
    const status = await getCampaignStatus(campaign.id);
    if (status === "PAUSED" || status === "CANCELLED") {
      return;
    }

    const items = await prisma.campaignItem.findMany({
      where: {
        campaignId: campaign.id,
        status: { in: ["PENDING", "ERROR"] },
        retries: { lt: 3 }
      },
      orderBy: { id: "asc" },
      take: batchSize
    });

    if (!items.length) break;

    for (const item of items) {
      // Quick check between each send to allow pause/cancel to take effect
      const statusNow = await getCampaignStatus(campaign.id);
      if (statusNow === "PAUSED" || statusNow === "CANCELLED") {
        return;
      }

      try {
        await prisma.campaignItem.update({
          where: { id: item.id },
          data: { status: "SENDING" }
        });

        await sendCampaignItem(item, campaign, mediaList, recipientIndex);

        await prisma.campaignItem.update({
          where: { id: item.id },
          data: {
            status: "SENT",
            sentAt: new Date(),
            error: null
          }
        });
      } catch (e) {
        await prisma.campaignItem.update({
          where: { id: item.id },
          data: {
            status: "ERROR",
            retries: { increment: 1 },
            error: String(e?.message || e)
          }
        });
      }

      await sleep(intervalSeconds * 1000);
    }
  }

  // If we reached here, campaign has no more pending/error-retryable items.
  const finalStatus = await getCampaignStatus(campaign.id);
  if (finalStatus === "RUNNING") {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "COMPLETED", finishedAt: new Date() }
    });
  }
}

let running = false;
async function tick() {
  if (running) return;
  running = true;

  try {
    const due = await getDueCampaigns();
    for (const camp of due) {
      try {
        await processCampaign(camp);
      } catch (e) {
        await prisma.campaign.update({
          where: { id: camp.id },
          data: { status: "FAILED", finishedAt: new Date() }
        });
      }
    }
  } catch (e) {
    // swallow loop errors (log externally if needed)
  } finally {
    running = false;
  }
}

function startCampaignWorker() {
  setInterval(tick, TICK_MS);
  tick();
}

module.exports = { startCampaignWorker };
