/**
 * @fileoverview Utilitários de normalização de dados
 * @module shared/utils/normalize
 */

/**
 * Normaliza número de telefone
 * @param {string} raw - Telefone bruto
 * @param {Object} [options] - Opções
 * @param {string} [options.defaultCountry='55'] - DDI padrão
 * @param {boolean} [options.keepPlus=true] - Manter o + no início
 * @returns {string|null} Telefone normalizado ou null
 */
function normalizePhone(raw, options = {}) {
  if (!raw) return null;

  const { defaultCountry = '55', keepPlus = true } = options;

  // Remove tudo exceto dígitos e +
  let digits = String(raw).replace(/[^\d+]/g, '');

  // Se começa com +, extrai
  const hasPlus = digits.startsWith('+');
  if (hasPlus) {
    digits = digits.slice(1);
  }

  // Remove zeros à esquerda (exceto se for o próprio 0)
  digits = digits.replace(/^0+/, '');

  // Se não tem DDI (menos de 10 dígitos), adiciona o padrão
  if (digits.length <= 11 && !hasPlus) {
    digits = defaultCountry + digits;
  }

  // Valida comprimento mínimo
  if (digits.length < 10) {
    return null;
  }

  return keepPlus ? `+${digits}` : digits;
}

/**
 * Normaliza email
 * @param {string} raw - Email bruto
 * @returns {string|null} Email normalizado ou null
 */
function normalizeEmail(raw) {
  if (!raw) return null;

  const email = String(raw).trim().toLowerCase();

  // Validação básica de formato
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return null;
  }

  return email;
}

/**
 * Normaliza nome
 * @param {string} raw - Nome bruto
 * @returns {string} Nome normalizado
 */
function normalizeName(raw) {
  if (!raw) return '';

  return String(raw)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, '')
    .slice(0, 200);
}

/**
 * Normaliza slug (URL-friendly)
 * @param {string} raw - Texto bruto
 * @returns {string} Slug normalizado
 */
function normalizeSlug(raw) {
  if (!raw) return '';

  return String(raw)
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

/**
 * Normaliza valor monetário
 * @param {string|number} raw - Valor bruto
 * @param {number} [decimals=2] - Casas decimais
 * @returns {number} Valor normalizado
 */
function normalizeMonetary(raw, decimals = 2) {
  if (raw === null || raw === undefined) return 0;

  if (typeof raw === 'number') {
    return Number(raw.toFixed(decimals));
  }

  // Remove símbolos de moeda e espaços
  const cleaned = String(raw)
    .replace(/[R$€£¥]/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Number(num.toFixed(decimals));
}

/**
 * Normaliza CPF/CNPJ
 * @param {string} raw - Documento bruto
 * @returns {string|null} Documento normalizado (só dígitos)
 */
function normalizeDocument(raw) {
  if (!raw) return null;

  const digits = String(raw).replace(/\D/g, '');

  // CPF: 11 dígitos, CNPJ: 14 dígitos
  if (digits.length !== 11 && digits.length !== 14) {
    return null;
  }

  return digits;
}

/**
 * Normaliza tags (array de strings)
 * @param {string|string[]} raw - Tags brutas
 * @returns {string[]} Array de tags normalizadas
 */
function normalizeTags(raw) {
  if (!raw) return [];

  const tags = Array.isArray(raw) ? raw : String(raw).split(',');

  return tags
    .map((tag) => String(tag).trim().toLowerCase())
    .filter((tag) => tag.length > 0 && tag.length <= 50)
    .filter((tag, index, self) => self.indexOf(tag) === index) // unique
    .slice(0, 20); // máximo 20 tags
}

/**
 * Sanitiza string para prevenir XSS básico
 * @param {string} raw - String bruta
 * @returns {string} String sanitizada
 */
function sanitizeString(raw) {
  if (!raw) return '';

  return String(raw)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

module.exports = {
  normalizePhone,
  normalizeEmail,
  normalizeName,
  normalizeSlug,
  normalizeMonetary,
  normalizeDocument,
  normalizeTags,
  sanitizeString,
};