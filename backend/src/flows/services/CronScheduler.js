const EventEmitter = require('events');
const cron = require('node-cron');
const Flow = require('../models/Flow');
const { TRIGGER_TYPES, STEP_TYPES } = require('../constants/flowConstants');

class CronScheduler extends EventEmitter {
  constructor(options = {}) {
    super();
    this.eventDispatcher = options.eventDispatcher;
    this.contactService = options.contactService; // opcional: listContactsForScheduled(userId, filter)
    this.logger = options.logger || console;

    this.activeJobs = new Map(); // flowId -> cronTask
    this.isRunning = false;

    this.stats = { jobsScheduled: 0, jobsExecuted: 0, errors: 0 };
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;

    await this.loadAndScheduleFlows();

    this.logger.info('CronScheduler started');
  }

  stop() {
    this.logger.info('Stopping CronScheduler...');
    for (const task of this.activeJobs.values()) task.stop();
    this.activeJobs.clear();
    this.isRunning = false;
  }

  async loadAndScheduleFlows() {
    try {
      const flows = await Flow.find({
        enabled: true,
        deletedAt: null,
        'steps.trigger.type': TRIGGER_TYPES.SCHEDULED,
      });

      this.logger.info(`Scheduled flows found: ${flows.length}`);

      for (const flow of flows) this.scheduleFlow(flow);
    } catch (e) {
      this.stats.errors++;
      this.logger.error('CronScheduler load error', { error: e.message });
    }
  }

  getScheduledTriggerStep(flow) {
    return flow.steps.find((s) => s.type === STEP_TYPES.TRIGGER && s.trigger?.type === TRIGGER_TYPES.SCHEDULED);
  }

  scheduleFlow(flow) {
    this.unscheduleFlow(flow._id);

    const triggerStep = this.getScheduledTriggerStep(flow);
    const cfg = triggerStep?.trigger?.config || {};

    if (!cfg.cron) {
      this.logger.warn(`Flow ${flow._id} ignored: missing cron`);
      return;
    }

    if (!cron.validate(cfg.cron)) {
      this.stats.errors++;
      this.logger.error(`Flow ${flow._id} ignored: invalid cron (${cfg.cron})`);
      return;
    }

    try {
      const task = cron.schedule(
        cfg.cron,
        async () => {
          await this.executeScheduledFlow(flow, cfg).catch((e) => {
            this.stats.errors++;
            this.logger.error(`Scheduled execution failed for flow ${flow._id}`, { error: e.message });
          });
        },
        { scheduled: true, timezone: cfg.timezone || flow.settings.timezone || 'America/Sao_Paulo' }
      );

      this.activeJobs.set(String(flow._id), task);
      this.stats.jobsScheduled++;

      this.logger.info(`Flow scheduled: ${flow._id} -> ${cfg.cron}`);
    } catch (e) {
      this.stats.errors++;
      this.logger.error(`Error scheduling flow ${flow._id}`, { error: e.message });
    }
  }

  unscheduleFlow(flowId) {
    const id = String(flowId);
    const task = this.activeJobs.get(id);
    if (!task) return;
    task.stop();
    this.activeJobs.delete(id);
  }

  async executeScheduledFlow(flow, cfg) {
    this.stats.jobsExecuted++;

    if (!this.eventDispatcher) {
      this.logger.warn('CronScheduler: eventDispatcher not configured');
      return;
    }

    let contacts = [];
    if (this.contactService?.listContactsForScheduled) {
      contacts = await this.contactService.listContactsForScheduled(String(flow.userId), cfg.filterContacts || {});
    }

    await this.eventDispatcher.dispatch('scheduler:cron', {
      userId: String(flow.userId),
      scheduledTime: new Date(),
      contacts,
      cron: cfg.cron,
      timezone: cfg.timezone,
      // opcional: limitar a um flow específico via payload
      // flowId: String(flow._id),
    });
  }

  async refreshFlow(flowId) {
    try {
      const flow = await Flow.findById(flowId);
      if (!flow) {
        this.unscheduleFlow(flowId);
        return;
      }

      const hasScheduled = Boolean(this.getScheduledTriggerStep(flow));
      if (flow.enabled && hasScheduled) this.scheduleFlow(flow);
      else this.unscheduleFlow(flowId);
    } catch (e) {
      this.stats.errors++;
      this.logger.error(`CronScheduler refresh error ${flowId}`, { error: e.message });
    }
  }
}

module.exports = CronScheduler;