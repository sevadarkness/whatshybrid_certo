const baseUrl = (process.env.WHATSAPP_API_BASE_URL || "https://graph.facebook.com/v19.0").replace(/\/$/, "");
const phoneId = process.env.WHATSAPP_BUSINESS_PHONE_ID;
const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

function assertConfigured() {
  if (!phoneId || !accessToken) {
    throw new Error("Variáveis WHATSAPP_BUSINESS_PHONE_ID ou WHATSAPP_ACCESS_TOKEN não configuradas.");
  }
  if (!global.fetch) {
    throw new Error("fetch global não encontrado. Use Node 18+ (recomendado) ou adicione uma implementação de fetch.");
  }
}

/**
 * Envia mensagem de texto via WhatsApp Business Cloud API.
 */
async function sendTextMessage(to, body) {
  assertConfigured();
  if (!to) throw new Error("Destino (to) não informado.");

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body }
  };

  const res = await fetch(`${baseUrl}/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    let errText;
    try {
      errText = await res.text();
    } catch (e) {
      errText = res.statusText;
    }
    throw new Error(`WhatsApp API error ${res.status}: ${errText}`);
  }

  return res.json().catch(() => ({}));
}

/**
 * Parseia DataURL base64: data:<mime>;base64,<data>
 */
function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!match) {
    throw new Error("Base64 inválido (esperado DataURL: data:<mime>;base64,...)");
  }
  const mime = match[1];
  const b64 = match[2];
  const buffer = Buffer.from(b64, "base64");
  return { mime, buffer };
}

/**
 * Faz upload de mídia (base64 DataURL) e retorna o id para uso em mensagens.
 * Docs: POST /{phone-number-id}/media
 */
async function uploadMediaFromDataUrl(dataUrl, filename, mimetype) {
  assertConfigured();
  const { mime, buffer } = parseDataUrl(dataUrl);
  const finalMime = mimetype || mime || "application/octet-stream";
  const finalName = filename || "file";

  // Node 18+ (undici) fornece FormData/Blob globais
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([buffer], { type: finalMime }), finalName);

  const res = await fetch(`${baseUrl}/${phoneId}/media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`
      // NÃO setar Content-Type manualmente; FormData define boundary
    },
    body: form
  });

  if (!res.ok) {
    let errText;
    try {
      errText = await res.text();
    } catch (e) {
      errText = res.statusText;
    }
    throw new Error(`WhatsApp API media upload error ${res.status}: ${errText}`);
  }

  return res.json().catch(() => ({}));
}

function messageTypeFromMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "document";
}

/**
 * Envia mídia por id (retornado no upload).
 * media: { id, mimetype, filename }
 */
async function sendMediaMessageById(to, media, caption = "") {
  assertConfigured();
  if (!to) throw new Error("Destino (to) não informado.");
  if (!media || !media.id) throw new Error("media.id é obrigatório");

  const type = messageTypeFromMime(media.mimetype);
  const payload = {
    messaging_product: "whatsapp",
    to,
    type
  };

  if (type === "image") {
    payload.image = { id: media.id };
    if (caption) payload.image.caption = caption;
  } else if (type === "video") {
    payload.video = { id: media.id };
    if (caption) payload.video.caption = caption;
  } else if (type === "audio") {
    payload.audio = { id: media.id };
  } else {
    payload.document = { id: media.id };
    if (media.filename) payload.document.filename = media.filename;
    if (caption) payload.document.caption = caption;
  }

  const res = await fetch(`${baseUrl}/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    let errText;
    try {
      errText = await res.text();
    } catch (e) {
      errText = res.statusText;
    }
    throw new Error(`WhatsApp API media send error ${res.status}: ${errText}`);
  }

  return res.json().catch(() => ({}));
}

module.exports = {
  sendTextMessage,
  uploadMediaFromDataUrl,
  sendMediaMessageById
};
