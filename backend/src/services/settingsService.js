// backend/src/services/settingsService.js
//
// Armazena configurações no banco (AppSetting) e oferece helpers para segredos.
// - Para segredos, o valor é criptografado via utils/cryptoUtil (AES-256-GCM) quando
//   APP_ENCRYPTION_KEY está configurada.

const prisma = require('../prisma');
const { encryptString, decryptString } = require('../utils/cryptoUtil');

const OPENAI_KEY_SETTING = 'openai_api_key';

/**
 * Busca um AppSetting por chave.
 * Retorna o valor bruto (string) ou null.
 */
async function getSetting(key) {
  if (!key) return null;
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row ? row.value : null;
}

/**
 * Cria/atualiza um AppSetting.
 */
async function setSetting(key, value) {
  if (!key) throw new Error('key é obrigatório');
  const val = value === undefined || value === null ? '' : String(value);

  const row = await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: val },
    update: { value: val }
  });

  return row.value;
}

/**
 * Lê um segredo (decriptando quando aplicável).
 */
async function getSecret(key) {
  const raw = await getSetting(key);
  if (!raw) return null;
  return decryptString(raw);
}

/**
 * Salva um segredo (criptografando quando aplicável).
 */
async function setSecret(key, plaintext) {
  if (!key) throw new Error('key é obrigatório');
  const enc = encryptString(plaintext || '');
  await setSetting(key, enc);
  return true;
}

async function getOpenAIKey() {
  // env tem prioridade (permite deploy simples)
  const envKey = (process.env.OPENAI_API_KEY || '').trim();
  if (envKey) return envKey;
  return await getSecret(OPENAI_KEY_SETTING);
}

async function setOpenAIKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') throw new Error('apiKey é obrigatório');
  await setSecret(OPENAI_KEY_SETTING, apiKey.trim());
  return true;
}

function maskKey(key) {
  if (!key) return null;
  const k = String(key);
  if (k.length <= 10) return '***';
  return `${k.slice(0, 4)}...${k.slice(-4)}`;
}

async function getOpenAIStatus() {
  const key = await getOpenAIKey();
  return {
    configured: !!key,
    source: (process.env.OPENAI_API_KEY || '').trim() ? 'env' : (key ? 'db' : 'none'),
    masked: key ? maskKey(key) : null,
  };
}

module.exports = {
  OPENAI_KEY_SETTING,
  getSetting,
  setSetting,
  getSecret,
  setSecret,
  getOpenAIKey,
  setOpenAIKey,
  getOpenAIStatus,
  maskKey,
};
