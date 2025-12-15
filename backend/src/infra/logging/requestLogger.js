/**
 * @fileoverview Middleware de logging de requests
 * @module infra/logging/requestLogger
 */

const morgan = require('morgan');
const logger = require('./Logger');
const { generateRequestId } = require('../../shared/utils/ids');

/**
 * Stream customizado para Winston
 */
const stream = {
  write: (message) => {
    logger.http({ message: message.trim() });
  },
};

/**
 * Formato customizado do Morgan
 */
morgan.token('request-id', (req) => req.id);
morgan.token('user-id', (req) => req.user?.id || '-');
morgan.token('workspace', (req) => req.user?.workspaceId || '-');

const format = ':method :url :status :response-time ms - :res[content-length] - :request-id - :user-id';

/**
 * Middleware de logging HTTP
 */
const requestLogger = morgan(format, { stream });

/**
 * Middleware que adiciona request ID
 * @param {import('express').Request} req - Request
 * @param {import('express').Response} res - Response
 * @param {import('express').NextFunction} next - Next
 */
function requestIdMiddleware(req, res, next) {
  req.id = req.headers['x-request-id'] || generateRequestId();
  res.setHeader('X-Request-ID', req.id);
  next();
}

/**
 * Middleware de logging detalhado (para debug)
 * @param {import('express').Request} req - Request
 * @param {import('express').Response} res - Response
 * @param {import('express').NextFunction} next - Next
 */
function detailedLogger(req, res, next) {
  const startTime = Date.now();

  // Log da request
  logger.debug({
    type: 'request',
    requestId: req.id,
    method: req.method,
    path: req.path,
    query: req.query,
    body: sanitizeBody(req.body),
    headers: sanitizeHeaders(req.headers),
    ip: req.ip,
  });

  // Intercepta o response
  const originalSend = res.send;
  res.send = function (body) {
    const duration = Date.now() - startTime;

    logger.debug({
      type: 'response',
      requestId: req.id,
      statusCode: res.statusCode,
      duration,
      bodySize: body ? body.length : 0,
    });

    return originalSend.call(this, body);
  };

  next();
}

/**
 * Sanitiza body para logging (remove dados sensíveis)
 * @param {Object} body - Body da request
 * @returns {Object}
 */
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body;

  const sensitiveFields = ['password', 'passwordHash', 'token', 'apiKey', 'secret', 'creditCard'];
  const sanitized = { ...body };

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}

/**
 * Sanitiza headers para logging
 * @param {Object} headers - Headers da request
 * @returns {Object}
 */
function sanitizeHeaders(headers) {
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
  const sanitized = { ...headers };

  for (const header of sensitiveHeaders) {
    if (sanitized[header]) {
      sanitized[header] = '[REDACTED]';
    }
  }

  return sanitized;
}

module.exports = {
  requestLogger,
  requestIdMiddleware,
  detailedLogger,
};