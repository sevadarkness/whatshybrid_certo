const TRIGGER_TYPES = Object.freeze({
  MESSAGE_RECEIVED: 'message_received',
  KEYWORD_MATCH: 'keyword_match',
  NO_RESPONSE_TIMEOUT: 'no_response_timeout',
  STAGE_CHANGED: 'stage_changed',
  TAG_ADDED: 'tag_added',
  TAG_REMOVED: 'tag_removed',
  CAMPAIGN_EVENT: 'campaign_event',
  CONTACT_CREATED: 'contact_created',
  WEBHOOK_RECEIVED: 'webhook_received',
  SCHEDULED: 'scheduled',
});

const ACTION_TYPES = Object.freeze({
  SEND_MESSAGE: 'send_message',
  SEND_MEDIA: 'send_media',
  SEND_TEMPLATE: 'send_template',

  ADD_TAG: 'add_tag',
  REMOVE_TAG: 'remove_tag',
  MOVE_STAGE: 'move_stage',

  ADD_TO_CAMPAIGN: 'add_to_campaign',
  REMOVE_FROM_CAMPAIGN: 'remove_from_campaign',

  CALL_WEBHOOK: 'call_webhook',
  CALL_AI: 'call_ai',

  SET_VARIABLE: 'set_variable',
  WAIT_DELAY: 'wait_delay',

  CONDITION: 'condition',
  GO_TO_STEP: 'go_to_step',
  END_FLOW: 'end_flow',
});

const STEP_TYPES = Object.freeze({
  TRIGGER: 'trigger',
  ACTION: 'action',
});

const EXECUTION_STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  WAITING_DELAY: 'waiting_delay',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMEOUT: 'timeout',
});

const STEP_STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  WAITING: 'waiting',
});

const LOG_LEVELS = Object.freeze({
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
});

const CONDITION_OPERATORS = Object.freeze({
  EQUALS: 'equals',
  NOT_EQUALS: 'not_equals',
  CONTAINS: 'contains',
  NOT_CONTAINS: 'not_contains',
  STARTS_WITH: 'starts_with',
  ENDS_WITH: 'ends_with',
  GREATER_THAN: 'greater_than',
  LESS_THAN: 'less_than',
  GREATER_OR_EQUAL: 'greater_or_equal',
  LESS_OR_EQUAL: 'less_or_equal',
  IS_EMPTY: 'is_empty',
  IS_NOT_EMPTY: 'is_not_empty',
  MATCHES_REGEX: 'matches_regex',
  IN_LIST: 'in_list',
  NOT_IN_LIST: 'not_in_list',
});

const CAMPAIGN_EVENTS = Object.freeze({
  STARTED: 'campaign_started',
  COMPLETED: 'campaign_completed',
  FAILED: 'campaign_failed',
  PAUSED: 'campaign_paused',
  MESSAGE_SENT: 'campaign_message_sent',
  MESSAGE_FAILED: 'campaign_message_failed',
});

const DELAY_UNITS = Object.freeze({
  SECONDS: 'seconds',
  MINUTES: 'minutes',
  HOURS: 'hours',
  DAYS: 'days',
});

const FLOW_LIMITS = Object.freeze({
  MAX_STEPS_PER_FLOW: 100,
  MAX_EXECUTIONS_PER_CONTACT_PER_HOUR: 10,
  MAX_LOOP_ITERATIONS: 5,
  MAX_EXECUTION_TIME_MS: 5 * 60 * 1000,
  MAX_DELAY_DAYS: 30,
  MAX_WEBHOOK_TIMEOUT_MS: 30 * 1000,
  MAX_AI_TIMEOUT_MS: 60 * 1000,
});

module.exports = {
  TRIGGER_TYPES,
  ACTION_TYPES,
  STEP_TYPES,
  EXECUTION_STATUS,
  STEP_STATUS,
  LOG_LEVELS,
  CONDITION_OPERATORS,
  CAMPAIGN_EVENTS,
  DELAY_UNITS,
  FLOW_LIMITS,
};
