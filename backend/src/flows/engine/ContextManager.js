const { get, set, has } = require('lodash');

class ContextManager {
  constructor(initial = {}) {
    const now = new Date();

    this.data = {
      contact: {
        id: null,
        phone: null,
        name: null,
        stage: null,
        tags: [],
        customFields: {},
        ...(initial.contact || {}),
      },

      message: {
        id: null,
        text: null,
        type: null,
        timestamp: null,
        fromMe: false,
        mediaUrl: null,
        ...(initial.message || {}),
      },

      campaign: {
        id: null,
        name: null,
        event: null,
        ...(initial.campaign || {}),
      },

      trigger: {
        type: null,
        matchedKeyword: null,
        matchedConditions: {},
        ...(initial.trigger || {}),
      },

      variables: { ...(initial.variables || {}) },

      results: {
        lastAction: null,
        webhookResponses: {},
        aiResponses: {},
        ...(initial.results || {}),
      },

      execution: {
        id: null,
        flowId: null,
        flowName: null,
        startedAt: null,
        isTest: false,
        isSimulation: false,
        ...(initial.execution || {}),
      },

      system: {
        timestamp: now,
        date: now.toISOString().split('T')[0],
        time: now.toTimeString().split(' ')[0],
        dayOfWeek: now.getDay(),
        ...(initial.system || {}),
      },
    };
  }

  get(path, defaultValue = null) {
    return get(this.data, path, defaultValue);
  }

  set(path, value) {
    set(this.data, path, value);
    return this;
  }

  has(path) {
    return has(this.data, path);
  }

  setVariable(name, value) {
    return this.set(`variables.${name}`, value);
  }

  getVariable(name, defaultValue = null) {
    return this.get(`variables.${name}`, defaultValue);
  }

  setActionResult(actionType, result) {
    this.set('results.lastAction', { type: actionType, result, timestamp: new Date() });
    return this;
  }

  setWebhookResponse(key, response) {
    return this.set(`results.webhookResponses.${key}`, response);
  }

  setAIResponse(key, response) {
    return this.set(`results.aiResponses.${key}`, response);
  }

  updateContact(contactData) {
    Object.assign(this.data.contact, contactData || {});
    return this;
  }

  parseTemplate(template) {
    if (typeof template !== 'string') return template;

    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const p = String(path).trim();
      const val = this.get(p);
      if (val === null || val === undefined) return match;
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    });
  }

  parseObject(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') return this.parseTemplate(obj);
    if (Array.isArray(obj)) return obj.map((x) => this.parseObject(x));
    if (typeof obj === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(obj)) out[k] = this.parseObject(v);
      return out;
    }
    return obj;
  }

  refreshSystemTime() {
    const now = new Date();
    this.data.system = {
      timestamp: now,
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      dayOfWeek: now.getDay(),
    };
    return this;
  }

  toJSON() {
    return JSON.parse(JSON.stringify(this.data));
  }

  toSummary() {
    return {
      executionId: this.data.execution.id,
      flowId: this.data.execution.flowId,
      triggerType: this.data.trigger.type,
      contactId: this.data.contact.id,
      contactPhone: this.data.contact.phone,
      messageId: this.data.message.id,
      variablesCount: Object.keys(this.data.variables || {}).length,
    };
  }
}

module.exports = ContextManager;