/**
 * @fileoverview Schemas de validação para Workspace
 * @module team/schemas/workspaceSchema
 */

const Joi = require('joi');
const { WORKSPACE_ROLE } = require('../constants/teamConstants');

/**
 * Schema de criação de workspace
 */
const createWorkspaceSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  slug: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^^[a-z0-9-]+$/)
    .min(3)
    .max(50),
  description: Joi.string().max(500),
  logo: Joi.string().uri(),
  settings: Joi.object({
    timezone: Joi.string(),
    language: Joi.string().valid('pt-BR', 'en-US', 'es-ES'),
    currency: Joi.string().length(3).uppercase(),
    dateFormat: Joi.string(),
    businessHours: Joi.object({
      enabled: Joi.boolean(),
      timezone: Joi.string(),
      schedule: Joi.object().pattern(
        Joi.string().valid('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'),
        Joi.object({
          enabled: Joi.boolean(),
          start: Joi.string().pattern(/^^\d{2}:\d{2}$/),
          end: Joi.string().pattern(/^^\d{2}:\d{2}$/),
        })
      ),
    }),
  }),
});

/**
 * Schema de atualização de workspace
 */
const updateWorkspaceSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100),
  description: Joi.string().max(500).allow(''),
  logo: Joi.string().uri().allow(null, ''),
  settings: Joi.object({
    timezone: Joi.string(),
    language: Joi.string().valid('pt-BR', 'en-US', 'es-ES'),
    currency: Joi.string().length(3).uppercase(),
    dateFormat: Joi.string(),
    businessHours: Joi.object({
      enabled: Joi.boolean(),
      timezone: Joi.string(),
      schedule: Joi.object().pattern(
        Joi.string(),
        Joi.object({
          enabled: Joi.boolean(),
          start: Joi.string().pattern(/^^\d{2}:\d{2}$/),
          end: Joi.string().pattern(/^^\d{2}:\d{2}$/),
        })
      ),
    }),
  }),
}).min(1);

/**
 * Schema de convite de membro
 */
const inviteMemberSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  role: Joi.string()
    .valid(...Object.values(WORKSPACE_ROLE).filter((r) => r !== WORKSPACE_ROLE.OWNER))
    .required(),
  message: Joi.string().max(500),
});

/**
 * Schema de atualização de membro
 */
const updateMemberSchema = Joi.object({
  role: Joi.string()
    .valid(...Object.values(WORKSPACE_ROLE).filter((r) => r !== WORKSPACE_ROLE.OWNER)),
  status: Joi.string().valid('active', 'inactive', 'suspended'),
}).min(1);

/**
 * Schema de aceite de convite
 */
const acceptInviteSchema = Joi.object({
  token: Joi.string().required(),
  name: Joi.string().trim().min(2).max(100),
  password: Joi.string().min(8),
});

/**
 * Schema de params
 */
const workspaceIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

const memberIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
  memberId: Joi.string().hex().length(24).required(),
});

module.exports = {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  inviteMemberSchema,
  updateMemberSchema,
  acceptInviteSchema,
  workspaceIdParamSchema,
  memberIdParamSchema,
};