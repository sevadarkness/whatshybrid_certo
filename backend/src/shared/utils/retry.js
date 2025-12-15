/**
 * @fileoverview Utilitário de retry com backoff exponencial
 * @module shared/utils/retry
 */

const logger = require('../../infra/logging/Logger');

/**
 * @typedef {Object} RetryOptions
 * @property {number} [maxAttempts=3] - Número máximo de tentativas
 * @property {number} [initialDelay=1000] - Delay inicial em ms
 * @property {number} [maxDelay=30000] - Delay máximo em ms
 * @property {number} [backoffFactor=2] - Fator de multiplicação do delay
 * @property {Function} [shouldRetry] - Função que determina se deve retry
 * @property {Function} [onRetry] - Callback executado a cada retry
 * @property {boolean} [jitter=true] - Adicionar variação aleatória ao delay
 */

/**
 * Executa função com retry e backoff exponencial
 * @template T
 * @param {() => Promise<T>} fn - Função assíncrona a executar
 * @param {RetryOptions} [options] - Opções de retry
 * @returns {Promise<T>}
 */
async function retry(fn, options = {}) {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
    shouldRetry = () => true,
    onRetry = null,
    jitter = true,
  } = options;

  let lastError;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === maxAttempts;
      const willRetry = !isLastAttempt && shouldRetry(error, attempt);

      if (!willRetry) {
        throw error;
      }

      // Calcula delay com jitter opcional
      let currentDelay = Math.min(delay, maxDelay);
      if (jitter) {
        currentDelay = currentDelay * (0.5 + Math.random());
      }

      // Callback de retry
      if (onRetry) {
        onRetry(error, attempt, currentDelay);
      }

      logger.warn({
        msg: 'Retry attempt',
        attempt,
        maxAttempts,
        delay: currentDelay,
        error: error.message,
      });

      // Aguarda antes de tentar novamente
      await sleep(currentDelay);

      // Aumenta o delay para próxima tentativa
      delay *= backoffFactor;
    }
  }

  throw lastError;
}

/**
 * Função de sleep
 * @param {number} ms - Milissegundos
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cria função com retry automático
 * @template T
 * @param {() => Promise<T>} fn - Função a wrappear
 * @param {RetryOptions} [options] - Opções de retry
 * @returns {() => Promise<T>}
 */
function withRetry(fn, options = {}) {
  return () => retry(fn, options);
}

/**
 * Verifica se erro é retryable baseado no status HTTP
 * @param {Error} error - Erro
 * @returns {boolean}
 */
function isRetryableHttpError(error) {
  const retryableStatuses = [408, 429, 500, 502, 503, 504];
  const status = error.response?.status || error.statusCode;
  
  if (status && retryableStatuses.includes(status)) {
    return true;
  }

  // Erros de rede
  const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'];
  if (error.code && retryableCodes.includes(error.code)) {
    return true;
  }

  return false;
}

/**
 * Circuit breaker simples
 */
class CircuitBreaker {
  /**
   * @param {Object} options
   * @param {number} [options.failureThreshold=5] - Falhas para abrir circuito
   * @param {number} [options.resetTimeout=60000] - Tempo para tentar reset (ms)
   */
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000;
    this.failures = 0;
    this.lastFailure = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  /**
   * Executa função protegida pelo circuit breaker
   * @template T
   * @param {() => Promise<T>} fn - Função a executar
   * @returns {Promise<T>}
   */
  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failures++;
    this.lastFailure = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      logger.warn({ msg: 'Circuit breaker opened', failures: this.failures });
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailure: this.lastFailure,
    };
  }
}

module.exports = {
  retry,
  sleep,
  withRetry,
  isRetryableHttpError,
  CircuitBreaker,
};