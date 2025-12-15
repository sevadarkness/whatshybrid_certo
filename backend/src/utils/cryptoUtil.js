// backend/src/utils/cryptoUtil.js
// Pequeno utilitário para criptografar/decriptar segredos armazenados no banco.
//
// - Usa AES-256-GCM com APP_ENCRYPTION_KEY (32 bytes em hex).
// - Se APP_ENCRYPTION_KEY não estiver configurada, cai em modo "plain:" (base64)
//   para não quebrar ambientes existentes (mas NÃO é recomendado).
//
// Formato armazenado:
//   enc:<iv_b64>:<tag_b64>:<cipher_b64>
//   plain:<b64>

const crypto = require('crypto');

function getKeyBuffer() {
  const hex = (process.env.APP_ENCRYPTION_KEY || '').trim();
  if (!hex) return null;

  let buf;
  try {
    buf = Buffer.from(hex, 'hex');
  } catch (e) {
    throw new Error('APP_ENCRYPTION_KEY inválida (esperado hex)');
  }

  if (buf.length !== 32) {
    throw new Error('APP_ENCRYPTION_KEY deve ter 32 bytes em hex (64 caracteres)');
  }

  return buf;
}

function hasEncryptionKey() {
  return !!getKeyBuffer();
}

function encryptString(plaintext) {
  if (plaintext === null || plaintext === undefined) return '';

  const key = getKeyBuffer();

  // Fallback (não recomendado)
  if (!key) {
    return `plain:${Buffer.from(String(plaintext), 'utf8').toString('base64')}`;
  }

  const iv = crypto.randomBytes(12); // recomendado p/ GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `enc:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decryptString(storedValue) {
  if (!storedValue) return null;

  const str = String(storedValue);

  if (str.startsWith('enc:')) {
    const key = getKeyBuffer();
    if (!key) {
      throw new Error('APP_ENCRYPTION_KEY não configurada (necessária para decriptar)');
    }

    const parts = str.split(':');
    if (parts.length !== 4) {
      throw new Error('Valor criptografado inválido (formato incorreto)');
    }

    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const data = Buffer.from(parts[3], 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString('utf8');
  }

  if (str.startsWith('plain:')) {
    return Buffer.from(str.slice('plain:'.length), 'base64').toString('utf8');
  }

  // compat: valor em texto puro
  return str;
}

module.exports = {
  hasEncryptionKey,
  encryptString,
  decryptString,
};
