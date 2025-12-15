/**
 * Validation middleware (Joi)
 *
 * Several v2 modules use: `validate(schema)` and `validate(schema, 'params')`.
 * This file provides that API.
 */

const AppError = require('../errors/AppError');

/**
 * @param {import('joi').Schema} schema Joi schema
 * @param {'body'|'query'|'params'|'headers'} [source='body'] Where to validate
 */
function validate(schema, source = 'body') {
  if (!schema || typeof schema.validate !== 'function') {
    throw new Error('validate(schema): schema inválido (esperado Joi)');
  }

  return (req, _res, next) => {
    try {
      const payload = (req && req[source]) || {};
      const { error, value } = schema.validate(payload, {
        abortEarly: false,
        stripUnknown: true,
        allowUnknown: true,
      });

      if (error) {
        const details = (error.details || []).map((d) => ({
          path: Array.isArray(d.path) ? d.path.join('.') : String(d.path || ''),
          message: d.message,
          type: d.type,
        }));

        return next(AppError.validation('Dados inválidos', { source, details }));
      }

      // Normalize request with validated values
      if (req && source) req[source] = value;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { validate };
