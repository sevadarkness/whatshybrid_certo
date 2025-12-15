const express = require("express");
const router = express.Router();
const { handleMessageEvent } = require("../services/flowService");
const { upsertDeal } = require("../services/crmService");
const prisma = require("../prisma");

let ioInstance = null;
function attachIO(io) {
  ioInstance = io;
}

router.post("/message", async (req, res) => {
  try {
    const { type, chatExternalId, contactName, payload } = req.body || {};
    // registra deal básico se tiver chatExternalId
    let dealId = null;
    if (chatExternalId) {
      const upserted = await upsertDeal({ externalId: chatExternalId, name: contactName });
      dealId = upserted.id;
    }

    const ev = await prisma.messageEvent.create({
      data: {
        type: type || "unknown",
        chatExternalId,
        contactName,
        // Salvar payload serializado (string) devido a limitations do sqlite/prisma
        payload: typeof payload === 'string' ? payload : JSON.stringify(payload || null),
        dealId,
      },
    });

    if (ioInstance) {
      let emittedPayload = ev.payload;
      try { if (typeof emittedPayload === 'string') emittedPayload = JSON.parse(emittedPayload); } catch (_) {}
      ioInstance.emit("messageEvent", {
        id: ev.id,
        type: ev.type,
        chatExternalId: ev.chatExternalId,
        contactName: ev.contactName,
        payload: emittedPayload,
        createdAt: ev.createdAt,
      });
    }

    // Ainda emitimos o object parsed para handlers internos em memória
    let parsedPayload = payload;
    try {
      if (typeof parsedPayload === 'string') parsedPayload = JSON.parse(parsedPayload);
    } catch (e) {
      // ignore parsing error, keep original string
    }

    if (type === "incoming_message" && dealId) {
      await handleMessageEvent({ payload: parsedPayload }, dealId);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/extension-error', async (req, res) => {
  try {
    console.warn('[EXTENSION_ERROR]', req.headers['x-extension-key'] || '', req.body);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/extension-error/bulk', async (req, res) => {
  try {
    console.warn('[EXTENSION_ERROR_BULK]', req.headers['x-extension-key'] || '', req.body);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = { router, attachIO };
