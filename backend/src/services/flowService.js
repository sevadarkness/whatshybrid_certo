const prisma = require("../prisma");

function safeParseConfig(value) {
  if (typeof value !== "string" || !value) return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    // Dado legado/corrompido: não quebrar a API.
    return value;
  }
}

async function getFlows() {
  const rows = await prisma.flow.findMany({
    orderBy: { createdAt: "asc" },
  });

  // Desserializar config salvo como string
  return rows.map((r) => ({
    ...r,
    config: safeParseConfig(r.config),
  }));
}

async function saveFlows(flows) {
  await prisma.flow.deleteMany({});
  for (const f of flows) {
    await prisma.flow.create({
      data: {
        name: f.name || "Flow sem nome",
        active: typeof f.active === "boolean" ? f.active : true,
        // Salvar config como JSON serializado (compatibilidade com sqlite)
        config: JSON.stringify(f),
      },
    });
  }
}

async function handleMessageEvent(event, dealId) {
  const flows = await getFlows();
  let payload = event.payload;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch (_) {
      /* ignore */
    }
  }
  const text = (payload && payload.text) || "";
  for (const f of flows) {
    if (!f.active) continue;
    let cfg = f.config;
    if (typeof cfg === "string") {
      try {
        cfg = JSON.parse(cfg);
      } catch (_) {
        cfg = null;
      }
    }
    if (!cfg || !cfg.trigger) continue;
    if (cfg.trigger.type === "message_contains") {
      const needle = (cfg.trigger.text || "").toLowerCase();
      if (!needle) continue;
      if (!text.toLowerCase().includes(needle)) continue;
    } else {
      continue;
    }

    if (Array.isArray(cfg.actions)) {
      for (const action of cfg.actions) {
        if (action && action.type === "move_stage") {
          const stage = action.stage || action.to || action.value;
          if (stage) {
            await prisma.deal.update({
              where: { id: dealId },
              data: { stage },
            });
          }
        }

        if (action && action.type === "create_task") {
          let dueAt = null;
          if (action.dueAt) {
            const parsed = new Date(action.dueAt);
            if (!Number.isNaN(parsed.getTime())) dueAt = parsed;
          } else {
            const minutes = Number(action.dueInMinutes);
            if (Number.isFinite(minutes) && minutes > 0) {
              dueAt = new Date(Date.now() + minutes * 60 * 1000);
            }
          }

          await prisma.task.create({
            data: {
              title: action.title || `Follow-up flow: ${f.name}`,
              description: action.description || text,
              status: "todo",
              dueAt,
              dealId,
              assigneeId: action.assigneeId || null,
            },
          });
        }
      }
    }
  }
}

module.exports = {
  getFlows,
  saveFlows,
  handleMessageEvent,
};
