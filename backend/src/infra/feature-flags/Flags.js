/**
 * @fileoverview Sistema de feature flags
 * @module infra/feature-flags/Flags
 */

const { getRedis, isRedisAvailable } = require('../../config/redis');
const logger = require('../logging/Logger');

/**
 * Flags padrão da aplicação
 */
const DEFAULT_FLAGS = {
  // Features gerais
  MAINTENANCE_MODE: false,
  ENABLE_AI: true,
  ENABLE_WEBHOOKS: true,
  ENABLE_ANALYTICS: true,
  
  // Features experimentais
  NEW_WHATSAPP_ENGINE: false,
  AI_AUTO_RESPONSE: false,
  ADVANCED_SCORING: false,
  
  // Features de billing
  ENABLE_STRIPE: true,
  ENABLE_FREE_TIER: true,
  
  // Features de CRM
  ENABLE_CUSTOM_FIELDS: true,
  ENABLE_PIPELINES: true,
  ENABLE_SLA: true,
  
  // Debug
  DEBUG_MODE: false,
  VERBOSE_LOGGING: false,
};

/**
 * Gerenciador de Feature Flags
 */
class FeatureFlagManager {
  constructor() {
    this.localFlags = { ...DEFAULT_FLAGS };
    this.redisPrefix = 'ff:';
    this.useRedis = false;
    this.initialized = false;
  }

  /**
   * Inicializa o gerenciador
   */
  async initialize() {
    if (this.initialized) return;

    // Carrega flags de variáveis de ambiente
    this.loadFromEnv();

    // Tenta usar Redis se disponível
    if (await isRedisAvailable()) {
      this.useRedis = true;
      await this.syncToRedis();
      logger.info({ msg: 'FeatureFlags usando Redis' });
    } else {
      logger.info({ msg: 'FeatureFlags usando memória' });
    }

    this.initialized = true;
  }

  /**
   * Carrega flags de variáveis de ambiente
   */
  loadFromEnv() {
    for (const key of Object.keys(DEFAULT_FLAGS)) {
      const envKey = `FF_${key}`;
      const envValue = process.env[envKey];
      
      if (envValue !== undefined) {
        this.localFlags[key] = this.parseValue(envValue);
      }
    }
  }

  /**
   * Parseia valor de string para tipo apropriado
   * @param {string} value - Valor em string
   * @returns {boolean|number|string}
   */
  parseValue(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (!isNaN(value)) return Number(value);
    return value;
  }

  /**
   * Sincroniza flags locais para Redis
   */
  async syncToRedis() {
    if (!this.useRedis) return;

    try {
      const redis = getRedis();
      const pipeline = redis.pipeline();

      for (const [key, value] of Object.entries(this.localFlags)) {
        pipeline.set(`${this.redisPrefix}${key}`, JSON.stringify(value));
      }

      await pipeline.exec();
    } catch (error) {
      logger.warn({ msg: 'Falha ao sincronizar flags para Redis', error: error.message });
    }
  }

  /**
   * Verifica se uma flag está habilitada
   * @param {string} flagName - Nome da flag
   * @param {Object} [context] - Contexto (workspace, user, etc)
   * @returns {Promise<boolean>}
   */
  async isEnabled(flagName, context = {}) {
    // Primeiro verifica flags específicas por workspace/user
    if (context.workspaceId) {
      const workspaceFlag = await this.getWorkspaceFlag(flagName, context.workspaceId);
      if (workspaceFlag !== null) {
        return workspaceFlag;
      }
    }

    // Depois verifica flag global
    return this.getGlobalFlag(flagName);
  }

  /**
   * Obtém flag global
   * @param {string} flagName - Nome da flag
   * @returns {Promise<boolean>}
   */
  async getGlobalFlag(flagName) {
    if (this.useRedis) {
      try {
        const redis = getRedis();
        const value = await redis.get(`${this.redisPrefix}${flagName}`);
        if (value !== null) {
          return JSON.parse(value);
        }
      } catch {
        // Fallback para local
      }
    }

    return Boolean(this.localFlags[flagName] ?? DEFAULT_FLAGS[flagName] ?? false);
  }

  /**
   * Obtém flag específica de workspace
   * @param {string} flagName - Nome da flag
   * @param {string} workspaceId - ID do workspace
   * @returns {Promise<boolean|null>}
   */
  async getWorkspaceFlag(flagName, workspaceId) {
    if (!this.useRedis) return null;

    try {
      const redis = getRedis();
      const value = await redis.get(`${this.redisPrefix}ws:${workspaceId}:${flagName}`);
      if (value !== null) {
        return JSON.parse(value);
      }
    } catch {
      // Não tem override específico
    }

    return null;
  }

  /**
   * Define flag global
   * @param {string} flagName - Nome da flag
   * @param {boolean} value - Valor
   */
  async setFlag(flagName, value) {
    this.localFlags[flagName] = value;

    if (this.useRedis) {
      try {
        const redis = getRedis();
        await redis.set(`${this.redisPrefix}${flagName}`, JSON.stringify(value));
      } catch (error) {
        logger.warn({ msg: 'Falha ao salvar flag no Redis', flag: flagName, error: error.message });
      }
    }

    logger.info({ msg: 'Flag atualizada', flag: flagName, value });
  }

  /**
   * Define flag para workspace específico
   * @param {string} flagName - Nome da flag
   * @param {string} workspaceId - ID do workspace
   * @param {boolean} value - Valor
   */
  async setWorkspaceFlag(flagName, workspaceId, value) {
    if (!this.useRedis) {
      logger.warn({ msg: 'Flags por workspace requer Redis' });
      return;
    }

    try {
      const redis = getRedis();
      await redis.set(`${this.redisPrefix}ws:${workspaceId}:${flagName}`, JSON.stringify(value));
      logger.info({ msg: 'Flag de workspace atualizada', flag: flagName, workspaceId, value });
    } catch (error) {
      logger.warn({ msg: 'Falha ao salvar flag de workspace', flag: flagName, error: error.message });
    }
  }

  /**
   * Remove override de workspace
   * @param {string} flagName - Nome da flag
   * @param {string} workspaceId - ID do workspace
   */
  async removeWorkspaceFlag(flagName, workspaceId) {
    if (!this.useRedis) return;

    try {
      const redis = getRedis();
      await redis.del(`${this.redisPrefix}ws:${workspaceId}:${flagName}`);
    } catch (error) {
      logger.warn({ msg: 'Falha ao remover flag de workspace', flag: flagName, error: error.message });
    }
  }

  /**
   * Obtém todas as flags
   * @returns {Promise<Object>}
   */
  async getAllFlags() {
    const flags = { ...DEFAULT_FLAGS, ...this.localFlags };

    if (this.useRedis) {
      try {
        const redis = getRedis();
        const keys = await redis.keys(`${this.redisPrefix}[^^w]*`); // Exclui ws:
        
        for (const key of keys) {
          const flagName = key.replace(this.redisPrefix, '');
          const value = await redis.get(key);
          if (value !== null) {
            flags[flagName] = JSON.parse(value);
          }
        }
      } catch {
        // Usa local
      }
    }

    return flags;
  }

  /**
   * Verifica se está em modo de manutenção
   * @returns {Promise<boolean>}
   */
  async isMaintenanceMode() {
    return this.isEnabled('MAINTENANCE_MODE');
  }

  /**
   * Cria middleware que verifica flag
   * @param {string} flagName - Nome da flag
   * @param {Object} [options] - Opções
   * @returns {Function} Middleware Express
   */
  requireFlag(flagName, options = {}) {
    const { errorMessage = 'Funcionalidade desabilitada', statusCode = 503 } = options;
    
    return async (req, res, next) => {
      const context = {
        workspaceId: req.user?.workspaceId,
        userId: req.user?.id,
      };

      const enabled = await this.isEnabled(flagName, context);
      
      if (!enabled) {
        return res.status(statusCode).json({
          success: false,
          error: {
            code: 'FEATURE_DISABLED',
            message: errorMessage,
          },
        });
      }

      next();
    };
  }
}

// Singleton
let instance = null;

/**
 * Obtém instância singleton
 * @returns {FeatureFlagManager}
 */
function getFeatureFlags() {
  if (!instance) {
    instance = new FeatureFlagManager();
  }
  return instance;
}

// Atalhos
const isEnabled = async (flag, context) => getFeatureFlags().isEnabled(flag, context);
const setFlag = async (flag, value) => getFeatureFlags().setFlag(flag, value);

module.exports = {
  DEFAULT_FLAGS,
  FeatureFlagManager,
  getFeatureFlags,
  isEnabled,
  setFlag,
};
