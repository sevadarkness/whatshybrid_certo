/**
 * Compatibility layer
 *
 * Some modules expect middlewares under `shared/middlewares/*`.
 * The implementation lives in `shared/http/*`.
 */

const asyncHandlerImpl = require('../http/asyncHandler');

module.exports = {
  asyncHandler: asyncHandlerImpl,
  asyncMiddlewares: asyncHandlerImpl.asyncMiddlewares,
  asyncWithTimeout: asyncHandlerImpl.asyncWithTimeout,
};
