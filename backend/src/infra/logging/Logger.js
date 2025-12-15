/**
 * @fileoverview Logger centralizado com Winston
 * @module infra/logging/Logger
 */

const winston = require('winston');
const env = require('../../config/env');

/**
 * Formato customizado para desenvolvimento
 */
const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} ${level}: ${message} ${metaStr}`;
  })
);

/**
 * Formato JSON para produção
 */
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * Cria instância do logger
 */
const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: env.IS_PRODUCTION ? prodFormat : devFormat,
  defaultMeta: {
    service: env.APP.NAME,
    environment: env.NODE_ENV,
  },
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error'],
    }),
  ],
  // Não sair em erros de logging
  exitOnError: false,
});

// Adiciona file transport em produção (opcional)
if (env.IS_PRODUCTION && process.env.LOG_FILE) {
  logger.add(
    new winston.transports.File({
      filename: process.env.LOG_FILE,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    })
  );
}

/**
 * Logger com contexto
 * @param {Object} context - Contexto a incluir em todos os logs
 * @returns {Object} Logger com contexto
 */
function createContextLogger(context = {}) {
  return {
    error: (data) => logger.error({ ...context, ...normalizeLogData(data) }),
    warn: (data) => logger.warn({ ...context, ...normalizeLogData(data) }),
    info: (data) => logger.info({ ...context, ...normalizeLogData(data) }),
    http: (data) => logger.http({ ...context, ...normalizeLogData(data) }),
    debug: (data) => logger.debug({ ...context, ...normalizeLogData(data) }),
  };
}

/**
 * Normaliza dados de log
 * @param {Object|string} data - Dados do log
 * @returns {Object}
 */
function normalizeLogData(data) {
  if (typeof data === 'string') {
    return { message: data };
  }
  
  if (data instanceof Error) {
    return {
      message: data.message,
      stack: data.stack,
      name: data.name,
    };
  }
  
  return data;
}

// Métodos de conveniência
logger.createContextLogger = createContextLogger;

module.exports = logger;