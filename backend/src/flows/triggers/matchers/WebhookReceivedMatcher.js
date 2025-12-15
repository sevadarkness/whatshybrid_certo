const TriggerMatcher = require('../TriggerMatcher');
const { TRIGGER_TYPES } = require('../../constants/flowConstants');

class WebhookReceivedMatcher extends TriggerMatcher {
  constructor() {
    super(TRIGGER_TYPES.WEBHOOK_RECEIVED);
  }

  async match(event, triggerConfig) {
    const cfg = triggerConfig.config || {};
    const { webhookId, payload } = event;

    if (cfg.webhookId !== webhookId) return { matched: false, reason: 'webhook_id_mismatch' };

    if (cfg.validatePayload && cfg.payloadSchema) {
      const r = this.validatePayload(payload, cfg.payloadSchema);
      if (!r.valid) return { matched: false, reason: 'payload_validation_failed', errors: r.errors };
    }

    return { matched: true, data: { webhookId, payload } };
  }

  validatePayload(payload, schemaDefinition) {
    const errors = [];
    try {
      for (const [field, rule] of Object.entries(schemaDefinition)) {
        if (rule === 'required' && (payload?.[field] === undefined || payload?.[field] === null)) {
          errors.push(`Field '${field}' is required`);
        }
      }
      return { valid: errors.length === 0, errors };
    } catch (e) {
      return { valid: false, errors: [e.message] };
    }
  }

  extractTriggerData(event) {
    return {
      type: this.triggerType,
      webhookId: event.webhookId,
      payload: event.payload,
      headers: event.headers,
      contact: event.contact
        ? { id: event.contact.id, phone: event.contact.phone, name: event.contact.name, stage: event.contact.stage, tags: event.contact.tags }
        : null,
      receivedAt: new Date(),
    };
  }
}

module.exports = WebhookReceivedMatcher;