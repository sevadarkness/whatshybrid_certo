/**
 * @fileoverview Rate limiter configurável
 * @module shared/http/rateLimiter
 */

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const AppError = require('../errors/AppError');
const { getRedis } = require('../../config/redis');

/**
 * Cria store Redis para rate limiter (se disponível)
 * @returns {Object|undefined} Redis store ou undefined
 */
function createRedisStore() {
  try {
    const redis = getRedis();
    if (!redis) return undefined;

    return new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix: 'rl:',
    });
  } catch {
    return undefined;
  }
}

/**
 * Handler padrão quando limite é excedido
 * @param {import('express').Request} req - Request
 * @param {import('express').Response} res - Response
 * @param {import('express').NextFunction} next - Next
 */
function defaultHandler(req, res, next) {
  next(
    AppError.fromCode(
      'RATE_LIMIT_EXCEEDED',
      'Muitas requisições. Tente novamente em alguns minutos.',
      { retryAfter: res.getHeader('Retry-After') }
    )
  );
}

/**
 * Extrai chave do rate limiter baseada no usuário ou IP
 * @param {import('express').Request} req - Request
 * @returns {string} Chave única
 */
function keyGenerator(req) {
  if (req.user?.id) {
    return `user:${req.user.workspaceId}:${req.user.id}`;
  }
  return `ip:${req.ip}`;
}

/**
 * Rate limiter padrão para API
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 100, // 100 requests por minuto
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: defaultHandler,
  store: createRedisStore(),
  skip: (req) => req.path === '/healthz',
});

/**
 * Rate limiter para autenticação (mais restritivo)
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // 10 tentativas
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `auth:${req.ip}`,
  handler: defaultHandler,
  store: createRedisStore(),
});

/**
 * Rate limiter para operações de IA (mais restritivo por custo)
 */
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 20, // 20 requests por minuto
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: defaultHandler,
  store: createRedisStore(),
});

/**
 * Rate limiter para webhooks
 */
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `webhook:${req.ip}`,
  handler: defaultHandler,
  store: createRedisStore(),
});

/**
 * Cria rate limiter customizado
 * @param {Object} options - Opções do rate limiter
 * @returns {Function} Middleware
 */
function createLimiter(options = {}) {
  return rateLimit({
    windowMs: options.windowMs || 60 * 1000,
    max: options.max || 100,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: options.keyGenerator || keyGenerator,
    handler: options.handler || defaultHandler,
    store: createRedisStore(),
    skip: options.skip,
  });
}

module.exports = {
  apiLimiter,
  authLimiter,
  aiLimiter,
  webhookLimiter,
  createLimiter,
};