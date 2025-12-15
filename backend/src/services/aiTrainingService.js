
// backend/src/services/aiTrainingService.js
//
// Centro de treinamento da IA (legacy routes /ai/*)
// - Mantém "policy" (regras oficiais) + "learned suggestions" (sugestões geradas pela IA)
// - Ingestão de conhecimento via texto/arquivo/áudio (transcrição) -> base local + embeddings
// - Memória por contato (chatExternalId) para respostas mais contextuais
//
// IMPORTANTES:
// - Não expõe chave OpenAI no cliente (usa settingsService + DB).
// - Não altera schema do Prisma (usa AppSetting para persistência).

const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const prisma = require('../prisma');
const log = {
  info: (...args) => { try { console.log('[AITraining]', ...args); } catch (_) {} },
  warn: (...args) => { try { console.warn('[AITraining]', ...args); } catch (_) {} },
};
const { getOpenAIKey } = require('./settingsService');

const KB_MAX_ITEMS = 300;
const KB_MAX_CONTENT_CHARS = 12000;
const POLICY_MAX_CHARS = 15000;
const SUGGESTIONS_MAX_CHARS = 15000;

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1';

const MODEL_TEXT = process.env.OPENAI_MODEL || 'gpt-4o';

const KEYS = {
  policy: (licenseKey) => `ai_policy_yaml::${licenseKey}`,
  suggestions: (licenseKey) => `ai_learned_suggestions_yaml::${licenseKey}`,
  kb: (licenseKey) => `ai_kb_json::${licenseKey}`,
  contactMemory: (licenseKey, chatExternalId) => `ai_contact_memory_json::${licenseKey}::${chatExternalId || 'unknown'}`,
  metrics: (licenseKey) => `ai_training_metrics_json::${licenseKey}`,
  autotrainEnabled: (licenseKey) => `ai_autotrain_enabled::${licenseKey}`,
  autotrainLastRun: (licenseKey) => `ai_autotrain_last_run::${licenseKey}`,
};

let _openaiClient = null;
let _cachedKey = null;
let _keyCheckedAt = 0;
const KEY_TTL_MS = 10_000;

async function getOpenAIClient() {
  const now = Date.now();
  if (_openaiClient && _cachedKey && (now - _keyCheckedAt) < KEY_TTL_MS) {
    return _openaiClient;
  }
  const key = await getOpenAIKey();
  _cachedKey = key;
  _keyCheckedAt = now;
  _openaiClient = new OpenAI({ apiKey: key });
  return _openaiClient;
}

async function getSettingValue(key) {
  const found = await prisma.appSetting.findUnique({ where: { key } });
  return found?.value || null;
}

async function setSettingValue(key, value) {
  if (typeof value !== 'string') value = JSON.stringify(value);
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  return true;
}

async function deleteSettingValue(key) {
  try {
    await prisma.appSetting.delete({ where: { key } });
  } catch (e) {
    // ignore if missing
  }
}

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch (_) { return fallback; }
}

function clampText(s, maxChars) {
  if (!s) return '';
  const t = String(s);
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars) + '\n\n[...]';
}

function newId(prefix='kb') {
  return `${prefix}_${crypto.randomUUID()}`;
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function ensureDefaults(licenseKey) {
  const policyKey = KEYS.policy(licenseKey);
  const suggKey = KEYS.suggestions(licenseKey);
  const kbKey = KEYS.kb(licenseKey);
  const metricsKey = KEYS.metrics(licenseKey);

  const [policy, suggestions, kb, metrics] = await Promise.all([
    getSettingValue(policyKey),
    getSettingValue(suggKey),
    getSettingValue(kbKey),
    getSettingValue(metricsKey),
  ]);

  if (!policy) {
    const initial = [
      '# Regras do Negócio (policy.yaml)',
      '',
      '## Tom e estilo',
      '- Seja claro, direto e humano.',
      '- Use português do Brasil.',
      '- Responda em 1 mensagem curta, a menos que o usuário peça detalhes.',
      '',
      '## Segurança',
      '- Não invente preços, datas, prazos ou condições. Se faltar informação, peça.',
      '- Nunca peça dados sensíveis desnecessários.',
      '',
      '## Operação',
      '- Se o cliente pedir preço, pergunte qual produto/serviço e envie a tabela oficial se existir no conhecimento.',
      '- Se o cliente reclamar, seja empático e ofereça solução.',
      '',
    ].join('\n');
    await setSettingValue(policyKey, initial);
  }

  if (!suggestions) {
    await setSettingValue(suggKey, '# Sugestões geradas pela IA (learned_suggestions.yaml)\n\n');
  }

  if (!kb) {
    await setSettingValue(kbKey, JSON.stringify([]));
  }

  if (!metrics) {
    await setSettingValue(metricsKey, JSON.stringify({
      totalInteractions: 0,
      approved: 0,
      edited: 0,
      rejected: 0,
      lastInteractionAt: null,
      lastSuggestionAt: null,
      readinessScore: 0,
    }));
  }
}

async function getPolicyYaml(licenseKey) {
  await ensureDefaults(licenseKey);
  const val = await getSettingValue(KEYS.policy(licenseKey));
  return clampText(val || '', POLICY_MAX_CHARS);
}

async function setPolicyYaml(licenseKey, yamlText) {
  await ensureDefaults(licenseKey);
  const clean = clampText(yamlText || '', POLICY_MAX_CHARS);
  await setSettingValue(KEYS.policy(licenseKey), clean);
  return clean;
}

async function getSuggestionsYaml(licenseKey) {
  await ensureDefaults(licenseKey);
  const val = await getSettingValue(KEYS.suggestions(licenseKey));
  return clampText(val || '', SUGGESTIONS_MAX_CHARS);
}

async function setSuggestionsYaml(licenseKey, yamlText) {
  await ensureDefaults(licenseKey);
  const clean = clampText(yamlText || '', SUGGESTIONS_MAX_CHARS);
  await setSettingValue(KEYS.suggestions(licenseKey), clean);
  return clean;
}

async function listKnowledge(licenseKey) {
  await ensureDefaults(licenseKey);
  const raw = await getSettingValue(KEYS.kb(licenseKey));
  const items = safeJsonParse(raw || '[]', []);
  return Array.isArray(items) ? items : [];
}

async function saveKnowledge(licenseKey, items) {
  const cleaned = Array.isArray(items) ? items.slice(0, KB_MAX_ITEMS) : [];
  await setSettingValue(KEYS.kb(licenseKey), JSON.stringify(cleaned));
  return cleaned;
}

async function generateEmbedding(text) {
  const client = await getOpenAIClient();
  const input = clampText(text, 8000);
  const res = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input,
  });
  const vec = res?.data?.[0]?.embedding || null;
  return vec;
}

async function ingestText(licenseKey, { title, text, sourceType='text', metadata={} }) {
  await ensureDefaults(licenseKey);
  const content = clampText(text || '', KB_MAX_CONTENT_CHARS).trim();
  if (!content) {
    throw new Error('Conteúdo vazio.');
  }

  const embedding = await generateEmbedding(content);

  const items = await listKnowledge(licenseKey);
  const now = new Date().toISOString();
  const item = {
    id: newId('kb'),
    title: (title || 'Texto').slice(0, 140),
    sourceType,
    content,
    embedding,
    createdAt: now,
    updatedAt: now,
    metadata,
  };

  const updated = [item, ...items].slice(0, KB_MAX_ITEMS);
  await saveKnowledge(licenseKey, updated);

  return item;
}

async function ingestFileText(licenseKey, { fileName, base64, mimeType }) {
  const name = fileName || 'Arquivo';
  const ext = (name.split('.').pop() || '').toLowerCase();
  const textish = (
    (mimeType || '').startsWith('text/') ||
    ['txt','md','csv','json','yaml','yml'].includes(ext)
  );

  if (!textish) {
    throw new Error('Formato de arquivo ainda não suportado. Use TXT/MD/CSV/JSON/YAML ou cole o conteúdo em texto.');
  }

  const buf = Buffer.from(base64 || '', 'base64');
  const content = buf.toString('utf-8');

  return ingestText(licenseKey, {
    title: `Arquivo: ${name}`,
    text: content,
    sourceType: 'file',
    metadata: { fileName: name, mimeType: mimeType || null },
  });
}

async function transcribeAudioBase64({ base64, fileExt='webm' }) {
  const client = await getOpenAIClient();
  const buf = Buffer.from(base64 || '', 'base64');
  if (!buf.length) throw new Error('Áudio vazio.');

  const os = require('os');

  const tmp = path.join(os.tmpdir(), `.tmp_audio_${Date.now()}_${crypto.randomUUID()}.${fileExt}`);
  fs.writeFileSync(tmp, buf);

  try {
    const res = await client.audio.transcriptions.create({
      file: fs.createReadStream(tmp),
      model: TRANSCRIBE_MODEL,
    });
    const text = (res && (res.text || res.data?.text)) ? (res.text || res.data?.text) : '';
    return String(text || '').trim();
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

async function ingestAudio(licenseKey, { title, base64, mimeType }) {
  await ensureDefaults(licenseKey);

  // Detecta extensão pelo mime
  let ext = 'webm';
  if (mimeType) {
    if (mimeType.includes('ogg')) ext = 'ogg';
    if (mimeType.includes('mpeg') || mimeType.includes('mp3')) ext = 'mp3';
    if (mimeType.includes('wav')) ext = 'wav';
    if (mimeType.includes('webm')) ext = 'webm';
    if (mimeType.includes('mp4')) ext = 'mp4';
  }

  const transcript = await transcribeAudioBase64({ base64, fileExt: ext });
  if (!transcript) throw new Error('Não foi possível transcrever o áudio.');

  const item = await ingestText(licenseKey, {
    title: title || 'Áudio (transcrito)',
    text: transcript,
    sourceType: 'audio',
    metadata: { mimeType: mimeType || null, transcribedAt: new Date().toISOString() },
  });

  return { transcript, item };
}

async function getContactMemory(licenseKey, chatExternalId) {
  await ensureDefaults(licenseKey);
  const raw = await getSettingValue(KEYS.contactMemory(licenseKey, chatExternalId));
  if (!raw) return null;
  const obj = safeJsonParse(raw, null);
  return obj;
}

async function setContactMemory(licenseKey, chatExternalId, memoryObj) {
  await ensureDefaults(licenseKey);
  await setSettingValue(KEYS.contactMemory(licenseKey, chatExternalId), JSON.stringify(memoryObj || {}));
  return memoryObj;
}

function buildHeuristicContactMemory({ contactName, messages }) {
  const joined = (messages || []).map((m) => String(m || '').trim()).filter(Boolean).slice(-12).join('\n');
  const snippet = clampText(joined, 1400);
  const topics = [];
  const t = joined.toLowerCase();
  if (t.includes('preço') || t.includes('valor') || t.includes('quanto')) topics.push('preço');
  if (t.includes('prazo') || t.includes('entrega')) topics.push('prazo');
  if (t.includes('horário') || t.includes('agenda')) topics.push('agendamento');
  if (t.includes('reclama') || t.includes('ruim') || t.includes('problema')) topics.push('suporte');
  return {
    contactName: contactName || null,
    topics,
    recentSnippet: snippet,
    updatedAt: new Date().toISOString(),
  };
}

async function getRelevantKnowledge(licenseKey, query, topK=4) {
  const items = await listKnowledge(licenseKey);
  const candidates = items.filter((i) => i && i.embedding && Array.isArray(i.embedding) && i.content);
  if (!candidates.length) return [];

  const qEmb = await generateEmbedding(query || '');
  if (!qEmb) return [];

  const scored = candidates.map((it) => ({
    item: it,
    score: cosineSimilarity(qEmb, it.embedding),
  })).sort((a,b) => b.score - a.score);

  return scored.slice(0, topK).map((s) => ({ ...s.item, _score: s.score }));
}

async function buildBusinessContextText(licenseKey, { chatExternalId, contactName, messages, extraContext }) {
  await ensureDefaults(licenseKey);

  const policy = await getPolicyYaml(licenseKey);
  const lastUserMsg = (messages || []).slice(-1)[0] || '';
  const query = [contactName || '', lastUserMsg || '', (messages || []).slice(-4).join('\n')].join('\n').trim();

  let memory = null;
  if (chatExternalId) {
    memory = await getContactMemory(licenseKey, chatExternalId);
    if (!memory) {
      memory = buildHeuristicContactMemory({ contactName, messages });
      await setContactMemory(licenseKey, chatExternalId, memory);
    }
  }

  let knowledge = [];
  try {
    knowledge = await getRelevantKnowledge(licenseKey, query, 4);
  } catch (e) {
    // se embeddings falharem, ignora
    knowledge = [];
  }

  const blocks = [];
  blocks.push('### CONTEXTO DO NEGÓCIO (use como referência, não invente fatos)\n');
  blocks.push('#### Regras oficiais\n');
  blocks.push(clampText(policy, 6000));

  if (memory) {
    blocks.push('\n\n#### Memória do contato\n');
    blocks.push(clampText(JSON.stringify(memory, null, 2), 1200));
  }

  if (Array.isArray(knowledge) && knowledge.length) {
    blocks.push('\n\n#### Conhecimento da empresa (treinamento)\n');
    knowledge.forEach((k, idx) => {
      blocks.push(`\n[${idx+1}] ${k.title}\n${clampText(k.content, 900)}`);
    });
  }

  if (extraContext) {
    blocks.push('\n\n#### Contexto adicional\n');
    blocks.push(clampText(extraContext, 1500));
  }

  return '\n' + blocks.join('\n') + '\n';
}

async function getMetrics(licenseKey) {
  await ensureDefaults(licenseKey);
  const raw = await getSettingValue(KEYS.metrics(licenseKey));
  return safeJsonParse(raw || '{}', {});
}

async function setMetrics(licenseKey, metrics) {
  await ensureDefaults(licenseKey);
  await setSettingValue(KEYS.metrics(licenseKey), JSON.stringify(metrics || {}));
  return metrics;
}

function computeReadiness(metrics) {
  const approved = metrics.approved || 0;
  const edited = metrics.edited || 0;
  const rejected = metrics.rejected || 0;
  const totalFeedback = approved + edited + rejected;
  if (totalFeedback < 10) return 0; // precisa de amostragem
  const acceptance = approved / totalFeedback;
  // penaliza rejeição
  const penalty = Math.min(0.6, (rejected / totalFeedback));
  const score = Math.max(0, Math.round((acceptance - penalty) * 100));
  return Math.min(100, score);
}

async function recordInteraction(licenseKey, { type, chatExternalId, contactName, payload, tokensUsed, model }) {
  // grava em MessageEvent para auditoria e para sugerir melhorias
  try {
    const ev = await prisma.messageEvent.create({
      data: {
        type: type || 'ai_interaction',
        chatExternalId: chatExternalId || null,
        contactName: contactName || null,
        payload: payload ? JSON.stringify({ ...payload, __lk: licenseKey }) : JSON.stringify({ __lk: licenseKey }),
      },
    });

    const metrics = await getMetrics(licenseKey);
    metrics.totalInteractions = (metrics.totalInteractions || 0) + 1;
    metrics.lastInteractionAt = new Date().toISOString();
    metrics.lastModel = model || MODEL_TEXT;
    if (tokensUsed) {
      metrics.lastTokensUsed = tokensUsed;
    }
    metrics.readinessScore = computeReadiness(metrics);
    await setMetrics(licenseKey, metrics);

    return ev.id;
  } catch (e) {
    log.warn('[AITraining] Falha ao registrar interação', e);
    return null;
  }
}

async function addFeedback(licenseKey, { interactionId, chatExternalId, feedbackType, editedText, originalText }) {
  const metrics = await getMetrics(licenseKey);

  if (feedbackType === 'approved') metrics.approved = (metrics.approved || 0) + 1;
  if (feedbackType === 'edited') metrics.edited = (metrics.edited || 0) + 1;
  if (feedbackType === 'rejected') metrics.rejected = (metrics.rejected || 0) + 1;

  metrics.readinessScore = computeReadiness(metrics);
  metrics.lastFeedbackAt = new Date().toISOString();

  await setMetrics(licenseKey, metrics);

  // registra evento de feedback
  try {
    await prisma.messageEvent.create({
      data: {
        type: 'ai_feedback',
        chatExternalId: chatExternalId || null,
        contactName: null,
        payload: JSON.stringify({
          __lk: licenseKey,
          interactionId: interactionId || null,
          feedbackType,
          editedText: editedText || null,
          originalText: originalText || null,
          at: new Date().toISOString(),
        }),
      },
    });
  } catch (_) {}

  return metrics;
}

async function generateSuggestionsFromHistory(licenseKey, { limit=40, sinceISO=null } = {}) {
  await ensureDefaults(licenseKey);
  const client = await getOpenAIClient();

  const where = { type: 'ai_reply' };
  // Filtra por licença dentro do payload (compatível com esquema Prisma atual)
  where.payload = { contains: "\"__lk\":\"" + licenseKey + "\"" };
  if (sinceISO) {
    where.createdAt = { gt: new Date(sinceISO) };
  }
  const events = await prisma.messageEvent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  // Carregar feedbacks (aprovado/editado/rejeitado) para fechar ciclo de aprendizagem
  const feedbackWhere = { type: 'ai_feedback' };
  feedbackWhere.payload = { contains: "\"__lk\":\"" + licenseKey + "\"" };
  if (sinceISO) {
    feedbackWhere.createdAt = { gt: new Date(sinceISO) };
  }
  const feedbackEvents = await prisma.messageEvent.findMany({
    where: feedbackWhere,
    orderBy: { createdAt: 'desc' },
    take: Math.min(200, (limit || 40) * 3),
  });

  const feedbackByInteraction = new Map();
  for (const fev of feedbackEvents) {
    const fp = safeJsonParse(fev.payload || '{}', {});
    if (fp && fp.interactionId) {
      // Guarda o feedback mais recente por interactionId
      feedbackByInteraction.set(fp.interactionId, fp);
    }
  }

  if (!events.length) {
    return { suggestions: await getSuggestionsYaml(licenseKey), generated: false, reason: 'Sem histórico suficiente.' };
  }

  const samples = events.map((ev) => {
    const p = safeJsonParse(ev.payload || '{}', {});
    const fb = feedbackByInteraction.get(ev.id) || null;
    return {
      at: ev.createdAt,
      chatExternalId: ev.chatExternalId,
      contactName: ev.contactName,
      messages: p.messages || null,
      reply: p.reply || null,
      tone: p.tone || null,
      feedback: fb
        ? {
            type: fb.feedbackType || null,
            editedText: fb.editedText || null,
          }
        : null,
    };
  }).filter((s) => s.reply);

  const metrics = await getMetrics(licenseKey);
  const policy = await getPolicyYaml(licenseKey);

  const prompt = [
    'Você é um especialista em atendimento e vendas por WhatsApp, e está ajudando a melhorar as regras e o conhecimento de uma empresa.',
    'Você receberá: (1) regras atuais (policy) e (2) amostras de conversas + respostas geradas.',
    'Sua tarefa: gerar SUGESTÕES em YAML para melhorar as respostas futuras. As sugestões devem ser seguras (não inventar fatos) e focadas em:',
    '- Perguntas frequentes e respostas oficiais que faltam',
    '- Regras de tom e estilo consistentes',
    '- Guardrails (o que não fazer)',
    '- Sugestões de dados que devemos coletar antes de responder (ex.: qual produto, qual cidade, etc.)',
    '',
    'IMPORTANTE:',
    '- NÃO altere preços nem invente. Se detectar que falta "tabela de preços" ou "política", sugira adicionar como conhecimento.',
    '- Escreva YAML simples em português.',
    '- Seja objetivo.',
    '',
    'Formato YAML sugerido (exemplo):',
    'faq:',
    '  - pergunta: "..."',
    '    resposta: "..."',
    'rules:',
    '  - "..."',
    'tone:',
    '  - "..."',
    'data_to_collect:',
    '  - "..."',
    '',
    'Regras atuais (policy):',
    '```',
    clampText(policy, 6000),
    '```',
    '',
    `Métricas atuais: ${JSON.stringify(metrics || {})}`,
    '',
    'Amostras recentes:',
    '```json',
    JSON.stringify(samples.slice(0, 25), null, 2),
    '```',
    '',
    'Agora gere APENAS o YAML das sugestões, sem texto adicional.',
  ].join('\n');

  const completion = await client.chat.completions.create({
    model: MODEL_TEXT,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 900,
  });

  const yaml = completion.choices?.[0]?.message?.content?.trim() || '';
  if (!yaml) {
    return { suggestions: await getSuggestionsYaml(licenseKey), generated: false, reason: 'Resposta vazia do modelo.' };
  }

  await setSuggestionsYaml(licenseKey, yaml);

  const newMetrics = await getMetrics(licenseKey);
  newMetrics.lastSuggestionAt = new Date().toISOString();
  newMetrics.readinessScore = computeReadiness(newMetrics);
  await setMetrics(licenseKey, newMetrics);

  return { suggestions: yaml, generated: true };
}

async function applySuggestions(licenseKey) {
  await ensureDefaults(licenseKey);
  const policy = await getPolicyYaml(licenseKey);
  const suggestions = await getSuggestionsYaml(licenseKey);

  // Merge simples: anexa ao final, mantendo histórico.
  const merged = clampText(
    `${policy}\n\n# --- Sugestões aplicadas (${new Date().toISOString()}) ---\n${suggestions}\n`,
    POLICY_MAX_CHARS
  );

  await setPolicyYaml(licenseKey, merged);
  // Limpa sugestões após aplicar
  await setSuggestionsYaml(licenseKey, '# Sugestões geradas pela IA (learned_suggestions.yaml)\n\n');

  return merged;
}

async function getTrainingState(licenseKey) {
  await ensureDefaults(licenseKey);
  const [policy, suggestions, kb, metrics, autoEnabled, lastRun] = await Promise.all([
    getPolicyYaml(licenseKey),
    getSuggestionsYaml(licenseKey),
    listKnowledge(licenseKey),
    getMetrics(licenseKey),
    getSettingValue(KEYS.autotrainEnabled(licenseKey)),
    getSettingValue(KEYS.autotrainLastRun(licenseKey)),
  ]);

  const readiness = metrics?.readinessScore || computeReadiness(metrics || {});
  const totalKb = (kb || []).length;
  const totalSuggestions = (suggestions || '').trim().length;

  return {
    readinessScore: readiness,
    totalKnowledgeItems: totalKb,
    policyPreview: clampText(policy, 1200),
    hasSuggestions: totalSuggestions > 0 && !suggestions.trim().startsWith('# Sugestões') ? true : (suggestions.trim().length > 20),
    metrics: metrics || {},
    autoTrainEnabled: String(autoEnabled || 'false') === 'true',
    autoTrainLastRun: lastRun || null,
  };
}

async function setAutoTrainEnabled(licenseKey, enabled) {
  await ensureDefaults(licenseKey);
  await setSettingValue(KEYS.autotrainEnabled(licenseKey), enabled ? 'true' : 'false');
  return enabled ? true : false;
}

async function setAutoTrainLastRun(licenseKey, iso) {
  await ensureDefaults(licenseKey);
  await setSettingValue(KEYS.autotrainLastRun(licenseKey), iso || new Date().toISOString());
  return true;
}

module.exports = {
  getPolicyYaml,
  setPolicyYaml,
  getSuggestionsYaml,
  setSuggestionsYaml,
  applySuggestions,
  ingestText,
  ingestFileText,
  ingestAudio,
  listKnowledge,
  deleteKnowledge: async (licenseKey, id) => {
    const items = await listKnowledge(licenseKey);
    const filtered = items.filter((i) => i && i.id !== id);
    await saveKnowledge(licenseKey, filtered);
    return true;
  },
  buildBusinessContextText,
  getTrainingState,
  addFeedback,
  recordInteraction,
  generateSuggestionsFromHistory,
  setAutoTrainEnabled,
  setAutoTrainLastRun,
  getSettingValue,
};