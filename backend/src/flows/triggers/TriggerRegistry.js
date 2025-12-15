const { TRIGGER_TYPES } = require('../constants/flowConstants');

const {
  MessageReceivedMatcher,
  KeywordMatcher,
  StageChangedMatcher,
  TagAddedMatcher,
  TagRemovedMatcher,
  CampaignEventMatcher,
  ContactCreatedMatcher,
  WebhookReceivedMatcher,
  NoResponseTimeoutMatcher,
  ScheduledMatcher,
} = require('./matchers');

class TriggerRegistry {
  constructor() {
    this.matchers = new Map();
    this.registerDefaultMatchers();
  }

  registerDefaultMatchers() {
    this.register(TRIGGER_TYPES.MESSAGE_RECEIVED, new MessageReceivedMatcher());
    this.register(TRIGGER_TYPES.KEYWORD_MATCH, new KeywordMatcher());
    this.register(TRIGGER_TYPES.STAGE_CHANGED, new StageChangedMatcher());
    this.register(TRIGGER_TYPES.TAG_ADDED, new TagAddedMatcher());
    this.register(TRIGGER_TYPES.TAG_REMOVED, new TagRemovedMatcher());
    this.register(TRIGGER_TYPES.CAMPAIGN_EVENT, new CampaignEventMatcher());
    this.register(TRIGGER_TYPES.CONTACT_CREATED, new ContactCreatedMatcher());
    this.register(TRIGGER_TYPES.WEBHOOK_RECEIVED, new WebhookReceivedMatcher());
    this.register(TRIGGER_TYPES.NO_RESPONSE_TIMEOUT, new NoResponseTimeoutMatcher());
    this.register(TRIGGER_TYPES.SCHEDULED, new ScheduledMatcher());
  }

  register(triggerType, matcher) {
    this.matchers.set(triggerType, matcher);
    return this;
  }

  get(triggerType) {
    return this.matchers.get(triggerType) || null;
  }

  getRegisteredTypes() {
    return Array.from(this.matchers.keys());
  }

  async match(triggerType, event, triggerConfig, context = {}) {
    const matcher = this.get(triggerType);
    if (!matcher) return { matched: false, reason: `No matcher registered for trigger type: ${triggerType}` };

    try {
      return await matcher.match(event, triggerConfig, context);
    } catch (e) {
      return { matched: false, reason: `Matcher error: ${e.message}`, error: e.message };
    }
  }

  extractTriggerData(triggerType, event, matchResult) {
    const matcher = this.get(triggerType);
    if (!matcher) return { type: triggerType, event, matchResult, timestamp: new Date() };
    return matcher.extractTriggerData(event, matchResult);
  }

  getTriggersForEventType(eventType) {
    const mapping = {
      'message:received': [TRIGGER_TYPES.MESSAGE_RECEIVED, TRIGGER_TYPES.KEYWORD_MATCH],
      'contact:stage_changed': [TRIGGER_TYPES.STAGE_CHANGED],
      'contact:tag_added': [TRIGGER_TYPES.TAG_ADDED],
      'contact:tag_removed': [TRIGGER_TYPES.TAG_REMOVED],
      'contact:created': [TRIGGER_TYPES.CONTACT_CREATED],
      'campaign:event': [TRIGGER_TYPES.CAMPAIGN_EVENT],
      'webhook:received': [TRIGGER_TYPES.WEBHOOK_RECEIVED],
      'scheduler:no_response': [TRIGGER_TYPES.NO_RESPONSE_TIMEOUT],
      'scheduler:cron': [TRIGGER_TYPES.SCHEDULED],
    };

    return mapping[eventType] || [];
  }
}

module.exports = new TriggerRegistry();