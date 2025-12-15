/**
 * @fileoverview Schemas de validação para Pipeline
 * @module crm/schemas/pipelineSchema
 */

const Joi = require('joi');

/**
 * Schema de estágio
 */
const stageSchema = Joi.object({
  name: Joi.string().trim().max(100).required(),
  color: Joi.string().pattern(/^^#[0-9A-Fa-f]{6}$/).default('#6B7280'),
  order: Joi.number().integer().min(0),
  probability: Joi.number().min(0).max(100).default(50),
  rottingDays: Joi.number().integer().min(0).max(365),
  isWinStage: Joi.boolean().default(false),
  isLossStage: Joi.boolean().default(false),
  automations: Joi.object({
    onEnter: Joi.array().items(Joi.string().hex().length(24)),
    onExit: Joi.array().items(Joi.string().hex().length(24)),
  }),
});

/**
 * Schema para criar pipeline
 */
const createPipelineSchema = Joi.object({
  name: Joi.string().trim().max(100).required(),
  description: Joi.string().max(500),
  isDefault: Joi.boolean().default(false),
  currency: Joi.string().length(3).uppercase().default('BRL'),
  stages: Joi.array().items(stageSchema).min(1).max(20).required(),
  settings: Joi.object({
    allowMultipleDealsPerContact: Joi.boolean().default(true),
    requireValue: Joi.boolean().default(false),
    requireProducts: Joi.boolean().default(false),
    defaultProbabilityByStage: Joi.boolean().default(true),
  }),
});

/**
 * Schema para atualizar pipeline
 */
const updatePipelineSchema = Joi.object({
  name: Joi.string().trim().max(100),
  description: Joi.string().max(500),
  isDefault: Joi.boolean(),
  currency: Joi.string().length(3).uppercase(),
  settings: Joi.object({
    allowMultipleDealsPerContact: Joi.boolean(),
    requireValue: Joi.boolean(),
    requireProducts: Joi.boolean(),
    defaultProbabilityByStage: Joi.boolean(),
  }),
}).min(1);

/**
 * Schema para adicionar estágio
 */
const addStageSchema = stageSchema;

/**
 * Schema para atualizar estágio
 */
const updateStageSchema = Joi.object({
  name: Joi.string().trim().max(100),
  color: Joi.string().pattern(/^^#[0-9A-Fa-f]{6}$/),
  probability: Joi.number().min(0).max(100),
  rottingDays: Joi.number().integer().min(0).max(365).allow(null),
  automations: Joi.object({
    onEnter: Joi.array().items(Joi.string().hex().length(24)),
    onExit: Joi.array().items(Joi.string().hex().length(24)),
  }),
}).min(1);

/**
 * Schema para reordenar estágios
 */
const reorderStagesSchema = Joi.object({
  stageIds: Joi.array()
    .items(Joi.string().hex().length(24))
    .min(1)
    .required(),
});

/**
 * Schema de params
 */
const pipelineIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

const stageIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
  stageId: Joi.string().hex().length(24).required(),
});

module.exports = {
  createPipelineSchema,
  updatePipelineSchema,
  addStageSchema,
  updateStageSchema,
  reorderStagesSchema,
  pipelineIdParamSchema,
  stageIdParamSchema,
  stageSchema,
};