/**
 * @fileoverview Schemas de validação para Deal
 * @module crm/schemas/dealSchema
 */

const Joi = require('joi');
const { DEAL_STATUS, PRIORITY, LOSS_REASONS } = require('../constants/crmConstants');

/**
 * Schema base de deal
 */
const dealBase = {
  title: Joi.string().trim().max(300),
  value: Joi.number().min(0).precision(2),
  currency: Joi.string().length(3).uppercase().default('BRL'),
  contactId: Joi.string().hex().length(24),
  pipelineId: Joi.string().hex().length(24),
  stageId: Joi.string().hex().length(24),
  assignedTo: Joi.string().hex().length(24),
  priority: Joi.string().valid(...Object.values(PRIORITY)),
  probability: Joi.number().min(0).max(100),
  expectedCloseDate: Joi.date().iso(),
  tags: Joi.array().items(Joi.string().trim().max(50)).max(20),
  customFields: Joi.object().pattern(Joi.string(), Joi.any()),
  notes: Joi.string().max(5000),
  products: Joi.array().items(
    Joi.object({
      name: Joi.string().required(),
      quantity: Joi.number().min(1).default(1),
      unitPrice: Joi.number().min(0).required(),
      discount: Joi.number().min(0).max(100).default(0),
    })
  ).max(50),
};

/**
 * Schema para criar deal
 */
const createDealSchema = Joi.object({
  ...dealBase,
  title: dealBase.title.required(),
  contactId: dealBase.contactId.required(),
  pipelineId: dealBase.pipelineId.required(),
  stageId: dealBase.stageId.required(),
});

/**
 * Schema para atualizar deal
 */
const updateDealSchema = Joi.object({
  ...dealBase,
}).min(1);

/**
 * Schema para mover deal de estágio
 */
const moveDealSchema = Joi.object({
  stageId: Joi.string().hex().length(24).required(),
  reason: Joi.string().max(500),
});

/**
 * Schema para marcar deal como ganho
 */
const winDealSchema = Joi.object({
  actualValue: Joi.number().min(0).precision(2),
  notes: Joi.string().max(2000),
  closedAt: Joi.date().iso().default(() => new Date()),
});

/**
 * Schema para marcar deal como perdido
 */
const loseDealSchema = Joi.object({
  lossReason: Joi.string().valid(...Object.values(LOSS_REASONS)).required(),
  competitorName: Joi.string().max(200),
  notes: Joi.string().max(2000),
  closedAt: Joi.date().iso().default(() => new Date()),
});

/**
 * Schema para query de listagem
 */
const listDealsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().valid('title', 'value', 'createdAt', 'updatedAt', 'expectedCloseDate').default('createdAt'),
  order: Joi.string().valid('asc', 'desc').default('desc'),
  search: Joi.string().trim().max(100),
  status: Joi.alternatives().try(
    Joi.string().valid(...Object.values(DEAL_STATUS)),
    Joi.array().items(Joi.string().valid(...Object.values(DEAL_STATUS)))
  ),
  pipelineId: Joi.string().hex().length(24),
  stageId: Joi.string().hex().length(24),
  contactId: Joi.string().hex().length(24),
  assignedTo: Joi.string().hex().length(24),
  priority: Joi.string().valid(...Object.values(PRIORITY)),
  minValue: Joi.number().min(0),
  maxValue: Joi.number().min(0),
  expectedCloseFrom: Joi.date().iso(),
  expectedCloseTo: Joi.date().iso(),
  createdFrom: Joi.date().iso(),
  createdTo: Joi.date().iso(),
  tags: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string())
  ),
});

/**
 * Schema para pipeline view (Kanban)
 */
const pipelineViewQuerySchema = Joi.object({
  pipelineId: Joi.string().hex().length(24).required(),
  assignedTo: Joi.string().hex().length(24),
  search: Joi.string().trim().max(100),
  minValue: Joi.number().min(0),
  maxValue: Joi.number().min(0),
});

/**
 * Schema de params com ID
 */
const dealIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

module.exports = {
  createDealSchema,
  updateDealSchema,
  moveDealSchema,
  winDealSchema,
  loseDealSchema,
  listDealsQuerySchema,
  pipelineViewQuerySchema,
  dealIdParamSchema,
};