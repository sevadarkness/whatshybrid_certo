const TriggerMatcher = require('../TriggerMatcher');
const { TRIGGER_TYPES } = require('../../constants/flowConstants');

class StageChangedMatcher extends TriggerMatcher {
  constructor() {
    super(TRIGGER_TYPES.STAGE_CHANGED);
  }

  async match(event, triggerConfig) {
    const cfg = triggerConfig.config || {};
    const { contact, previousStage, newStage, changeSource } = event;

    if (!contact) return { matched: false, reason: 'missing_contact' };

    if (changeSource === 'manual' && cfg.includeManualChanges === false) return { matched: false, reason: 'manual_change_not_allowed' };
    if (changeSource === 'automated' && cfg.includeAutomatedChanges === false) return { matched: false, reason: 'automated_change_not_allowed' };

    if (cfg.fromStage && cfg.fromStage !== previousStage) return { matched: false, reason: 'from_stage_mismatch' };
    if (cfg.toStage !== newStage) return { matched: false, reason: 'to_stage_mismatch' };

    return { matched: true, data: { contactId: contact.id, previousStage, newStage, changeSource } };
  }

  extractTriggerData(event) {
    return {
      type: this.triggerType,
      previousStage: event.previousStage,
      newStage: event.newStage,
      changeSource: event.changeSource,
      contact: {
        id: event.contact.id,
        phone: event.contact.phone,
        name: event.contact.name,
        stage: event.newStage,
        tags: event.contact.tags,
      },
      changedAt: new Date(),
    };
  }
}

module.exports = StageChangedMatcher;