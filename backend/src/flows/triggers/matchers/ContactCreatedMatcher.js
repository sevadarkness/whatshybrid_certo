const TriggerMatcher = require('../TriggerMatcher');
const { TRIGGER_TYPES } = require('../../constants/flowConstants');

class ContactCreatedMatcher extends TriggerMatcher {
  constructor() {
    super(TRIGGER_TYPES.CONTACT_CREATED);
  }

  async match(event, triggerConfig) {
    const cfg = triggerConfig.config || {};
    const { contact, source } = event;

    if (!contact) return { matched: false, reason: 'missing_contact' };

    if (cfg.source && cfg.source !== 'any' && cfg.source !== source) {
      return { matched: false, reason: 'source_mismatch' };
    }

    return { matched: true, data: { contactId: contact.id, source } };
  }

  extractTriggerData(event) {
    return {
      type: this.triggerType,
      source: event.source,
      contact: {
        id: event.contact.id,
        phone: event.contact.phone,
        name: event.contact.name,
        stage: event.contact.stage,
        tags: event.contact.tags || [],
        customFields: event.contact.customFields || {},
      },
      createdAt: new Date(),
    };
  }
}

module.exports = ContactCreatedMatcher;