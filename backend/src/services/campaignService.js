const prisma = require("../prisma");

/**
 * Normalize phone numbers to WhatsApp Cloud API format (digits only, with country code).
 * This keeps the DB consistent and avoids issues in the worker.
 */
function cleanPhone(raw) {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  // strip international prefix 00
  return digits.startsWith("00") ? digits.slice(2) : digits;
}

function extractPhones(messages) {
  if (!Array.isArray(messages)) return [];
  const phones = [];
  for (const m of messages) {
    const p = cleanPhone(m?.phone || m?.to || m?.numero || m?.whatsapp);
    if (p) phones.push(p);
  }
  return phones;
}

/**
 * Media payload expected:
 *  - { name, size, type (mime), base64: "data:<mime>;base64,..." }
 * We keep waMediaId / waMimeType for worker enrichment.
 */
function sanitizeMedia(media) {
  if (!media) return null;
  const arr = Array.isArray(media) ? media : [media];

  const out = [];
  for (const m of arr) {
    if (!m || typeof m !== "object") continue;

    const name = String(m.name || m.filename || "arquivo").slice(0, 120);
    const type = String(m.type || m.mimeType || "").slice(0, 120);
    const size = Number(m.size || 0) || 0;

    // base64 can come either as full dataUrl (preferred) or raw base64
    let base64 = m.base64;
    if (!base64 && m.dataUrl) base64 = m.dataUrl;
    if (base64 && typeof base64 === "string" && !base64.startsWith("data:")) {
      // assume raw base64 and convert to dataUrl if type is present
      if (type) base64 = `data:${type};base64,${base64}`;
    }

    // Allow media already uploaded (waMediaId)
    const waMediaId = m.waMediaId ? String(m.waMediaId) : null;
    const waMimeType = m.waMimeType ? String(m.waMimeType) : null;

    // If there is no waMediaId, we need base64 dataUrl
    if (!waMediaId) {
      if (!base64 || typeof base64 !== "string" || !base64.startsWith("data:")) {
        continue;
      }
    }

    out.push({
      name,
      size,
      type,
      base64: base64 || null,
      waMediaId,
      waMimeType
    });
  }

  return out.length ? out : null;
}

async function createCampaign({
  numbers,
  message,
  media,
  batchSize,
  intervalSeconds,
  scheduleAt,
  messages,
  senderProfile
}) {
  // Support passing personalized recipients as "messages".
  // In that case we derive numbers from messages.
  let phones = Array.isArray(numbers) ? numbers : [];
  if ((!phones || !phones.length) && messages) {
    phones = extractPhones(messages);
  }

  phones = Array.from(new Set(phones.map(cleanPhone).filter(Boolean)));
  if (!phones.length) {
    throw new Error("Lista de números vazia");
  }

  const safeMedia = sanitizeMedia(media);

  const campaign = await prisma.campaign.create({
    data: {
      status: "PENDING",
      message: String(message || ""),
      media: safeMedia ? JSON.stringify(safeMedia) : null,
      messages: messages ? JSON.stringify(messages) : null,
      scheduleAt: scheduleAt ? new Date(scheduleAt) : new Date(),
      batchSize: batchSize ? Number(batchSize) : 5,
      intervalSeconds: intervalSeconds ? Number(intervalSeconds) : 1,
      senderProfile: senderProfile || null,
      items: {
        create: phones.map((p) => ({ phone: p }))
      }
    }
  });

  return campaign;
}

/**
 * Returns campaigns with a lightweight summary (`counts`) by default.
 * If includeItems=true, it also returns the last items information.
 */
async function listCampaigns({ includeItems = false } = {}) {
  const campaigns = await prisma.campaign.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    ...(includeItems
      ? {
          include: {
            items: {
              select: {
                id: true,
                phone: true,
                status: true,
                sentAt: true,
                error: true,
                retries: true
              }
            }
          }
        }
      : {
          select: {
            id: true,
            status: true,
            message: true,
            scheduleAt: true,
            createdAt: true,
            batchSize: true,
            intervalSeconds: true,
            senderProfile: true
          }
        })
  });

  if (!campaigns.length) return [];

  const ids = campaigns.map((c) => c.id);
  const grouped = await prisma.campaignItem.groupBy({
    by: ["campaignId", "status"],
    where: { campaignId: { in: ids } },
    _count: { _all: true }
  });

  const countsByCampaign = new Map();
  for (const g of grouped) {
    if (!countsByCampaign.has(g.campaignId)) countsByCampaign.set(g.campaignId, {});
    countsByCampaign.get(g.campaignId)[g.status] = g._count._all;
  }

  return campaigns.map((c) => {
    const raw = countsByCampaign.get(c.id) || {};
    const pending = (raw.PENDING || 0) + (raw.SENDING || 0);
    const sent = raw.SENT || 0;
    const failed = (raw.ERROR || 0) + (raw.FAILED || 0);
    const cancelled = raw.CANCELLED || 0;
    const total = Object.values(raw).reduce((a, b) => a + (Number(b) || 0), 0);

    return {
      ...c,
      counts: { total, pending, sent, failed, errors: failed, cancelled }
    };
  });
}

async function getCampaign(id, { includeItems = true } = {}) {
  if (!id) throw new Error("id é obrigatório");

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    ...(includeItems
      ? {
          include: {
            items: {
              select: {
                id: true,
                phone: true,
                status: true,
                sentAt: true,
                error: true,
                retries: true
              },
              orderBy: { createdAt: "asc" }
            }
          }
        }
      : {
          select: {
            id: true,
            status: true,
            message: true,
            scheduleAt: true,
            createdAt: true,
            batchSize: true,
            intervalSeconds: true,
            senderProfile: true
          }
        })
  });

  if (!campaign) return null;

  const grouped = await prisma.campaignItem.groupBy({
    by: ["status"],
    where: { campaignId: id },
    _count: { _all: true }
  });

  const raw = {};
  for (const g of grouped) raw[g.status] = g._count._all;
  const pending = (raw.PENDING || 0) + (raw.SENDING || 0);
  const sent = raw.SENT || 0;
  const failed = (raw.ERROR || 0) + (raw.FAILED || 0);
  const cancelled = raw.CANCELLED || 0;
  const total = Object.values(raw).reduce((a, b) => a + (Number(b) || 0), 0);

  return { ...campaign, counts: { total, pending, sent, failed, errors: failed, cancelled } };
}

async function pauseCampaign(id) {
  return prisma.campaign.update({
    where: { id },
    data: { status: "PAUSED" }
  });
}

async function resumeCampaign(id) {
  // Resume either a paused campaign or a pending one.
  const c = await prisma.campaign.findUnique({ where: { id }, select: { status: true } });
  if (!c) throw new Error("Campanha não encontrada");

  const next = c.status === "PAUSED" ? "RUNNING" : c.status;
  return prisma.campaign.update({ where: { id }, data: { status: next } });
}

async function cancelCampaign(id) {
  // Mark campaign as cancelled and mark remaining items as cancelled (keep SENT as is).
  const updated = await prisma.campaign.update({
    where: { id },
    data: { status: "CANCELLED" }
  });

  await prisma.campaignItem.updateMany({
    where: {
      campaignId: id,
      status: { in: ["PENDING", "SENDING", "ERROR", "FAILED"] }
    },
    data: { status: "CANCELLED" }
  });

  return updated;
}

module.exports = {
  createCampaign,
  listCampaigns,
  getCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign
};
