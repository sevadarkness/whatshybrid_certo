const TriggerMatcher = require('../TriggerMatcher');
const { TRIGGER_TYPES, DELAY_UNITS } = require('../../constants/flowConstants');

class NoResponseTimeoutMatcher extends TriggerMatcher {
  constructor() {
    super(TRIGGER_TYPES.NO_RESPONSE_TIMEOUT);
  }

  async match(event, triggerConfig) {
    const cfg = triggerConfig.config || {};
    const { contact, lastMessage, timeoutReached } = event;

    if (!timeoutReached) return { matched: false, reason: 'timeout_not_reached' };
    if (!contact || !lastMessage) return { matched: false, reason: 'missing_contact_or_lastMessage' };

    if (cfg.onlyIfLastMessageFromUs && !lastMessage.fromMe) {
      return { matched: false, reason: 'last_message_not_from_us' };
    }

    if (!this.checkStageFilter(contact, cfg.fromStages)) return { matched: false, reason: 'stage_not_allowed' };

    const since = Date.now() - new Date(lastMessage.timestamp).getTime();
    const configured = this.timeoutMs(cfg.timeout, cfg.timeoutUnit);

    if (since < configured) {
      return { matched: false, reason: 'timeout_not_reached_yet', timeSinceLastMessage: since, configuredTimeout: configured };
    }

    return { matched: true, data: { contactId: contact.id, lastMessageId: lastMessage.id, timeSinceLastMessage: since, configuredTimeout: configured } };
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

  extractTriggerData(event, matchResult) {
    return {
      type: this.triggerType,
      timeout: { configured: matchResult.data.configuredTimeout, actual: matchResult.data.timeSinceLastMessage },
      lastMessage: { id: event.lastMessage.id, text: event.lastMessage.text, timestamp: event.lastMessage.timestamp, fromMe: event.lastMessage.fromMe },
      contact: { id: event.contact.id, phone: event.contact.phone, name: event.contact.name, stage: event.contact.stage, tags: event.contact.tags },
      triggeredAt: new Date(),
    };
  }
}

module.exports = NoResponseTimeoutMatcher;