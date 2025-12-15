const express = require("express");
const router = express.Router();
const { generateReply, generateInsights, generateSmartReplies, chat } = require("../services/aiService");
const aiTraining = require("../services/aiTrainingService");
const { getOpenAIStatus } = require("../services/settingsService");
const { ensureMasterLicenseRecord, MASTER_KEY } = require("../services/licenseService");
const prisma = require("../prisma");

// Custo simples de 1 crédito por chamada de IA.
// Você pode ajustar este valor depois (ex.: 2 créditos por insights, etc.).
const AI_COST_PER_CALL = 1;

async function ensureAiLicense(req, res) {
  const licenseKey = req.headers["x-license-key"];
  if (!licenseKey) {
    res.status(401).json({ error: "License key obrigatória para operações de IA." });
    return null;
  }

  // Master key: sempre válida, sem bloqueio por plano.
  if (licenseKey === MASTER_KEY) {
    try {
      const master = await ensureMasterLicenseRecord();
      return master;
    } catch (e) {
      res.status(500).json({ error: "Falha ao validar master key." });
      return null;
    }
  }

  // Prisma Client usa o nome do model em lowerCamelCase (LicenseKey -> licenseKey)
  const license = await prisma.licenseKey.findUnique({
    where: { key: licenseKey }
  });

  if (!license || license.status !== "ACTIVE") {
    res.status(401).json({ error: "Licença inválida ou inativa." });
    return null;
  }

  // Trial expirado?
  if (license.trial && license.trialEndsAt && license.trialEndsAt.getTime() < Date.now()) {
    res.status(401).json({ error: "Período de trial desta licença expirou." });
    return null;
  }

  if (!license.aiEnabled || license.aiCredits <= 0) {
    res.status(402).json({
      error: "Sem créditos de IA disponíveis.",
      aiCredits: license.aiCredits
    });
    return null;
  }

  return license;
}

// Valida licença (sem exigir créditos/IA habilitada) — útil para telas de configuração/treinamento.
async function ensureValidLicense(req, res) {
  const licenseKey = req.headers["x-license-key"];
  if (!licenseKey) {
    res.status(401).json({ error: "License key obrigatória." });
    return null;
  }

  // Master key: sempre válida
  if (licenseKey === MASTER_KEY) {
    try {
      const master = await ensureMasterLicenseRecord();
      return master;
    } catch (e) {
      res.status(500).json({ error: "Falha ao validar master key." });
      return null;
    }
  }

  const license = await prisma.licenseKey.findUnique({ where: { key: licenseKey } });

  if (!license || license.status !== "ACTIVE") {
    res.status(401).json({ error: "Licença inválida ou inativa." });
    return null;
  }

  if (license.trial && license.trialEndsAt && license.trialEndsAt.getTime() < Date.now()) {
    res.status(401).json({ error: "Período de trial desta licença expirou." });
    return null;
  }

  return license;
}


/**
 * Reserva (decrementa) créditos de IA de forma atômica para evitar corrida.
 * Em caso de erro posterior, é possível reembolsar com refundAiCredits.
 */
async function reserveAiCreditsOrFail(license, req, res, cost = AI_COST_PER_CALL) {
  if (!license) return null;

  const updated = await prisma.licenseKey.updateMany({
    where: {
      id: license.id,
      status: "ACTIVE",
      aiEnabled: true,
      aiCredits: { gte: cost }
    },
    data: {
      aiCredits: { decrement: cost }
    }
  });

  if (!updated || updated.count === 0) {
    // Sem créditos (ou licenças alteradas concorrente)
    const fresh = await prisma.licenseKey.findUnique({ where: { id: license.id } });
    res.status(402).json({
      error: "Sem créditos de IA disponíveis.",
      aiCredits: fresh?.aiCredits ?? 0
    });
    return null;
  }

  return prisma.licenseKey.findUnique({ where: { id: license.id } });
}

async function refundAiCredits(licenseId, cost = AI_COST_PER_CALL) {
  if (!licenseId) return;
  try {
    await prisma.licenseKey.update({
      where: { id: licenseId },
      data: { aiCredits: { increment: cost } }
    });
  } catch (e) {
    console.warn("[AI] Falha ao reembolsar créditos:", e?.message || e);
  }
}

router.post("/reply", async (req, res) => {
  let reservedLicenseId = null;
  try {
    const { contactName, messages, tone, chatExternalId } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages obrigatórias" });
    }

    const license = await ensureAiLicense(req, res);
    if (!license) return;

    const reserved = await reserveAiCreditsOrFail(license, req, res);
    if (!reserved) return;

    reservedLicenseId = reserved.id;

    const name = contactName || "Contato";

    // Contexto do negócio + memória por contato (RAG leve)
    let businessContext = "";
    try {
      businessContext = await aiTraining.buildBusinessContextText(license.key, {
        chatExternalId: chatExternalId || null,
        contactName: name,
        messages,
      });
    } catch (e) {
      // fallback silencioso (não quebra o fluxo)
      businessContext = "";
    }

    const result = await generateReply({ contactName: name, messages, tone, businessContext });
    const reply = result?.reply || "";

    // Registra interação para aprendizado / prontidão do copiloto
    const interactionId = await aiTraining.recordInteraction(license.key, {
      type: "ai_reply",
      chatExternalId: chatExternalId || null,
      contactName: name,
      payload: { messages, reply, tone },
      tokensUsed: result?.usage || null,
      model: result?.model || null,
    });

    res.json({ reply, interactionId, aiCreditsRemaining: reserved.aiCredits });
  } catch (e) {
    console.error(e);
    // Se deu erro DEPOIS de reservar crédito, reembolsar (best-effort)
    if (reservedLicenseId) {
      await refundAiCredits(reservedLicenseId);
    }
    res.status(500).json({ error: e.message });
  }
});

router.post("/insights", async (req, res) => {
  let reservedLicenseId = null;
  try {
    const { contactName, messages, chatExternalId } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages obrigatórias" });
    }

    const license = await ensureAiLicense(req, res);
    if (!license) return;

    const reserved = await reserveAiCreditsOrFail(license, req, res);
    if (!reserved) return;

    reservedLicenseId = reserved.id;

    const name = contactName || "Contato";

    let businessContext = "";
    try {
      businessContext = await aiTraining.buildBusinessContextText(license.key, {
        chatExternalId: chatExternalId || null,
        contactName: name,
        messages,
      });
    } catch (_) {
      businessContext = "";
    }

    const result = await generateInsights({ contactName: name, messages, businessContext });
    const insights = result?.insights || {};

    const interactionId = await aiTraining.recordInteraction(license.key, {
      type: "ai_insights",
      chatExternalId: chatExternalId || null,
      contactName: name,
      payload: { messages, insights },
      tokensUsed: result?.usage || null,
      model: result?.model || null,
    });

    res.json({
      ...insights,
      interactionId,
      aiCreditsRemaining: reserved.aiCredits
    });
  } catch (e) {
    console.error(e);
    if (reservedLicenseId) {
      await refundAiCredits(reservedLicenseId);
    }
    res.status(500).json({ error: e.message });
  }
});

// Smart replies específicas para o balão flutuante de sugestões
router.post("/smart-replies", async (req, res) => {
  let reservedLicenseId = null;
  try {
    const { message, language, transliterate, emojiEnabled, forceSelectedLanguage, userName, chatExternalId, contactName } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message é obrigatório" });
    }

    const license = await ensureAiLicense(req, res);
    if (!license) return;

    const reserved = await reserveAiCreditsOrFail(license, req, res);
    if (!reserved) return;

    reservedLicenseId = reserved.id;

    const name = contactName || "Contato";

    let businessContext = "";
    try {
      businessContext = await aiTraining.buildBusinessContextText(license.key, {
        chatExternalId: chatExternalId || null,
        contactName: name,
        messages: [message],
      });
    } catch (_) {
      businessContext = "";
    }

    const result = await generateSmartReplies({
      message,
      language: language || "Portuguese",
      transliterate: !!transliterate,
      emojiEnabled: emojiEnabled !== false,
      forceSelectedLanguage: !!forceSelectedLanguage,
      userName: userName || null,
      businessContext
    });

    const replies = result?.replies || [];

    const interactionId = await aiTraining.recordInteraction(license.key, {
      type: "ai_smart_replies",
      chatExternalId: chatExternalId || null,
      contactName: name,
      payload: { message, replies },
      tokensUsed: result?.usage || null,
      model: result?.model || null,
    });

    res.json({
      replies,
      interactionId,
      aiCreditsRemaining: reserved.aiCredits
    });
  } catch (e) {
    console.error(e);
    if (reservedLicenseId) {
      await refundAiCredits(reservedLicenseId);
    }
    res.status(500).json({ error: e.message });
  }
});

// Endpoint genérico para Copilot/Chatbot (messages + systemPrompt)
router.post("/chat", async (req, res) => {
  let reservedLicenseId = null;
  try {
    const { messages, systemPrompt, model, temperature, maxTokens, chatExternalId, contactName } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages obrigatórias" });
    }

    const license = await ensureAiLicense(req, res);
    if (!license) return;

    const reserved = await reserveAiCreditsOrFail(license, req, res);
    if (!reserved) return;

    reservedLicenseId = reserved.id;

    const name = contactName || "Contato";
    const textMsgs = messages
      .map((m) => (typeof m === "string" ? m : (m && typeof m.content === "string" ? m.content : "")))
      .filter(Boolean)
      .slice(-10);

    let businessContext = "";
    try {
      businessContext = await aiTraining.buildBusinessContextText(license.key, {
        chatExternalId: chatExternalId || null,
        contactName: name,
        messages: textMsgs,
      });
    } catch (_) {
      businessContext = "";
    }

    const mergedSystemPrompt = `${systemPrompt || ""}

${businessContext || ""}`.trim();

    const result = await chat({
      messages,
      systemPrompt: mergedSystemPrompt,
      model,
      temperature,
      maxTokens: typeof maxTokens === "number" ? maxTokens : 500
    });

    const interactionId = await aiTraining.recordInteraction(license.key, {
      type: "ai_chat",
      chatExternalId: chatExternalId || null,
      contactName: name,
      payload: { messages: textMsgs, content: result?.content || "" },
      tokensUsed: result?.usage || null,
      model: result?.model || null,
    });

    res.json({
      ...result,
      interactionId,
      aiCreditsRemaining: reserved.aiCredits
    });
  } catch (e) {
    console.error(e);
    if (reservedLicenseId) {
      await refundAiCredits(reservedLicenseId);
    }
    res.status(500).json({ error: e.message });
  }
});



// -----------------------------------------------------------------------------
// Centro de Treinamento da IA (regras + conhecimento + memória)
// -----------------------------------------------------------------------------
// Observação: endpoints de leitura (state/policy/suggestions/knowledge) NÃO consomem créditos.
// Endpoints que chamam a OpenAI (ingest/gerar sugestões) consomem 1 crédito por padrão.

router.get("/training/state", async (req, res) => {
  try {
    const license = await ensureValidLicense(req, res);
    if (!license) return;

    const state = await aiTraining.getTrainingState(license.key);

    res.json({
      ...state,
      plan: license.plan,
      aiEnabled: !!license.aiEnabled,
      aiCredits: license.aiCredits
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/training/policy", async (req, res) => {
  try {
    const license = await ensureValidLicense(req, res);
    if (!license) return;
    const policy = await aiTraining.getPolicyYaml(license.key);
    res.json({ policy });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/training/policy", async (req, res) => {
  try {
    const license = await ensureValidLicense(req, res);
    if (!license) return;
    const { policy } = req.body || {};
    const saved = await aiTraining.setPolicyYaml(license.key, policy || "");
    res.json({ policy: saved });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/training/suggestions", async (req, res) => {
  try {
    const license = await ensureValidLicense(req, res);
    if (!license) return;
    const suggestions = await aiTraining.getSuggestionsYaml(license.key);
    res.json({ suggestions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/training/apply-suggestions", async (req, res) => {
  try {
    const license = await ensureValidLicense(req, res);
    if (!license) return;
    const policy = await aiTraining.applySuggestions(license.key);
    res.json({ policy });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/training/knowledge", async (req, res) => {
  try {
    const license = await ensureValidLicense(req, res);
    if (!license) return;
    const items = await aiTraining.listKnowledge(license.key);
    res.json({ items: (items || []).map((i) => ({ ...i, embedding: undefined })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/training/knowledge/:id", async (req, res) => {
  try {
    const license = await ensureValidLicense(req, res);
    if (!license) return;
    const id = req.params.id;
    await aiTraining.deleteKnowledge(license.key, id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/training/feedback", async (req, res) => {
  try {
    const license = await ensureValidLicense(req, res);
    if (!license) return;

    const { interactionId, chatExternalId, feedbackType, editedText, originalText } = req.body || {};
    if (!feedbackType) {
      return res.status(400).json({ error: "feedbackType é obrigatório (approved|edited|rejected)" });
    }

    const metrics = await aiTraining.addFeedback(license.key, {
      interactionId,
      chatExternalId,
      feedbackType,
      editedText,
      originalText
    });

    res.json({ ok: true, metrics });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Ingestão (consome créditos)
router.post("/training/ingest/text", async (req, res) => {
  let reservedLicenseId = null;
  try {
    const { title, text, sourceType, metadata } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text é obrigatório" });
    }

    const license = await ensureAiLicense(req, res);
    if (!license) return;

    const reserved = await reserveAiCreditsOrFail(license, req, res, 1);
    if (!reserved) return;
    reservedLicenseId = reserved.id;

    const item = await aiTraining.ingestText(license.key, {
      title: title || "Treinamento",
      text,
      sourceType: sourceType || "text",
      metadata: metadata || {}
    });

    res.json({ ok: true, item: { ...item, embedding: undefined }, aiCreditsRemaining: reserved.aiCredits });
  } catch (e) {
    console.error(e);
    if (reservedLicenseId) await refundAiCredits(reservedLicenseId, 1);
    res.status(500).json({ error: e.message });
  }
});

router.post("/training/ingest/file", async (req, res) => {
  let reservedLicenseId = null;
  try {
    const { fileName, base64, mimeType } = req.body || {};
    if (!base64 || typeof base64 !== "string") {
      return res.status(400).json({ error: "base64 é obrigatório" });
    }

    const license = await ensureAiLicense(req, res);
    if (!license) return;

    const reserved = await reserveAiCreditsOrFail(license, req, res, 1);
    if (!reserved) return;
    reservedLicenseId = reserved.id;

    const item = await aiTraining.ingestFileText(license.key, { fileName, base64, mimeType });
    res.json({ ok: true, item: { ...item, embedding: undefined }, aiCreditsRemaining: reserved.aiCredits });
  } catch (e) {
    console.error(e);
    if (reservedLicenseId) await refundAiCredits(reservedLicenseId, 1);
    res.status(500).json({ error: e.message });
  }
});

router.post("/training/ingest/audio", async (req, res) => {
  let reservedLicenseId = null;
  try {
    const { title, base64, mimeType } = req.body || {};
    if (!base64 || typeof base64 !== "string") {
      return res.status(400).json({ error: "base64 é obrigatório" });
    }

    const license = await ensureAiLicense(req, res);
    if (!license) return;

    const reserved = await reserveAiCreditsOrFail(license, req, res, 2);
    if (!reserved) return;
    reservedLicenseId = reserved.id;

    const result = await aiTraining.ingestAudio(license.key, { title: title || "Áudio", base64, mimeType });
    res.json({ ok: true, transcript: result.transcript, item: { ...result.item, embedding: undefined }, aiCreditsRemaining: reserved.aiCredits });
  } catch (e) {
    console.error(e);
    if (reservedLicenseId) await refundAiCredits(reservedLicenseId, 2);
    res.status(500).json({ error: e.message });
  }
});

// Import do sistema (CRM/tags/pipeline) — consome 1 crédito (embeddings)
router.post("/training/ingest/system", async (req, res) => {
  let reservedLicenseId = null;
  try {
    const { title, data } = req.body || {};
    if (!data) {
      return res.status(400).json({ error: "data é obrigatório" });
    }

    const license = await ensureAiLicense(req, res);
    if (!license) return;

    const reserved = await reserveAiCreditsOrFail(license, req, res, 1);
    if (!reserved) return;
    reservedLicenseId = reserved.id;

    const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    const item = await aiTraining.ingestText(license.key, {
      title: title || "Import do sistema",
      text,
      sourceType: "system",
      metadata: { importedAt: new Date().toISOString() }
    });

    res.json({ ok: true, item: { ...item, embedding: undefined }, aiCreditsRemaining: reserved.aiCredits });
  } catch (e) {
    console.error(e);
    if (reservedLicenseId) await refundAiCredits(reservedLicenseId, 1);
    res.status(500).json({ error: e.message });
  }
});

// Gerar sugestões (consome 2 créditos)
router.post("/training/generate-suggestions", async (req, res) => {
  let reservedLicenseId = null;
  try {
    const { limit } = req.body || {};

    const license = await ensureAiLicense(req, res);
    if (!license) return;

    const reserved = await reserveAiCreditsOrFail(license, req, res, 2);
    if (!reserved) return;

    reservedLicenseId = reserved.id;

    const result = await aiTraining.generateSuggestionsFromHistory(license.key, {
      limit: typeof limit === "number" ? limit : 40
    });

    res.json({
      ok: true,
      generated: !!result.generated,
      suggestions: result.suggestions,
      aiCreditsRemaining: reserved.aiCredits
    });
  } catch (e) {
    console.error(e);
    if (reservedLicenseId) await refundAiCredits(reservedLicenseId, 2);
    res.status(500).json({ error: e.message });
  }
});

router.post("/training/autotrain", async (req, res) => {
  try {
    const license = await ensureValidLicense(req, res);
    if (!license) return;
    const { enabled } = req.body || {};
    const ok = await aiTraining.setAutoTrainEnabled(license.key, !!enabled);
    res.json({ ok: true, enabled: ok });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health/status da IA (não consome créditos)
router.get("/status", async (req, res) => {
  try {
    const status = await getOpenAIStatus();
    res.json(status);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = { router };