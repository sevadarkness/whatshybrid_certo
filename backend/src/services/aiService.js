const OpenAI = require("openai");
const { getOpenAIKey } = require("./settingsService");

let client = null;
let cachedApiKey = null;
let lastKeyCheck = 0;
const KEY_CACHE_TTL_MS = 5000; // evita bater no banco em toda request

// Modelos configuráveis por env (para evitar quebra caso algum model não exista na conta)
const MODEL_REPLY = process.env.OPENAI_MODEL_REPLY || process.env.OPENAI_MODEL || "gpt-4o";
const MODEL_INSIGHTS = process.env.OPENAI_MODEL_INSIGHTS || process.env.OPENAI_MODEL || "gpt-4o";
const MODEL_SMART_REPLIES = process.env.OPENAI_MODEL_SMART_REPLIES || process.env.OPENAI_MODEL || "gpt-4o";
const MODEL_FALLBACK = process.env.OPENAI_MODEL_FALLBACK || "gpt-4o";

async function getClient() {
  const now = Date.now();

  // Recarrega a chave periodicamente (permite trocar a chave via AppSetting sem reiniciar)
  if (!client || now - lastKeyCheck > KEY_CACHE_TTL_MS) {
    const apiKey = (await getOpenAIKey())?.trim();
    lastKeyCheck = now;

    if (!apiKey) {
      throw new Error("OPENAI_API_KEY não configurada");
    }

    if (!client || cachedApiKey !== apiKey) {
      cachedApiKey = apiKey;
      client = new OpenAI({ apiKey });
    }
  }

  return client;
}

/**
 * Tenta chamar Chat Completions com o modelo informado e, se falhar, tenta um fallback.
 * Isso reduz erros quando o projeto é usado em contas sem acesso a determinado modelo.
 */
async function createChatCompletion(params) {
  const client = await getClient();
  try {
    return await client.chat.completions.create(params);
  } catch (err) {
    const msg = err?.message || String(err);
    // Fallback best-effort: só tenta se o modelo não for o fallback
    if (params.model && params.model !== MODEL_FALLBACK) {
      console.warn(`[AI] Falha no modelo "${params.model}". Tentando fallback "${MODEL_FALLBACK}".`, msg);
      return await client.chat.completions.create({ ...params, model: MODEL_FALLBACK });
    }
    throw err;
  }
}

async function generateReply({ contactName, messages, tone, businessContext }) {
  let style = "profissional e claro";
  if (tone === "informal") style = "informal, amigável, estilo WhatsApp";
  if (tone === "convincente") style = "voltado para vendas, persuasivo mas honesto";
  if (tone === "suporte") style = "calmo, empático, de suporte ao cliente";

  const content =
    "Você é um assistente de WhatsApp ajudando o usuário a responder um contato chamado " +
    contactName +
    ". Estilo de escrita: " + style +
    ". Contexto das últimas mensagens:\n\n" +
    messages.map((m, i) => `${i + 1}. ${m}`).join("\n") +
    "\n\nEscreva APENAS a resposta que o usuário deve enviar em português, em uma única mensagem.";

  const completion = await createChatCompletion({
    model: MODEL_REPLY,
    messages: businessContext
      ? [{ role: "system", content: businessContext }, { role: "user", content }]
      : [{ role: "user", content }],
  });

  const reply = completion.choices?.[0]?.message?.content?.trim();
  return { reply, usage: completion.usage || null, model: completion.model || MODEL_REPLY };
}

async function generateInsights({ contactName, messages, businessContext }) {
  const content =
    `Você é um analista de conversas via WhatsApp. Analise a conversa abaixo entre o usuário e o contato "${contactName}". ` +
    "Produza um JSON com os campos: sentiment (positivo, neutro ou negativo, em minúsculas), summary (máx. 3 frases) e nextAction (orientação prática do próximo passo que o atendente deve tomar). " +
    "A conversa é:\n\n" +
    messages.map((m, i) => `${i + 1}. ${m}`).join("\n") +
    "\n\nRetorne o JSON puro, sem explicações extras.";

  const completion = await createChatCompletion({
    model: MODEL_INSIGHTS,
    messages: businessContext
      ? [{ role: "system", content: businessContext }, { role: "user", content }]
      : [{ role: "user", content }],
  });

  const raw = completion.choices?.[0]?.message?.content?.trim() || "{}";
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    parsed = { sentiment: "neutro", summary: raw.slice(0, 400), nextAction: "Responder de forma cordial e profissional." };
  }
  return { insights: parsed, usage: completion.usage || null, model: completion.model || MODEL_INSIGHTS };
}



async function generateSmartReplies({ message, language, transliterate, emojiEnabled, forceSelectedLanguage, userName, businessContext }) {
  const targetLanguage = language || "Portuguese";
  const useEmojis = emojiEnabled !== false;
  const mustUseSelectedLanguage = !!forceSelectedLanguage;
  const shouldTransliterate = !!transliterate;

  let prompt = "Você é um assistente de WhatsApp para atendimento ao cliente. ";
  prompt += "Crie exatamente 3 respostas curtas e naturais para a mensagem a seguir. ";
  prompt += "As respostas devem ser diretas, amigáveis e adequadas para conversa em chat.\n\n";

  if (userName) {
    prompt += `Você está respondendo como "${userName}". `;
  }

  if (mustUseSelectedLanguage) {
    prompt += `Responda em ${targetLanguage}. `;
  } else {
    prompt += `Use o idioma que for mais natural dado o texto, favorecendo ${targetLanguage}. `;
  }

  if (shouldTransliterate) {
    prompt += "Use o alfabeto latino (transliteração), mesmo que a língua original use outro script. ";
  } else {
    prompt += "Use o script nativo da língua (por exemplo, acentos em português, etc.). ";
  }

  if (useEmojis) {
    prompt += "Você pode usar alguns emojis para deixar as respostas mais humanas, mas sem exageros. ";
  } else {
    prompt += "Não use emojis. ";
  }

  prompt += "\n\nRegra de formato: retorne apenas as 3 respostas, uma por linha, sem numeração, sem marcadores, sem texto extra.\n\n";
  prompt += `Mensagem do cliente:\n"${message}"\n`;

  const completion = await createChatCompletion({
    model: MODEL_SMART_REPLIES,
    messages: businessContext
      ? [{ role: "system", content: businessContext }, { role: "user", content: prompt }]
      : [{ role: "user", content: prompt }],
    max_tokens: 200
  });

  const raw = completion.choices?.[0]?.message?.content?.trim() || "";
  const replies = raw
    .split(/\n+/)
    .map((r) => r.replace(/^\d+[\).\s-]?\s*/, "").trim())
    .filter((r) => r && r.length >= 2);

  return { replies: replies.slice(0, 3), usage: completion.usage || null, model: completion.model || MODEL_SMART_REPLIES };
}

/**
 * Endpoint genérico de chat (para Copilot/Chatbot).
 */
async function chat({
  messages,
  systemPrompt = '',
  model = null,
  temperature = 0.7,
  maxTokens = 500
}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('messages obrigatórias');
  }

  const normalized = [];

  if (systemPrompt) {
    normalized.push({ role: 'system', content: String(systemPrompt) });
  }

  for (const m of messages) {
    if (!m) continue;
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const content = String(m.content || '');
    if (!content.trim()) continue;
    normalized.push({ role, content });
  }

  if (normalized.length === 0) {
    throw new Error('messages vazias');
  }

  const completion = await createChatCompletion({
    model: process.env.OPENAI_MODEL || MODEL_FALLBACK,
    messages: normalized,
    temperature,
    max_tokens: maxTokens
  });

  const content = completion.choices?.[0]?.message?.content?.trim() || '';

  return {
    content,
    usage: completion.usage || null,
    model: completion.model || (model || process.env.OPENAI_MODEL || MODEL_FALLBACK)
  };
}

module.exports = { generateReply, generateInsights, generateSmartReplies, chat };