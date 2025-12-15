/**
 * @fileoverview Constantes do módulo Analytics
 * @module analytics/constants/analyticsConstants
 */

/**
 * Períodos de agregação
 */
const AGGREGATION_PERIOD = Object.freeze({
  HOUR: 'hour',
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  QUARTER: 'quarter',
  YEAR: 'year',
});

/**
 * Tipos de métricas
 */
const METRIC_TYPE = Object.freeze({
  // Mensagens
  MESSAGES_SENT: 'messages_sent',
  MESSAGES_RECEIVED: 'messages_received',
  MESSAGES_TOTAL: 'messages_total',
  
  // Conversas
  CONVERSATIONS_STARTED: 'conversations_started',
  CONVERSATIONS_CLOSED: 'conversations_closed',
  CONVERSATIONS_ACTIVE: 'conversations_active',
  
  // Tempo
  AVG_RESPONSE_TIME: 'avg_response_time',
  AVG_RESOLUTION_TIME: 'avg_resolution_time',
  FIRST_RESPONSE_TIME: 'first_response_time',
  
  // Contatos
  CONTACTS_CREATED: 'contacts_created',
  CONTACTS_TOTAL: 'contacts_total',
  
  // Deals
  DEALS_CREATED: 'deals_created',
  DEALS_WON: 'deals_won',
  DEALS_LOST: 'deals_lost',
  DEALS_VALUE: 'deals_value',
  WIN_RATE: 'win_rate',
  
  // AI
  AI_MESSAGES: 'ai_messages',
  AI_TRANSFERS: 'ai_transfers',
  AI_RESOLUTION_RATE: 'ai_resolution_rate',
  
  // Agentes
  AGENT_ONLINE_TIME: 'agent_online_time',
  AGENT_CONVERSATIONS: 'agent_conversations',
  AGENT_MESSAGES: 'agent_messages',
});

/**
 * Dimensões para agrupamento
 */
const DIMENSION = Object.freeze({
  DATE: 'date',
  HOUR: 'hour',
  DAY_OF_WEEK: 'dayOfWeek',
  CHANNEL: 'channel',
  AGENT: 'agent',
  TAG: 'tag',
  PIPELINE: 'pipeline',
  STAGE: 'stage',
  SOURCE: 'source',
});

/**
 * Tipos de relatório
 */
const REPORT_TYPE = Object.freeze({
  OVERVIEW: 'overview',
  CONVERSATIONS: 'conversations',
  AGENTS: 'agents',
  CHANNELS: 'channels',
  CRM: 'crm',
  AI: 'ai',
  CUSTOM: 'custom',
});

/**
 * Formatos de exportação
 */
const EXPORT_FORMAT = Object.freeze({
  CSV: 'csv',
  XLSX: 'xlsx',
  PDF: 'pdf',
  JSON: 'json',
});

module.exports = {
  AGGREGATION_PERIOD,
  METRIC_TYPE,
  DIMENSION,
  REPORT_TYPE,
  EXPORT_FORMAT,
};