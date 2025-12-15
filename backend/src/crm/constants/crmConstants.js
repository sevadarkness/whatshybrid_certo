/**
 * @fileoverview Constantes do módulo CRM
 * @module crm/constants/crmConstants
 */

/**
 * Status de contatos
 */
const CONTACT_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  BLOCKED: 'blocked',
  ARCHIVED: 'archived',
});

/**
 * Tipos de contato
 */
const CONTACT_TYPE = Object.freeze({
  LEAD: 'lead',
  CUSTOMER: 'customer',
  PROSPECT: 'prospect',
  PARTNER: 'partner',
  VENDOR: 'vendor',
});

/**
 * Fontes de origem do contato
 */
const CONTACT_SOURCE = Object.freeze({
  WHATSAPP: 'whatsapp',
  WEBSITE: 'website',
  MANUAL: 'manual',
  IMPORT: 'import',
  REFERRAL: 'referral',
  SOCIAL: 'social',
  ADS: 'ads',
  API: 'api',
});

/**
 * Status de negócios/deals
 */
const DEAL_STATUS = Object.freeze({
  OPEN: 'open',
  WON: 'won',
  LOST: 'lost',
  ABANDONED: 'abandoned',
});

/**
 * Motivos de perda
 */
const LOSS_REASONS = Object.freeze({
  PRICE: 'price',
  COMPETITOR: 'competitor',
  TIMING: 'timing',
  NO_BUDGET: 'no_budget',
  NO_RESPONSE: 'no_response',
  NOT_QUALIFIED: 'not_qualified',
  OTHER: 'other',
});

/**
 * Prioridades
 */
const PRIORITY = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
});

/**
 * Tipos de atividade
 */
const ACTIVITY_TYPE = Object.freeze({
  NOTE: 'note',
  CALL: 'call',
  EMAIL: 'email',
  MEETING: 'meeting',
  TASK: 'task',
  WHATSAPP: 'whatsapp',
  STAGE_CHANGE: 'stage_change',
  DEAL_CREATED: 'deal_created',
  DEAL_WON: 'deal_won',
  DEAL_LOST: 'deal_lost',
  TAG_ADDED: 'tag_added',
  TAG_REMOVED: 'tag_removed',
  ASSIGNED: 'assigned',
  SCORE_CHANGED: 'score_changed',
  CUSTOM: 'custom',
});

/**
 * Tipos de campos customizados
 */
const CUSTOM_FIELD_TYPE = Object.freeze({
  TEXT: 'text',
  NUMBER: 'number',
  DATE: 'date',
  DATETIME: 'datetime',
  SELECT: 'select',
  MULTISELECT: 'multiselect',
  BOOLEAN: 'boolean',
  URL: 'url',
  EMAIL: 'email',
  PHONE: 'phone',
  CURRENCY: 'currency',
  TEXTAREA: 'textarea',
});

/**
 * Entidades que suportam campos customizados
 */
const CUSTOM_FIELD_ENTITY = Object.freeze({
  CONTACT: 'contact',
  DEAL: 'deal',
  COMPANY: 'company',
});

/**
 * Scores padrão
 */
const SCORE_DEFAULTS = Object.freeze({
  MIN: 0,
  MAX: 100,
  INITIAL: 0,
  HOT_THRESHOLD: 70,
  WARM_THRESHOLD: 40,
});

/**
 * Limites de SLA (em minutos)
 */
const SLA_DEFAULTS = Object.freeze({
  FIRST_RESPONSE: 15,
  RESOLUTION: 1440, // 24 horas
  FOLLOW_UP: 60,
});

module.exports = {
  CONTACT_STATUS,
  CONTACT_TYPE,
  CONTACT_SOURCE,
  DEAL_STATUS,
  LOSS_REASONS,
  PRIORITY,
  ACTIVITY_TYPE,
  CUSTOM_FIELD_TYPE,
  CUSTOM_FIELD_ENTITY,
  SCORE_DEFAULTS,
  SLA_DEFAULTS,
};