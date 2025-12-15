/**
 * @fileoverview Configuração e conexão com Redis
 * @module config/redis
 */

const Redis = require('ioredis');
const env = require('./env');
const logger = require('../infra/logging/Logger');

/** @type {Redis|null} */
let client = null;

/** @type {Redis|null} */
let subscriber = null;

/**
 * Opções padrão do Redis
 */
const defaultOptions = {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    if (times > 10) {
      logger.error({ msg: 'Redis: máximo de tentativas atingido' });
      return null;
    }
    return Math.min(times * 100, 3000);
  },
  reconnectOnError: (err) => {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
    return targetErrors.some((e) => err.message.includes(e));
  },
  enableReadyCheck: true,
  lazyConnect: true,
};

/**
 * Cria cliente Redis
 * @param {Object} [options] - Opções adicionais
 * @returns {Redis}
 */
function createRedisClient(options = {}) {
  const opts = { ...defaultOptions, ...options };

  const redis = env.REDIS_URL
    ? new Redis(env.REDIS_URL, opts)
    : new Redis({
        host: 'localhost',
        port: 6379,
        ...opts,
      });

  redis.on('connect', () => {
    logger.info({ msg: '🔴 Redis conectando...' });
  });

  redis.on('ready', () => {
    logger.info({ msg: '🔴 Redis pronto' });
  });

  redis.on('error', (err) => {
    logger.error({ msg: 'Erro Redis', error: err.message });
  });

  redis.on('close', () => {
    logger.warn({ msg: 'Redis conexão fechada' });
  });

  return redis;
}

/**
 * Obtém cliente Redis singleton
 * @returns {Redis}
 */
function getRedis() {
  if (!client) {
    client = createRedisClient();
    client.connect().catch((err) => {
      logger.error({ msg: 'Falha ao conectar Redis', error: err.message });
    });
  }
  return client;
}

/**
 * Obtém cliente Redis para pub/sub
 * @returns {Redis}
 */
function getSubscriber() {
  if (!subscriber) {
    subscriber = createRedisClient();
    subscriber.connect().catch((err) => {
      logger.error({ msg: 'Falha ao conectar Redis subscriber', error: err.message });
    });
  }
  return subscriber;
}

/**
 * Verifica se Redis está disponível
 * @returns {Promise<boolean>}
 */
async function isRedisAvailable() {
  try {
    const redis = getRedis();
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Fecha conexões Redis
 * @returns {Promise<void>}
 */
async function closeRedis() {
  const promises = [];
  
  if (client) {
    promises.push(client.quit());
    client = null;
  }
  
  if (subscriber) {
    promises.push(subscriber.quit());
    subscriber = null;
  }
  
  await Promise.all(promises);
}

/**
 * Wrapper para operações com prefixo
 */
class RedisWrapper {
  constructor(redis, prefix = env.REDIS_PREFIX) {
    this.redis = redis;
    this.prefix = prefix;
  }

  key(k) {
    return `${this.prefix}${k}`;
  }

  async get(key) {
    const value = await this.redis.get(this.key(key));
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  async set(key, value, ttlSeconds = null) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds) {
      return this.redis.setex(this.key(key), ttlSeconds, serialized);
    }
    return this.redis.set(this.key(key), serialized);
  }

  async del(key) {
    return this.redis.del(this.key(key));
  }

  async exists(key) {
    return this.redis.exists(this.key(key));
  }

  async incr(key) {
    return this.redis.incr(this.key(key));
  }

  async expire(key, ttlSeconds) {
    return this.redis.expire(this.key(key), ttlSeconds);
  }

  async ttl(key) {
    return this.redis.ttl(this.key(key));
  }

  async keys(pattern) {
    return this.redis.keys(this.key(pattern));
  }

  async hget(key, field) {
    const value = await this.redis.hget(this.key(key), field);
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  async hset(key, field, value) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    return this.redis.hset(this.key(key), field, serialized);
  }

  async hgetall(key) {
    const data = await this.redis.hgetall(this.key(key));
    const result = {};
    for (const [k, v] of Object.entries(data)) {
      try {
        result[k] = JSON.parse(v);
      } catch {
        result[k] = v;
      }
    }
    return result;
  }

  async lpush(key, ...values) {
    const serialized = values.map((v) => (typeof v === 'string' ? v : JSON.stringify(v)));
    return this.redis.lpush(this.key(key), ...serialized);
  }

  async rpush(key, ...values) {
    const serialized = values.map((v) => (typeof v === 'string' ? v : JSON.stringify(v)));
    return this.redis.rpush(this.key(key), ...serialized);
  }

  async lrange(key, start, stop) {
    const values = await this.redis.lrange(this.key(key), start, stop);
    return values.map((v) => {
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    });
  }

  async publish(channel, message) {
    const serialized = typeof message === 'string' ? message : JSON.stringify(message);
    return this.redis.publish(channel, serialized);
  }
}

/**
 * Obtém wrapper Redis
 * @returns {RedisWrapper}
 */
function getRedisWrapper() {
  return new RedisWrapper(getRedis());
}

module.exports = {
  getRedis,
  getSubscriber,
  isRedisAvailable,
  closeRedis,
  createRedisClient,
  RedisWrapper,
  getRedisWrapper,
};
