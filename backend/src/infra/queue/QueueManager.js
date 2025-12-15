/**
 * @fileoverview Gerenciador de filas com BullMQ
 * @module infra/queue/QueueManager
 */

const { Queue, Worker, QueueEvents } = require('bullmq');
const { getRedis } = require('../../config/redis');
const logger = require('../logging/Logger');
const env = require('../../config/env');

/**
 * Configurações padrão das filas
 */
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: {
    count: 1000,
    age: 24 * 3600, // 24 horas
  },
  removeOnFail: {
    count: 5000,
    age: 7 * 24 * 3600, // 7 dias
  },
};

/**
 * Nomes das filas
 */
const QUEUE_NAMES = {
  EMAIL: 'email',
  WHATSAPP: 'whatsapp',
  AI_PROCESSING: 'ai-processing',
  ANALYTICS: 'analytics',
  EXPORT: 'export',
  NOTIFICATIONS: 'notifications',
  WEBHOOKS: 'webhooks',
};

/**
 * Gerenciador de filas
 */
class QueueManager {
  constructor() {
    /** @type {Map<string, Queue>} */
    this.queues = new Map();
    /** @type {Map<string, Worker>} */
    this.workers = new Map();
    /** @type {Map<string, QueueEvents>} */
    this.events = new Map();
    this.connection = null;
    this.initialized = false;
  }

  /**
   * Inicializa o gerenciador de filas
   */
  async initialize() {
    if (this.initialized) return;

    try {
      this.connection = getRedis();
      
      // Cria filas
      for (const name of Object.values(QUEUE_NAMES)) {
        await this.createQueue(name);
      }

      this.initialized = true;
      logger.info({ msg: 'QueueManager inicializado', queues: Object.values(QUEUE_NAMES) });
    } catch (error) {
      logger.error({ msg: 'Falha ao inicializar QueueManager', error: error.message });
      throw error;
    }
  }

  /**
   * Cria uma fila
   * @param {string} name - Nome da fila
   * @param {Object} [options] - Opções da fila
   * @returns {Queue}
   */
  async createQueue(name, options = {}) {
    if (this.queues.has(name)) {
      return this.queues.get(name);
    }

    const queue = new Queue(name, {
      connection: this.connection,
      defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, ...options.jobOptions },
      ...options,
    });

    // Event handlers
    const events = new QueueEvents(name, { connection: this.connection });
    
    events.on('completed', ({ jobId }) => {
      logger.debug({ msg: 'Job completado', queue: name, jobId });
    });

    events.on('failed', ({ jobId, failedReason }) => {
      logger.error({ msg: 'Job falhou', queue: name, jobId, reason: failedReason });
    });

    events.on('stalled', ({ jobId }) => {
      logger.warn({ msg: 'Job travado', queue: name, jobId });
    });

    this.queues.set(name, queue);
    this.events.set(name, events);

    return queue;
  }

  /**
   * Obtém uma fila
   * @param {string} name - Nome da fila
   * @returns {Queue}
   */
  getQueue(name) {
    const queue = this.queues.get(name);
    if (!queue) {
      throw new Error(`Fila não encontrada: ${name}`);
    }
    return queue;
  }

  /**
   * Adiciona job a uma fila
   * @param {string} queueName - Nome da fila
   * @param {string} jobName - Nome do job
   * @param {Object} data - Dados do job
   * @param {Object} [options] - Opções do job
   * @returns {Promise<Job>}
   */
  async addJob(queueName, jobName, data, options = {}) {
    const queue = this.getQueue(queueName);
    
    const job = await queue.add(jobName, data, {
      ...DEFAULT_JOB_OPTIONS,
      ...options,
    });

    logger.debug({ msg: 'Job adicionado', queue: queueName, jobName, jobId: job.id });
    return job;
  }

  /**
   * Adiciona múltiplos jobs
   * @param {string} queueName - Nome da fila
   * @param {Array<{name: string, data: Object, opts?: Object}>} jobs - Jobs
   * @returns {Promise<Job[]>}
   */
  async addBulk(queueName, jobs) {
    const queue = this.getQueue(queueName);
    return queue.addBulk(
      jobs.map((j) => ({
        name: j.name,
        data: j.data,
        opts: { ...DEFAULT_JOB_OPTIONS, ...j.opts },
      }))
    );
  }

  /**
   * Agenda job para execução futura
   * @param {string} queueName - Nome da fila
   * @param {string} jobName - Nome do job
   * @param {Object} data - Dados
   * @param {number} delayMs - Delay em ms
   * @param {Object} [options] - Opções
   */
  async scheduleJob(queueName, jobName, data, delayMs, options = {}) {
    return this.addJob(queueName, jobName, data, { ...options, delay: delayMs });
  }

  /**
   * Agenda job recorrente
   * @param {string} queueName - Nome da fila
   * @param {string} jobName - Nome do job
   * @param {Object} data - Dados
   * @param {string} pattern - Padrão cron
   * @param {Object} [options] - Opções
   */
  async scheduleRecurring(queueName, jobName, data, pattern, options = {}) {
    return this.addJob(queueName, jobName, data, {
      ...options,
      repeat: { pattern },
    });
  }

  /**
   * Registra worker para processar fila
   * @param {string} queueName - Nome da fila
   * @param {Function} processor - Função processadora
   * @param {Object} [options] - Opções do worker
   * @returns {Worker}
   */
  registerWorker(queueName, processor, options = {}) {
    if (this.workers.has(queueName)) {
      logger.warn({ msg: 'Worker já registrado', queue: queueName });
      return this.workers.get(queueName);
    }

    const worker = new Worker(queueName, processor, {
      connection: this.connection,
      concurrency: options.concurrency || 5,
      limiter: options.limiter || { max: 100, duration: 1000 },
      ...options,
    });

    worker.on('completed', (job) => {
      logger.debug({ msg: 'Job processado', queue: queueName, jobId: job.id, jobName: job.name });
    });

    worker.on('failed', (job, error) => {
      logger.error({
        msg: 'Job falhou',
        queue: queueName,
        jobId: job?.id,
        jobName: job?.name,
        error: error.message,
        stack: error.stack,
      });
    });

    worker.on('error', (error) => {
      logger.error({ msg: 'Erro no worker', queue: queueName, error: error.message });
    });

    this.workers.set(queueName, worker);
    logger.info({ msg: 'Worker registrado', queue: queueName, concurrency: options.concurrency || 5 });

    return worker;
  }

  /**
   * Obtém status das filas
   * @returns {Promise<Object>}
   */
  async getStatus() {
    const status = {};

    for (const [name, queue] of this.queues) {
      const counts = await queue.getJobCounts();
      status[name] = {
        ...counts,
        isPaused: await queue.isPaused(),
      };
    }

    return status;
  }

  /**
   * Pausa uma fila
   * @param {string} name - Nome da fila
   */
  async pauseQueue(name) {
    const queue = this.getQueue(name);
    await queue.pause();
    logger.info({ msg: 'Fila pausada', queue: name });
  }

  /**
   * Resume uma fila
   * @param {string} name - Nome da fila
   */
  async resumeQueue(name) {
    const queue = this.getQueue(name);
    await queue.resume();
    logger.info({ msg: 'Fila resumida', queue: name });
  }

  /**
   * Limpa jobs de uma fila
   * @param {string} name - Nome da fila
   * @param {string} [status] - Status dos jobs (completed, failed, delayed, wait)
   */
  async cleanQueue(name, status = 'completed') {
    const queue = this.getQueue(name);
    await queue.clean(0, 1000, status);
    logger.info({ msg: 'Fila limpa', queue: name, status });
  }

  /**
   * Fecha todas as conexões
   */
  async close() {
    const promises = [];

    for (const worker of this.workers.values()) {
      promises.push(worker.close());
    }

    for (const queue of this.queues.values()) {
      promises.push(queue.close());
    }

    for (const events of this.events.values()) {
      promises.push(events.close());
    }

    await Promise.all(promises);
    
    this.workers.clear();
    this.queues.clear();
    this.events.clear();
    this.initialized = false;

    logger.info({ msg: 'QueueManager fechado' });
  }
}

// Singleton
let instance = null;

/**
 * Obtém instância singleton do QueueManager
 * @returns {QueueManager}
 */
function getQueueManager() {
  if (!instance) {
    instance = new QueueManager();
  }
  return instance;
}

module.exports = {
  QueueManager,
  getQueueManager,
  QUEUE_NAMES,
};