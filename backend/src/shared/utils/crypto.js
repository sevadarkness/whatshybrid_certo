/**
 * @fileoverview Utilitários de criptografia
 * @module shared/utils/crypto
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_ROUNDS = 12;

/**
 * Gera hash SHA-256
 * @param {string} data - Dados para hash
 * @returns {string} Hash em hexadecimal
 */
function sha256(data) {
  return crypto.createHash('sha256').update(String(data)).digest('hex');
}

/**
 * Gera hash SHA-512
 * @param {string} data - Dados para hash
 * @returns {string} Hash em hexadecimal
 */
function sha512(data) {
  return crypto.createHash('sha512').update(String(data)).digest('hex');
}

/**
 * Gera hash MD5 (apenas para checksums, não segurança)
 * @param {string} data - Dados para hash
 * @returns {string} Hash em hexadecimal
 */
function md5(data) {
  return crypto.createHash('md5').update(String(data)).digest('hex');
}

/**
 * Hash de senha com bcrypt
 * @param {string} password - Senha em texto plano
 * @returns {Promise<string>} Hash da senha
 */
async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verifica senha contra hash bcrypt
 * @param {string} password - Senha em texto plano
 * @param {string} hash - Hash bcrypt
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Criptografa dados com AES-256-GCM
 * @param {string} plaintext - Texto para criptografar
 * @param {string} key - Chave de 32 bytes (hex ou buffer)
 * @returns {string} Dados criptografados (iv:authTag:ciphertext) em base64
 */
function encrypt(plaintext, key) {
  const keyBuffer = typeof key === 'string' ? Buffer.from(key, 'hex') : key;
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  
  let encrypted = cipher.update(String(plaintext), 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Descriptografa dados com AES-256-GCM
 * @param {string} encryptedData - Dados criptografados
 * @param {string} key - Chave de 32 bytes
 * @returns {string} Texto descriptografado
 */
function decrypt(encryptedData, key) {
  const keyBuffer = typeof key === 'string' ? Buffer.from(key, 'hex') : key;
  const parts = encryptedData.split(':');
  
  if (parts.length !== 3) {
    throw new Error('Formato de dados criptografados inválido');
  }
  
  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const ciphertext = parts[2];
  
  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Gera chave aleatória
 * @param {number} [bytes=32] - Número de bytes
 * @returns {string} Chave em hexadecimal
 */
function generateKey(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Gera token seguro
 * @param {number} [length=32] - Comprimento em bytes
 * @returns {string} Token em base64url
 */
function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString('base64url');
}

/**
 * Gera HMAC
 * @param {string} data - Dados
 * @param {string} secret - Segredo
 * @param {string} [algorithm='sha256'] - Algoritmo
 * @returns {string} HMAC em hexadecimal
 */
function hmac(data, secret, algorithm = 'sha256') {
  return crypto.createHmac(algorithm, secret).update(String(data)).digest('hex');
}

/**
 * Verifica HMAC (timing-safe)
 * @param {string} data - Dados originais
 * @param {string} secret - Segredo
 * @param {string} providedHmac - HMAC fornecido
 * @param {string} [algorithm='sha256'] - Algoritmo
 * @returns {boolean}
 */
function verifyHmac(data, secret, providedHmac, algorithm = 'sha256') {
  const computed = hmac(data, secret, algorithm);
  const computedBuffer = Buffer.from(computed, 'hex');
  const providedBuffer = Buffer.from(providedHmac, 'hex');
  
  if (computedBuffer.length !== providedBuffer.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(computedBuffer, providedBuffer);
}

module.exports = {
  sha256,
  sha512,
  md5,
  hashPassword,
  verifyPassword,
  encrypt,
  decrypt,
  generateKey,
  generateSecureToken,
  hmac,
  verifyHmac,
};