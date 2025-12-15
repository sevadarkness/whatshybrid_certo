const TriggerMatcher = require('../TriggerMatcher');
const { TRIGGER_TYPES } = require('../../constants/flowConstants');

class TagAddedMatcher extends TriggerMatcher {
  constructor() {
    super(TRIGGER_TYPES.TAG_ADDED);
  }

  async match(event, triggerConfig) {
    const cfg = triggerConfig.config || {};
    const { contact, addedTags } = event;

    if (!contact) return { matched: false, reason: 'missing_contact' };
    if (!addedTags?.length) return { matched: false, reason: 'no_tags_added' };

    const target = cfg.tagIds || [];
    const mode = cfg.matchMode || 'any';

    const matched = mode === 'all'
      ? (target.every((t) => addedTags.includes(t)) ? target : [])
      : target.filter((t) => addedTags.includes(t));

    if (!matched.length) return { matched: false, reason: 'no_matching_tags' };

    return { matched: true, data: { matchedTags: matched, addedTags, contactId: contact.id, matchMode: mode } };
  }

  extractTriggerData(event, matchResult) {
    return {
      type: this.triggerType,
      matchedTags: matchResult.data.matchedTags,
      addedTags: event.addedTags,
      contact: {
        id: event.contact.id,
        phone: event.contact.phone,
        name: event.contact.name,
        stage: event.contact.stage,
        tags: event.contact.tags,
      },
      triggeredAt: new Date(),
    };
  }
}

class TagRemovedMatcher extends TriggerMatcher {
  constructor() {
    super(TRIGGER_TYPES.TAG_REMOVED);
  }

  async match(event, triggerConfig) {
    const cfg = triggerConfig.config || {};
    const { contact, removedTags } = event;

    if (!contact) return { matched: false, reason: 'missing_contact' };
    if (!removedTags?.length) return { matched: false, reason: 'no_tags_removed' };

    const target = cfg.tagIds || [];
    const mode = cfg.matchMode || 'any';

    const matched = mode === 'all'
      ? (target.every((t) => removedTags.includes(t)) ? target : [])
      : target.filter((t) => removedTags.includes(t));

    if (!matched.length) return { matched: false, reason: 'no_matching_tags' };

    return { matched: true, data: { matchedTags: matched, removedTags, contactId: contact.id, matchMode: mode } };
  }

  extractTriggerData(event, matchResult) {
    return {
      type: this.triggerType,
      matchedTags: matchResult.data.matchedTags,
      removedTags: event.removedTags,
      contact: {
        id: event.contact.id,
        phone: event.contact.phone,
        name: event.contact.name,
        stage: event.contact.stage,
        tags: event.contact.tags,
      },
      triggeredAt: new Date(),
    };
  }
}

module.exports = { TagAddedMatcher, TagRemovedMatcher };