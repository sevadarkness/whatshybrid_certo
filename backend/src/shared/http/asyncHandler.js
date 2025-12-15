/**
 * @fileoverview Wrapper para handlers assíncronos
 * @module shared/http/asyncHandler
 */

/**
 * Wrapper que captura erros de funções assíncronas e passa para o next()
 * @param {Function} fn - Função assíncrona do controller
 * @returns {Function} Função wrapped
 */
function asyncHandler(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('asyncHandler requer uma função');
  }

  return function wrappedHandler(req, res, next) {
    const result = fn(req, res, next);
    
    // Verifica se é uma Promise
    if (result && typeof result.catch === 'function') {
      return result.catch(next);
    }
    
    return result;
  };
}

/**
 * Wrapper para múltiplos middlewares
 * @param {...Function} fns - Funções middleware
 * @returns {Function[]} Array de funções wrapped
 */
function asyncMiddlewares(...fns) {
  return fns.map((fn) => asyncHandler(fn));
}

/**
 * Wrapper que adiciona timeout à execução
 * @param {Function} fn - Função assíncrona
 * @param {number} [timeoutMs=30000] - Timeout em ms
 * @returns {Function} Função wrapped com timeout
 */
function asyncWithTimeout(fn, timeoutMs = 30000) {
  return asyncHandler(async (req, res, next) => {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Request timeout após ${timeoutMs}ms`));
      }, timeoutMs);
    });

    await Promise.race([fn(req, res, next), timeoutPromise]);
  });
}

module.exports = asyncHandler;
module.exports.asyncMiddlewares = asyncMiddlewares;
module.exports.asyncWithTimeout = asyncWithTimeout;