/**
 * @fileoverview Gerenciador de cache com suporte a Redis e memória
 * @module infra/cache/CacheManager
 */

const { getRedis, isRedisAvailable } = require('../../config/redis');
const logger = require('../logging/Logger');

/**
 * Cache em memória (fallback)
 */
class MemoryCache {
  constructor() {
    this.store = new Map();
    this.timers = new Map();
  }

  async get(key) {
    const item = this.store.get(key);
    if (!item) return null;
    
    if (item.expiresAt && item.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    
    return item.value;
  }

  async set(key, value, ttlSeconds = null) {
    // Limpa timer anterior se existir
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    const item = {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    };
    
    this.store.set(key, item);

    if (ttlSeconds) {
      const timer = setTimeout(() => {
        this.store.delete(key);
        this.timers.delete(key);
      }, ttlSeconds * 1000);
      
      this.timers.set(key, timer);
    }
  }

  async del(key) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
    return this.store.delete(key);
  }

  async exists(key) {
    return this.store.has(key);
  }

  async clear() {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.store.clear();
  }

  getStats() {
    return {
      size: this.store.size,
      type: 'memory',
    };
  }
}

/**
 * Cache com Redis
 */
class RedisCache {
  constructor(prefix = 'cache:') {
    this.prefix = prefix;
    this.redis = getRedis();
  }

  key(k) {
    return `${this.prefix}${k}`;
  }

  async get(key) {
    try {
      const value = await this.redis.get(this.key(key));
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.warn({ msg: 'Cache get error', key, error: error.message });
      return null;
    }
  }

  async set(key, value, ttlSeconds = null) {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await this.redis.setex(this.key(key), ttlSeconds, serialized);
      } else {
        await this.redis.set(this.key(key), serialized);
      }
    } catch (error) {
      logger.warn({ msg: 'Cache set error', key, error: error.message });
    }
  }

  async del(key) {
    try {
      await this.redis.del(this.key(key));
      return true;
    } catch (error) {
      logger.warn({ msg: 'Cache del error', key, error: error.message });
      return false;
    }
  }

  async exists(key) {
    try {
      return (await this.redis.exists(this.key(key))) === 1;
    } catch {
      return false;
    }
  }

  async clear() {
    try {
      const keys = await this.redis.keys(`${this.prefix}*`);
      if (keys.length) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      logger.warn({ msg: 'Cache clear error', error: error.message });
    }
  }

  getStats() {
    return {
      type: 'redis',
      prefix: this.prefix,
    };
  }
}

/**
 * Gerenciador de cache híbrido
 */
class CacheManager {
  constructor(options = {}) {
    this.defaultTTL = options.defaultTTL || 300; // 5 minutos
    this.prefix = options.prefix || 'cache:';
    this.memoryCache = new MemoryCache();
    this.redisCache = null;
    this.useRedis = false;
  }

  /**
   * Inicializa o cache manager
   */
  async initialize() {
    if (await isRedisAvailable()) {
      this.redisCache = new RedisCache(this.prefix);
      this.useRedis = true;
      logger.info({ msg: 'CacheManager usando Redis' });
    } else {
      logger.info({ msg: 'CacheManager usando memória (Redis não disponível)' });
    }
  }

  /**
   * Obtém cache ativo
   * @returns {MemoryCache|RedisCache}
   */
  getCache() {
    return this.useRedis && this.redisCache ? this.redisCache : this.memoryCache;
  }

  /**
   * Obtém valor do cache
   * @template T
   * @param {string} key - Chave
   * @returns {Promise<T|null>}
   */
  async get(key) {
    return this.getCache().get(key);
  }

  /**
   * Define valor no cache
   * @param {string} key - Chave
   * @param {*} value - Valor
   * @param {number} [ttlSeconds] - TTL em segundos
   */
  async set(key, value, ttlSeconds = this.defaultTTL) {
    return this.getCache().set(key, value, ttlSeconds);
  }

  /**
   * Remove valor do cache
   * @param {string} key - Chave
   */
  async del(key) {
    return this.getCache().del(key);
  }

  /**
   * Verifica se chave existe
   * @param {string} key - Chave
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    return this.getCache().exists(key);
  }

  /**
   * Limpa todo o cache
   */
  async clear() {
    return this.getCache().clear();
  }

  /**
   * Get or Set - Obtém do cache ou executa função e cacheia
   * @template T
   * @param {string} key - Chave
   * @param {() => Promise<T>} fn - Função para obter valor
   * @param {number} [ttlSeconds] - TTL
   * @returns {Promise<T>}
   */
  async getOrSet(key, fn, ttlSeconds = this.defaultTTL) {
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fn();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Invalida múltiplas chaves por padrão
   * @param {string} pattern - Padrão (ex: 'user:*')
   */
  async invalidatePattern(pattern) {
    if (this.useRedis && this.redisCache) {
      try {
        const redis = getRedis();
        const keys = await redis.keys(`${this.prefix}${pattern}`);
        if (keys.length) {
          await redis.del(...keys);
        }
      } catch (error) {
        logger.warn({ msg: 'Cache invalidatePattern error', pattern, error: error.message });
      }
    }
    // Memory cache não suporta pattern matching eficiente
  }

  /**
   * Obtém estatísticas do cache
   */
  getStats() {
    return this.getCache().getStats();
  }

  /**
   * Cria decorator para cachear método
   * @param {string} keyPrefix - Prefixo da chave
   * @param {number} [ttlSeconds] - TTL
   * @returns {Function}
   */
  cached(keyPrefix, ttlSeconds = this.defaultTTL) {
    const cache = this;
    
    return function decorator(target, propertyKey, descriptor) {
      const originalMethod = descriptor.value;

      descriptor.value = async function (...args) {
        const cacheKey = `${keyPrefix}:${JSON.stringify(args)}`;
        
        return cache.getOrSet(cacheKey, () => originalMethod.apply(this, args), ttlSeconds);
      };

      return descriptor;
    };
  }
}

// Singleton
let instance = null;

/**
 * Obtém instância singleton do CacheManager
 * @returns {CacheManager}
 */
function getCacheManager() {
  if (!instance) {
    instance = new CacheManager();
  }
  return instance;
}

module.exports = {
  CacheManager,
  getCacheManager,
  MemoryCache,
  RedisCache,
};