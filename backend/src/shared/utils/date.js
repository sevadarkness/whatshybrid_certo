/**
 * @fileoverview Utilitários de manipulação de datas
 * @module shared/utils/date
 */

/**
 * Normaliza data para início do dia (00:00:00.000)
 * @param {Date|string|number} date - Data
 * @returns {Date}
 */
function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Normaliza data para fim do dia (23:59:59.999)
 * @param {Date|string|number} date - Data
 * @returns {Date}
 */
function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Retorna range do dia (start e end)
 * @param {Date|string|number} date - Data
 * @returns {{start: Date, end: Date}}
 */
function dayRange(date = new Date()) {
  return {
    start: startOfDay(date),
    end: endOfDay(date),
  };
}

/**
 * Adiciona dias a uma data
 * @param {Date} date - Data base
 * @param {number} days - Dias a adicionar (negativo para subtrair)
 * @returns {Date}
 */
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Adiciona horas a uma data
 * @param {Date} date - Data base
 * @param {number} hours - Horas a adicionar
 * @returns {Date}
 */
function addHours(date, hours) {
  const d = new Date(date);
  d.setTime(d.getTime() + hours * 60 * 60 * 1000);
  return d;
}

/**
 * Adiciona minutos a uma data
 * @param {Date} date - Data base
 * @param {number} minutes - Minutos a adicionar
 * @returns {Date}
 */
function addMinutes(date, minutes) {
  const d = new Date(date);
  d.setTime(d.getTime() + minutes * 60 * 1000);
  return d;
}

/**
 * Calcula diferença em minutos entre duas datas
 * @param {Date} date1 - Primeira data
 * @param {Date} date2 - Segunda data
 * @returns {number} Diferença em minutos
 */
function diffInMinutes(date1, date2) {
  return Math.abs((new Date(date1) - new Date(date2)) / (1000 * 60));
}

/**
 * Calcula diferença em horas entre duas datas
 * @param {Date} date1 - Primeira data
 * @param {Date} date2 - Segunda data
 * @returns {number} Diferença em horas
 */
function diffInHours(date1, date2) {
  return diffInMinutes(date1, date2) / 60;
}

/**
 * Calcula diferença em dias entre duas datas
 * @param {Date} date1 - Primeira data
 * @param {Date} date2 - Segunda data
 * @returns {number} Diferença em dias
 */
function diffInDays(date1, date2) {
  return diffInHours(date1, date2) / 24;
}

/**
 * Verifica se data está dentro de um range
 * @param {Date} date - Data a verificar
 * @param {Date} start - Início do range
 * @param {Date} end - Fim do range
 * @returns {boolean}
 */
function isWithinRange(date, start, end) {
  const d = new Date(date);
  return d >= new Date(start) && d <= new Date(end);
}

/**
 * Retorna horário no formato HH:MM
 * @param {Date} date - Data
 * @returns {string}
 */
function formatTime(date = new Date()) {
  const d = new Date(date);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Retorna data no formato YYYY-MM-DD
 * @param {Date} date - Data
 * @returns {string}
 */
function formatDate(date = new Date()) {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

/**
 * Retorna data/hora no formato ISO
 * @param {Date} date - Data
 * @returns {string}
 */
function formatISO(date = new Date()) {
  return new Date(date).toISOString();
}

/**
 * Retorna data no formato brasileiro (DD/MM/YYYY)
 * @param {Date} date - Data
 * @returns {string}
 */
function formatBR(date = new Date()) {
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Verifica se é horário comercial
 * @param {Date} date - Data/hora
 * @param {string} [start='09:00'] - Início do horário comercial
 * @param {string} [end='18:00'] - Fim do horário comercial
 * @returns {boolean}
 */
function isBusinessHours(date = new Date(), start = '09:00', end = '18:00') {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  
  // Fim de semana
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  
  const currentTime = formatTime(d);
  return currentTime >= start && currentTime <= end;
}

/**
 * Retorna primeiro dia do mês
 * @param {Date} date - Data
 * @returns {Date}
 */
function startOfMonth(date = new Date()) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Retorna último dia do mês
 * @param {Date} date - Data
 * @returns {Date}
 */
function endOfMonth(date = new Date()) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Gera array de datas entre duas datas
 * @param {Date} start - Data inicial
 * @param {Date} end - Data final
 * @returns {Date[]}
 */
function getDateRange(start, end) {
  const dates = [];
  const current = startOfDay(start);
  const endDate = startOfDay(end);
  
  while (current <= endDate) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

module.exports = {
  startOfDay,
  endOfDay,
  dayRange,
  addDays,
  addHours,
  addMinutes,
  diffInMinutes,
  diffInHours,
  diffInDays,
  isWithinRange,
  formatTime,
  formatDate,
  formatISO,
  formatBR,
  isBusinessHours,
  startOfMonth,
  endOfMonth,
  getDateRange,
};