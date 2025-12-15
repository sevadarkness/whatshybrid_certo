/**
 * @fileoverview Utilitários para manipulação de IDs
 * @module shared/utils/ids
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * Converte string para ObjectId do MongoDB
 * @param {string|mongoose.Types.ObjectId} id - ID a converter
 * @returns {mongoose.Types.ObjectId|null} ObjectId ou null se inválido
 */
function toObjectId(id) {
  if (!id) return null;

  if (id instanceof mongoose.Types.ObjectId) {
    return id;
  }

  if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
    return new mongoose.Types.ObjectId(id);
  }

  return null;
}

/**
 * Verifica se string é um ObjectId válido
 * @param {string} id - ID a verificar
 * @returns {boolean}
 */
function isValidObjectId(id) {
  if (!id || typeof id !== 'string') return false;
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
}

/**
 * Gera um novo ObjectId
 * @returns {mongoose.Types.ObjectId}
 */
function generateObjectId() {
  return new mongoose.Types.ObjectId();
}

/**
 * Gera UUID v4
 * @returns {string}
 */
function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Gera ID curto (8 caracteres)
 * @returns {string}
 */
function generateShortId() {
  return crypto.randomBytes(4).toString('hex');
}

/**
 * Gera ID de workspace (prefixado)
 * @returns {string}
 */
function generateWorkspaceId() {
  return `ws_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Gera ID de request para tracing
 * @returns {string}
 */
function generateRequestId() {
  return `req_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Extrai ObjectId de uma string que pode conter prefixo
 * @param {string} str - String contendo ID
 * @returns {string|null} ID extraído
 */
function extractObjectId(str) {
  if (!str) return null;
  const match = str.match(/[a-f\d]{24}/i);
  return match ? match[0] : null;
}

/**
 * Compara dois IDs (suporta ObjectId e string)
 * @param {string|mongoose.Types.ObjectId} id1 - Primeiro ID
 * @param {string|mongoose.Types.ObjectId} id2 - Segundo ID
 * @returns {boolean}
 */
function idsMatch(id1, id2) {
  if (!id1 || !id2) return false;
  return String(id1) === String(id2);
}

module.exports = {
  toObjectId,
  isValidObjectId,
  generateObjectId,
  generateUUID,
  generateShortId,
  generateWorkspaceId,
  generateRequestId,
  extractObjectId,
  idsMatch,
};