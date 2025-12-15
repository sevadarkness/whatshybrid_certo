const TriggerMatcher = require('../TriggerMatcher');
const { TRIGGER_TYPES } = require('../../constants/flowConstants');
const cronParser = require('cron-parser');

class ScheduledMatcher extends TriggerMatcher {
  constructor() {
    super(TRIGGER_TYPES.SCHEDULED);
  }

  async match(event, triggerConfig) {
    const cfg = triggerConfig.config || {};
    const scheduledTime = event.scheduledTime ? new Date(event.scheduledTime) : new Date();

    if (!this.isScheduledTime(cfg.cron, scheduledTime, cfg.timezone || 'America/Sao_Paulo')) {
      return { matched: false, reason: 'not_scheduled_time' };
    }

    return { matched: true, data: { scheduledTime, cron: cfg.cron, timezone: cfg.timezone } };
  }

  isScheduledTime(cronExpression, currentTime, timezone) {
    try {
      const interval = cronParser.parseExpression(cronExpression, { currentDate: currentTime, tz: timezone });
      const prev = interval.prev().toDate();
      return Math.abs(currentTime.getTime() - prev.getTime()) < 60_000;
    } catch {
      return false;
    }
  }

  extractTriggerData(event) {
    return {
      type: this.triggerType,
      scheduled: { cron: event.cron, timezone: event.timezone, scheduledTime: event.scheduledTime },
      contacts: (event.contacts || []).map((c) => ({ id: c.id, phone: c.phone, name: c.name })),
      triggeredAt: new Date(),
    };
  }
}

module.exports = ScheduledMatcher;