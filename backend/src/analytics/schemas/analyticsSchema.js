/**
 * @fileoverview Schemas de validação para Analytics
 * @module analytics/schemas/analyticsSchema
 */

const Joi = require('joi');
const { AGGREGATION_PERIOD, DIMENSION, REPORT_TYPE, EXPORT_FORMAT } = require('../constants/analyticsConstants');

/**
 * Schema de query de métricas
 */
const metricsQuerySchema = Joi.object({
  from: Joi.date().iso().required(),
  to: Joi.date().iso().min(Joi.ref('from')).required(),
  period: Joi.string()
    .valid(...Object.values(AGGREGATION_PERIOD))
    .default(AGGREGATION_PERIOD.DAY),
  metrics: Joi.array().items(Joi.string()).min(1),
  dimensions: Joi.array().items(
    Joi.string().valid(...Object.values(DIMENSION))
  ),
  filters: Joi.object({
    channelIds: Joi.array().items(Joi.string().hex().length(24)),
    agentIds: Joi.array().items(Joi.string().hex().length(24)),
    tags: Joi.array().items(Joi.string()),
    pipelineId: Joi.string().hex().length(24),
  }),
});

/**
 * Schema de relatório
 */
const reportQuerySchema = Joi.object({
  type: Joi.string()
    .valid(...Object.values(REPORT_TYPE))
    .required(),
  from: Joi.date().iso().required(),
  to: Joi.date().iso().min(Joi.ref('from')).required(),
  format: Joi.string()
    .valid(...Object.values(EXPORT_FORMAT))
    .default(EXPORT_FORMAT.JSON),
  filters: Joi.object(),
  includeDetails: Joi.boolean().default(false),
});

/**
 * Schema de dashboard
 */
const dashboardQuerySchema = Joi.object({
  from: Joi.date().iso(),
  to: Joi.date().iso(),
  compareWith: Joi.string().valid('previous_period', 'previous_year'),
});

module.exports = {
  metricsQuerySchema,
  reportQuerySchema,
  dashboardQuerySchema,
};