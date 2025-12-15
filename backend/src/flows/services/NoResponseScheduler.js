const EventEmitter = require('events');
const Flow = require('../models/Flow');
const { TRIGGER_TYPES, DELAY_UNITS } = require('../constants/flowConstants');

class NoResponseScheduler extends EventEmitter {
  constructor(options = {}) {
    super();
    this.eventDispatcher = options.eventDispatcher;
    this.contactService = options.contactService; // precisa expor: findContactsWithPendingResponse(userId, since)
    this.messageService = options.messageService; // precisa expor: getLastMessage(contactId)
    this.logger = options.logger || console;

    this.config = {
      checkIntervalMs: options.checkIntervalMs || 60_000,
      enabled: options.enabled !== false,
      triggerCooldownMs: options.triggerCooldownMs || 60 * 60 * 1000,
    };

    this.isRunning = false;
    this.intervalHandle = null;

    this.dispatched = new Map(); // contactId_flowId -> timestamp
    this.stats = { checksPerformed: 0, contactsChecked: 0, triggersDispatched: 0 };
  }

  start() {
    if (this.isRunning || !this.config.enabled) return;
    this.isRunning = true;

    this.intervalHandle = setInterval(() => this.check().catch(() => {}), this.config.checkIntervalMs);
    this.check().catch(() => {});

    this.logger.info('NoResponseScheduler started', { interval: this.config.checkIntervalMs });
  }

  stop() {
    if (!this.isRunning) return;
    if (this.intervalHandle) clearInterval(this.intervalHandle);
    this.intervalHandle = null;
    this.isRunning = false;
    this.logger.info('NoResponseScheduler stopped');
  }

  async check() {
    if (!this.isRunning) return;
    this.stats.checksPerformed++;

    const flows = await Flow.find({
      enabled: true,
      deletedAt: null,
      'steps.trigger.type': TRIGGER_TYPES.NO_RESPONSE_TIMEOUT,
    });

    if (!flows.length) return;

    const byUser = {};
    for (const f of flows) {
      const uid = String(f.userId);
      if (!byUser[uid]) byUser[uid] = [];
      byUser[uid].push(f);
    }

    for (const [userId, userFlows] of Object.entries(byUser)) {
      await this.checkUserFlows(userId, userFlows);
    }

    this.cleanup();
  }

  extractTimeoutConfig(flow) {
    const step = flow.steps.find((s) => s.type === 'trigger' && s.trigger?.type === TRIGGER_TYPES.NO_RESPONSE_TIMEOUT);
    if (!step) return null;

    const cfg = step.trigger.config || {};
    return {
      flow,
      flowId: flow._id,
      timeout: cfg.timeout,
      timeoutUnit: cfg.timeoutUnit || DELAY_UNITS.HOURS,
      timeoutMs: this.timeoutMs(cfg.timeout, cfg.timeoutUnit),
      onlyIfLastMessageFromUs: cfg.onlyIfLastMessageFromUs !== false,
      fromStages: cfg.fromStages || [],
    };
  }

  timeoutMs(timeout, unit) {
    const mult = {
      [DELAY_UNITS.SECONDS]: 1000,
      [DELAY_UNITS.MINUTES]: 60 * 1000,
      [DELAY_UNITS.HOURS]: 60 * 60 * 1000,
      [DELAY_UNITS.DAYS]: 24 * 60 * 60 * 1000,
    };
    return Number(timeout) * (mult[unit] || mult[DELAY_UNITS.HOURS]);
  }

  async checkUserFlows(userId, flows) {
    if (!this.contactService || !this.messageService || !this.eventDispatcher) return;

    const configs = flows.map((f) => this.extractTimeoutConfig(f)).filter(Boolean);
    const minTimeout = Math.min(...configs.map((c) => c.timeoutMs));
    const since = new Date(Date.now() - minTimeout);

    const contacts = await this.contactService.findContactsWithPendingResponse(userId, since);
    this.stats.contactsChecked += contacts.length;

    for (const contact of contacts) {
      const lastMessage = await this.messageService.getLastMessage(contact.id);
      if (!lastMessage) continue;

      const delta = Date.now() - new Date(lastMessage.timestamp).getTime();

      for (const cfg of configs) {
        const key = `${contact.id}_${cfg.flowId}`;
        const last = this.dispatched.get(key);
        if (last && Date.now() - last < this.config.triggerCooldownMs) continue;

        if (delta < cfg.timeoutMs) continue;
        if (cfg.onlyIfLastMessageFromUs && !lastMessage.fromMe) continue;
        if (cfg.fromStages.length && !cfg.fromStages.includes(contact.stage)) continue;

        const can = cfg.flow.canExecuteNow();
        if (!can.allowed) continue;

        await this.eventDispatcher.dispatchNoResponseTimeout(contact, lastMessage, userId);
        this.dispatched.set(key, Date.now());
        this.stats.triggersDispatched++;
        break;
      }
    }
  }

  cleanup() {
    const now = Date.now();
    const expiry = this.config.triggerCooldownMs * 2;

    for (const [k, t] of this.dispatched.entries()) {
      if (now - t > expiry) this.dispatched.delete(k);
    }
  }

  getStats() {
    return { ...this.stats, isRunning: this.isRunning, tracked: this.dispatched.size };
  }
}

module.exports = NoResponseScheduler;