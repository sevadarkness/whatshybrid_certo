/**
 * @fileoverview Configuração e conexão com MongoDB
 * @module config/database
 */

const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../infra/logging/Logger');

/**
 * Opções de conexão do Mongoose
 */
const mongooseOptions = {
  autoIndex: !env.IS_PRODUCTION,
  maxPoolSize: env.IS_PRODUCTION ? 50 : 10,
  minPoolSize: env.IS_PRODUCTION ? 10 : 2,
  socketTimeoutMS: 45000,
  serverSelectionTimeoutMS: 10000,
  heartbeatFrequencyMS: 10000,
  retryWrites: true,
  w: 'majority',
};

/**
 * Conecta ao MongoDB
 * @returns {Promise<mongoose.Connection>}
 */
async function connectDB() {
  mongoose.set('strictQuery', true);

  // Event handlers
  mongoose.connection.on('connected', () => {
    logger.info({ msg: '📦 MongoDB conectado', db: env.MONGO_DB_NAME });
  });

  mongoose.connection.on('error', (err) => {
    logger.error({ msg: 'Erro MongoDB', error: err.message });
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn({ msg: 'MongoDB desconectado' });
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await mongoose.connection.close();
    logger.info({ msg: 'MongoDB desconectado via SIGINT' });
    process.exit(0);
  });

  try {
    await mongoose.connect(env.MONGO_URI, mongooseOptions);
    return mongoose.connection;
  } catch (error) {
    logger.error({ msg: 'Falha ao conectar MongoDB', error: error.message });
    // FULL MODE: não derruba o servidor se Mongo não estiver disponível.
    // As rotas v2 que dependem do Mongo retornarão erro até você configurar corretamente.
    return null;
  }
}

/**
 * Desconecta do MongoDB
 * @returns {Promise<void>}
 */
async function disconnectDB() {
  await mongoose.connection.close();
}

/**
 * Verifica status da conexão
 * @returns {Object}
 */
function getConnectionStatus() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return {
    status: states[mongoose.connection.readyState] || 'unknown',
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    name: mongoose.connection.name,
  };
}

/**
 * Executa transação
 * @template T
 * @param {(session: mongoose.ClientSession) => Promise<T>} fn - Função a executar
 * @returns {Promise<T>}
 */
async function withTransaction(fn) {
  const session = await mongoose.startSession();
  
  try {
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

module.exports = {
  connectDB,
  disconnectDB,
  getConnectionStatus,
  withTransaction,
  mongoose,
};