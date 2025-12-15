/**
 * @fileoverview Middleware global de tratamento de erros
 * @module shared/errors/errorMiddleware
 */

const AppError = require('./AppError');
const logger = require('../../infra/logging/Logger');

/**
 * Middleware de tratamento de erros
 * @param {Error} err - Erro capturado
 * @param {import('express').Request} req - Request do Express
 * @param {import('express').Response} res - Response do Express
 * @param {import('express').NextFunction} next - Next function
 */
function errorMiddleware(err, req, res, next) {
  // Evita enviar headers se já foram enviados
  if (res.headersSent) {
    return next(err);
  }

  const isAppError = err instanceof AppError;
  const isProduction = process.env.NODE_ENV === 'production';

  // Determina status e código
  const statusCode = isAppError ? err.statusCode : 500;
  const errorCode = isAppError ? err.errorCode : 'E1000';

  // Monta o payload de resposta
  const payload = {
    success: false,
    error: {
      code: errorCode,
      message: isAppError ? err.message : 'Erro interno do servidor',
      timestamp: new Date().toISOString(),
      requestId: req.id || req.headers['x-request-id'] || null,
    },
  };

  // Adiciona detalhes se for AppError e tiver
  if (isAppError && err.details) {
    payload.error.details = err.details;
  }

  // Em desenvolvimento, inclui informações de debug
  if (!isProduction) {
    payload.debug = {
      name: err.name,
      message: err.message,
      stack: err.stack?.split('\n').slice(0, 10),
      originalError: err.originalError || null,
    };
  }

  // Loga o erro
  const logPayload = {
    errorCode,
    statusCode,
    message: err.message,
    path: req.path,
    method: req.method,
    userId: req.user?.id || null,
    workspaceId: req.user?.workspaceId || null,
    requestId: payload.error.requestId,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  };

  if (statusCode >= 500) {
    logPayload.stack = err.stack;
    logger.error(logPayload);
  } else if (statusCode >= 400) {
    logger.warn(logPayload);
  }

  res.status(statusCode).json(payload);
}

/**
 * Middleware para rotas não encontradas
 * @param {import('express').Request} req - Request
 * @param {import('express').Response} res - Response
 * @param {import('express').NextFunction} next - Next
 */
function notFoundMiddleware(req, res, next) {
  next(AppError.notFound('Rota', req.path));
}

/**
 * Handler para erros não capturados
 */
function setupUncaughtHandlers() {
  process.on('uncaughtException', (error) => {
    logger.error({
      type: 'uncaughtException',
      message: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error({
      type: 'unhandledRejection',
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : null,
    });
  });
}

module.exports = {
  errorMiddleware,
  notFoundMiddleware,
  setupUncaughtHandlers,
};