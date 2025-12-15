/**
 * Compatibility layer for rate limiting.
 *
 * The core implementation is in `shared/http/rateLimiter.js`.
 */

const AppError = require('../errors/AppError');
const { createLimiter } = require('../http/rateLimiter');

/**
 * @param {Object} options
 * @param {number} [options.windowMs]
 * @param {number} [options.max]
 * @param {string} [options.message]
 * @param {Function} [options.keyGenerator]
 * @param {Function} [options.skip]
 */
function rateLimiter(options = {}) {
  const {
    message,
    windowMs,
    max,
    keyGenerator,
    skip,
  } = options;

  return createLimiter({
    windowMs,
    max,
    keyGenerator,
    skip,
    handler: (req, res, next) => {
      next(
        AppError.fromCode(
          'RATE_LIMIT_EXCEEDED',
          message || 'Muitas requisições. Tente novamente em alguns minutos.',
          { retryAfter: res.getHeader('Retry-After') }
        )
      );
    },
  });
}

module.exports = { rateLimiter };
