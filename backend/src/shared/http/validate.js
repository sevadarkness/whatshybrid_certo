/**
 * @fileoverview Middlewares de validação com Joi
 * @module shared/http/validate
 */

const AppError = require('../errors/AppError');

/**
 * Opções padrão para validação Joi
 */
const DEFAULT_OPTIONS = {
  abortEarly: false,
  stripUnknown: true,
  errors: {
    wrap: { label: '' },
  },
};

/**
 * Formata erros do Joi para resposta padronizada
 * @param {Object} error - Erro do Joi
 * @returns {Object} Detalhes formatados
 */
function formatJoiErrors(error) {
  if (!error.details) return null;

  return error.details.reduce((acc, detail) => {
    const key = detail.path.join('.');
    acc[key] = {
      message: detail.message,
      type: detail.type,
      value: detail.context?.value,
    };
    return acc;
  }, {});
}

/**
 * Cria middleware de validação para body
 * @param {Object} schema - Schema Joi
 * @param {Object} [options] - Opções de validação
 * @returns {Function} Middleware Express
 */
function validateBody(schema, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return (req, _res, next) => {
    const { error, value } = schema.validate(req.body, opts);

    if (error) {
      const details = formatJoiErrors(error);
      const firstMessage = error.details[0]?.message || 'Erro de validação';
      return next(AppError.validation(firstMessage, details));
    }

    req.body = value;
    next();
  };
}

/**
 * Cria middleware de validação para query params
 * @param {Object} schema - Schema Joi
 * @param {Object} [options] - Opções de validação
 * @returns {Function} Middleware Express
 */
function validateQuery(schema, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return (req, _res, next) => {
    const { error, value } = schema.validate(req.query, opts);

    if (error) {
      const details = formatJoiErrors(error);
      const firstMessage = error.details[0]?.message || 'Parâmetros inválidos';
      return next(AppError.validation(firstMessage, details));
    }

    req.query = value;
    next();
  };
}

/**
 * Cria middleware de validação para params
 * @param {Object} schema - Schema Joi
 * @param {Object} [options] - Opções de validação
 * @returns {Function} Middleware Express
 */
function validateParams(schema, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return (req, _res, next) => {
    const { error, value } = schema.validate(req.params, opts);

    if (error) {
      const details = formatJoiErrors(error);
      const firstMessage = error.details[0]?.message || 'Parâmetros de rota inválidos';
      return next(AppError.validation(firstMessage, details));
    }

    req.params = value;
    next();
  };
}

/**
 * Cria middleware de validação combinada
 * @param {Object} schemas - Schemas para body, query, params
 * @param {Object} [options] - Opções de validação
 * @returns {Function} Middleware Express
 */
function validate(schemas = {}, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return (req, _res, next) => {
    const errors = {};
    let hasErrors = false;

    if (schemas.body) {
      const { error, value } = schemas.body.validate(req.body, opts);
      if (error) {
        errors.body = formatJoiErrors(error);
        hasErrors = true;
      } else {
        req.body = value;
      }
    }

    if (schemas.query) {
      const { error, value } = schemas.query.validate(req.query, opts);
      if (error) {
        errors.query = formatJoiErrors(error);
        hasErrors = true;
      } else {
        req.query = value;
      }
    }

    if (schemas.params) {
      const { error, value } = schemas.params.validate(req.params, opts);
      if (error) {
        errors.params = formatJoiErrors(error);
        hasErrors = true;
      } else {
        req.params = value;
      }
    }

    if (hasErrors) {
      return next(AppError.validation('Dados inválidos', errors));
    }

    next();
  };
}

module.exports = {
  validateBody,
  validateQuery,
  validateParams,
  validate,
  formatJoiErrors,
};