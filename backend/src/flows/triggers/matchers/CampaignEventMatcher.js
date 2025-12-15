const TriggerMatcher = require('../TriggerMatcher');
const { TRIGGER_TYPES } = require('../../constants/flowConstants');

class CampaignEventMatcher extends TriggerMatcher {
  constructor() {
    super(TRIGGER_TYPES.CAMPAIGN_EVENT);
  }

  async match(event, triggerConfig) {
    const cfg = triggerConfig.config || {};
    const { campaign, eventType } = event;

    if (!campaign) return { matched: false, reason: 'missing_campaign' };
    if (cfg.event !== eventType) return { matched: false, reason: 'event_type_mismatch' };

    if (cfg.campaignIds?.length) {
      if (!cfg.campaignIds.includes(String(campaign.id))) return { matched: false, reason: 'campaign_not_in_list' };
    }

    return { matched: true, data: { campaignId: campaign.id, campaignName: campaign.name, eventType } };
  }

  extractTriggerData(event) {
    return {
      type: this.triggerType,
      eventType: event.eventType,
      campaign: { id: event.campaign.id, name: event.campaign.name, event: event.eventType },
      contact: event.contact
        ? { id: event.contact.id, phone: event.contact.phone, name: event.contact.name, stage: event.contact.stage, tags: event.contact.tags }
        : null,
      triggeredAt: new Date(),
    };
  }
}

module.exports = CampaignEventMatcher;