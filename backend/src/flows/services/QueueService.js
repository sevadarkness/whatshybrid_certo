const Queue = require('bull');

class QueueService {
  constructor(options = {}) {
    this.logger = options.logger || console;

    const redis = options.redis || { host: 'localhost', port: 6379 };
    this.engine = options.engine;

    this.queue = new Queue('flow-delay-queue', { redis });

    this.queue.process(async (job) => {
      const { executionId } = job.data;
      this.logger.info(`Queue job: resume execution ${executionId}`);
      if (!this.engine) throw new Error('FlowEngine not configured in QueueService');
      await this.engine.resumeExecution(executionId);
    });

    this.logger.info('QueueService started');
  }

  async add(name, data, opts = {}) {
    // compat com FlowEngine.scheduleDelayedResume
    return this.queue.add(name, data, opts);
  }
}

module.exports = QueueService;
