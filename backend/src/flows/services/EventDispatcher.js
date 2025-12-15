const EventEmitter = require('events');
const Flow = require('../models/Flow');
const triggerRegistry = require('../triggers/TriggerRegistry');
const { STEP_TYPES } = require('../constants/flowConstants');

class EventDispatcher extends EventEmitter {
  constructor(options = {}) {
    super();
    this.flowEngine = options.flowEngine;
    this.logger = options.logger || console;
    this.triggerRegistry = options.triggerRegistry || triggerRegistry;

    this.flowCache = new Map(); // userId_triggerType -> flows
    this.cacheExpiryMs = options.cacheExpiryMs || 60_000;
    this.cacheAt = new Map();

    this.config = {
      maxConcurrentDispatches: options.maxConcurrentDispatches || 50,
      enableCache: options.enableCache !== false,
    };

    this.activeDispatches = 0;
    this.stats = { eventsReceived: 0, flowsTriggered: 0, errors: 0 };
  }

  async dispatch(eventType, eventData, options = {}) {
    this.stats.eventsReceived++;

    if (this.activeDispatches >= this.config.maxConcurrentDispatches) {
      this.emit('dispatch:queued', { eventType, eventData });
      return [];
    }

    this.activeDispatches++;

    const dispatchId = `dispatch_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    try {
      const triggerTypes = this.triggerRegistry.getTriggersForEventType(eventType);
      if (!triggerTypes.length) return [];

      const userId = eventData.userId || options.userId;
      if (!userId) return [];

      const matches = await this.findMatchingFlows(triggerTypes, eventData, userId);

      if (!matches.length) return [];

      const results = await this.executeFlows(matches, eventData, options);
      this.stats.flowsTriggered += results.filter((r) => r.success).length;

      this.emit('dispatch:complete', { dispatchId, eventType, results });
      return results;
    } catch (e) {
      this.stats.errors++;
      this.logger.error(`Dispatch error: ${e.message}`, { dispatchId, eventType });
      this.emit('dispatch:error', { dispatchId, eventType, error: e });
      throw e;
    } finally {
      this.activeDispatches--;
    }
  }

  async findMatchingFlows(triggerTypes, eventData, userId) {
    const out = [];

    for (const triggerType of triggerTypes) {
      const flows = await this.getFlowsForTrigger(triggerType, userId);

      for (const flow of flows) {
        const triggerStep = flow.steps.find(
          (s) => s.type === STEP_TYPES.TRIGGER && s.trigger?.type === triggerType
        );

        if (!triggerStep || !triggerStep.enabled) continue;

        const matchResult = await this.triggerRegistry.match(triggerType, eventData, triggerStep.trigger, { flow, userId });

        if (matchResult.matched) {
          out.push({ flow, triggerStep, triggerType, matchResult, priority: flow.settings.priority || 5 });
        }
      }
    }

    out.sort((a, b) => b.priority - a.priority);
    return out;
  }

  async getFlowsForTrigger(triggerType, userId) {
    const key = `${userId}_${triggerType}`;

    if (this.config.enableCache) {
      const t = this.cacheAt.get(key);
      if (t && Date.now() - t < this.cacheExpiryMs) {
        const cached = this.flowCache.get(key);
        if (cached) return cached;
      }
    }

    const flows = await Flow.findExecutableFlows(triggerType, userId);

    if (this.config.enableCache) {
      this.flowCache.set(key, flows);
      this.cacheAt.set(key, Date.now());
    }

    return flows;
  }

  async executeFlows(matchingFlows, eventData, options = {}) {
    const batchSize = 5;
    const results = [];

    for (let i = 0; i < matchingFlows.length; i += batchSize) {
      const batch = matchingFlows.slice(i, i + batchSize);

      const settled = await Promise.allSettled(
        batch.map(async ({ flow, triggerType, matchResult }) => {
          const triggerData = this.triggerRegistry.extractTriggerData(triggerType, eventData, matchResult);

          const execution = await this.flowEngine.execute(
            flow,
            {
              ...triggerData,
              contact: eventData.contact,
              message: eventData.message,
              campaign: eventData.campaign,
              userId: eventData.userId,
            },
            {
              isTest: Boolean(options.isTest),
              ignoreSchedule: Boolean(options.ignoreSchedule),
            }
          );

          return { success: true, flowId: flow._id, flowName: flow.name, executionId: execution.executionId, triggerType };
        })
      );

      for (const r of settled) {
        if (r.status === 'fulfilled') results.push(r.value);
        else results.push({ success: false, error: r.reason?.message || 'unknown_error' });
      }
    }

    return results;
  }

  invalidateCache(userId, triggerType = null) {
    if (triggerType) {
      const k = `${userId}_${triggerType}`;
      this.flowCache.delete(k);
      this.cacheAt.delete(k);
      return;
    }

    for (const k of this.flowCache.keys()) {
      if (k.startsWith(`${userId}_`)) {
        this.flowCache.delete(k);
        this.cacheAt.delete(k);
      }
    }
  }

  getStats() {
    return { ...this.stats, activeDispatches: this.activeDispatches, cacheSize: this.flowCache.size };
  }

  // helpers
  dispatchMessageReceived(message, contact, userId) {
    return this.dispatch('message:received', { message, contact, userId });
  }
  dispatchStageChanged(contact, previousStage, newStage, changeSource, userId) {
    return this.dispatch('contact:stage_changed', { contact, previousStage, newStage, changeSource, userId });
  }
  dispatchTagAdded(contact, addedTags, userId) {
    return this.dispatch('contact:tag_added', { contact, addedTags, userId });
  }
  dispatchTagRemoved(contact, removedTags, userId) {
    return this.dispatch('contact:tag_removed', { contact, removedTags, userId });
  }
  dispatchContactCreated(contact, source, userId) {
    return this.dispatch('contact:created', { contact, source, userId });
  }
  dispatchCampaignEvent(campaign, eventType, contact, userId, extra = {}) {
    return this.dispatch('campaign:event', { campaign, eventType, contact, userId, ...extra });
  }
  dispatchWebhookReceived(webhookId, payload, headers, userId, contact = null) {
    return this.dispatch('webhook:received', { webhookId, payload, headers, userId, contact });
  }
  dispatchNoResponseTimeout(contact, lastMessage, userId) {
    return this.dispatch('scheduler:no_response', { contact, lastMessage, timeoutReached: true, userId });
  }
  dispatchScheduledTrigger(contacts, scheduledTime, userId) {
    return this.dispatch('scheduler:cron', { contacts, scheduledTime, userId });
  }
}

module.exports = EventDispatcher;