/**
 * @fileoverview Health check da aplicação
 * @module infra/health/HealthCheck
 */

const { getConnectionStatus } = require('../../config/database');
const { isRedisAvailable, getRedis } = require('../../config/redis');
const env = require('../../config/env');

/**
 * @typedef {Object} ServiceStatus
 * @property {string} status - 'healthy' | 'unhealthy' | 'degraded'
 * @property {number} [latency] - Latência em ms
 * @property {string} [error] - Mensagem de erro
 */

/**
 * @typedef {Object} HealthStatus
 * @property {string} status - Status geral
 * @property {number} uptime - Tempo de atividade em segundos
 * @property {string} timestamp - ISO timestamp
 * @property {string} version - Versão da aplicação
 * @property {Object} services - Status dos serviços
 */

/**
 * Verifica saúde do MongoDB
 * @returns {Promise<ServiceStatus>}
 */
async function checkMongo() {
  const start = Date.now();
  
  try {
    const { status, readyState } = getConnectionStatus();
    const latency = Date.now() - start;
    
    if (readyState === 1) {
      return { status: 'healthy', latency };
    }
    
    return { status: 'unhealthy', error: `Estado: ${status}` };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}

/**
 * Verifica saúde do Redis
 * @returns {Promise<ServiceStatus>}
 */
async function checkRedis() {
  const start = Date.now();
  
  try {
    const available = await isRedisAvailable();
    const latency = Date.now() - start;
    
    if (available) {
      return { status: 'healthy', latency };
    }
    
    return { status: 'degraded', error: 'Redis não disponível (opcional)' };
  } catch (error) {
    return { status: 'degraded', error: error.message };
  }
}

/**
 * Verifica uso de memória
 * @returns {ServiceStatus}
 */
function checkMemory() {
  const used = process.memoryUsage();
  const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
  const percentage = (used.heapUsed / used.heapTotal) * 100;
  
  if (percentage > 90) {
    return {
      status: 'unhealthy',
      error: `Memória crítica: ${heapUsedMB}/${heapTotalMB}MB (${percentage.toFixed(1)}%)`,
    };
  }
  
  if (percentage > 75) {
    return {
      status: 'degraded',
      error: `Memória alta: ${heapUsedMB}/${heapTotalMB}MB (${percentage.toFixed(1)}%)`,
    };
  }
  
  return {
    status: 'healthy',
    latency: 0,
  };
}

/**
 * Executa health check completo
 * @returns {Promise<HealthStatus>}
 */
async function checkHealth() {
  const [mongo, redis, memory] = await Promise.all([
    checkMongo(),
    checkRedis(),
    Promise.resolve(checkMemory()),
  ]);

  const services = { mongo, redis, memory };
  
  // Determina status geral
  const statuses = Object.values(services).map((s) => s.status);
  
  let overallStatus = 'healthy';
  if (statuses.includes('unhealthy')) {
    overallStatus = 'unhealthy';
  } else if (statuses.includes('degraded')) {
    overallStatus = 'degraded';
  }

  return {
    status: overallStatus,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: env.NODE_ENV,
    services,
  };
}

/**
 * Health check simplificado (liveness)
 * @returns {Object}
 */
function livenessCheck() {
  return {
    status: 'alive',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Readiness check (pronto para receber tráfego)
 * @returns {Promise<Object>}
 */
async function readinessCheck() {
  const mongo = await checkMongo();
  
  const isReady = mongo.status === 'healthy';
  
  return {
    ready: isReady,
    timestamp: new Date().toISOString(),
    mongo: mongo.status,
  };
}

module.exports = {
  checkHealth,
  livenessCheck,
  readinessCheck,
  checkMongo,
  checkRedis,
  checkMemory,
};