class TriggerMatcher {
  constructor(triggerType) {
    this.triggerType = triggerType;
  }

  async match(_event, _triggerConfig, _context = {}) {
    throw new Error('match() must be implemented');
  }

  extractTriggerData(event, matchResult) {
    return { type: this.triggerType, event, matchResult, timestamp: new Date() };
  }

  validateConfig(_config) {
    return { valid: true, errors: [] };
  }

  checkStageFilter(contact, allowedStages) {
    if (!allowedStages?.length) return true;
    return allowedStages.includes(contact?.stage);
  }

  checkTagFilter(contact, allowedTags, mode = 'any') {
    if (!allowedTags?.length) return true;
    const tags = contact?.tags || [];
    if (mode === 'all') return allowedTags.every((t) => tags.includes(t));
    return allowedTags.some((t) => tags.includes(t));
  }

  checkExcludeTagFilter(contact, excludeTags) {
    if (!excludeTags?.length) return true;
    const tags = contact?.tags || [];
    return !excludeTags.some((t) => tags.includes(t));
  }
}

module.exports = TriggerMatcher;