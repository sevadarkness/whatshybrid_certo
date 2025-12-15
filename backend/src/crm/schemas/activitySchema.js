/**
 * @fileoverview Schemas de validação para Activity
 * @module crm/schemas/activitySchema
 */

const Joi = require('joi');
const { ACTIVITY_TYPE } = require('../constants/crmConstants');

/**
 * Schema para criar atividade
 */
const createActivitySchema = Joi.object({
  type: Joi.string().valid(...Object.values(ACTIVITY_TYPE)).required(),
  title: Joi.string().trim().max(300),
  description: Joi.string().max(5000),
  contactId: Joi.string().hex().length(24),
  dealId: Joi.string().hex().length(24),
  dueDate: Joi.date().iso(),
  completedAt: Joi.date().iso(),
  isCompleted: Joi.boolean().default(false),
  metadata: Joi.object().pattern(Joi.string(), Joi.any()),
  attachments: Joi.array().items(
    Joi.object({
      name: Joi.string().required(),
      url: Joi.string().uri().required(),
      type: Joi.string(),
      size: Joi.number(),
    })
  ).max(10),
}).or('contactId', 'dealId');

/**
 * Schema para atualizar atividade
 */
const updateActivitySchema = Joi.object({
  title: Joi.string().trim().max(300),
  description: Joi.string().max(5000),
  dueDate: Joi.date().iso().allow(null),
  isCompleted: Joi.boolean(),
  completedAt: Joi.date().iso().allow(null),
  metadata: Joi.object().pattern(Joi.string(), Joi.any()),
}).min(1);

/**
 * Schema para query de listagem
 */
const listActivitiesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().valid('createdAt', 'dueDate', 'completedAt').default('createdAt'),
  order: Joi.string().valid('asc', 'desc').default('desc'),
  type: Joi.alternatives().try(
    Joi.string().valid(...Object.values(ACTIVITY_TYPE)),
    Joi.array().items(Joi.string().valid(...Object.values(ACTIVITY_TYPE)))
  ),
  contactId: Joi.string().hex().length(24),
  dealId: Joi.string().hex().length(24),
  createdBy: Joi.string().hex().length(24),
  isCompleted: Joi.boolean(),
  dueDateFrom: Joi.date().iso(),
  dueDateTo: Joi.date().iso(),
  createdFrom: Joi.date().iso(),
  createdTo: Joi.date().iso(),
});

/**
 * Schema para marcar como completa
 */
const completeActivitySchema = Joi.object({
  completedAt: Joi.date().iso().default(() => new Date()),
  notes: Joi.string().max(1000),
});

/**
 * Schema de params
 */
const activityIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

module.exports = {
  createActivitySchema,
  updateActivitySchema,
  listActivitiesQuerySchema,
  completeActivitySchema,
  activityIdParamSchema,
};