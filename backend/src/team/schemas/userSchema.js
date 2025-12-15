/**
 * @fileoverview Schemas de validação para User
 * @module team/schemas/userSchema
 */

const Joi = require('joi');

/**
 * Schema de atualização de perfil
 */
const updateProfileSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100),
  phone: Joi.string().pattern(/^^\+?[\d\s-]{8,20}$/).allow(null, ''),
  avatar: Joi.string().uri().allow(null, ''),
  timezone: Joi.string().max(50),
  language: Joi.string().valid('pt-BR', 'en-US', 'es-ES').default('pt-BR'),
  preferences: Joi.object({
    theme: Joi.string().valid('light', 'dark', 'system'),
    notifications: Joi.object({
      email: Joi.boolean(),
      push: Joi.boolean(),
      desktop: Joi.boolean(),
      sounds: Joi.boolean(),
    }),
    display: Joi.object({
      compactMode: Joi.boolean(),
      showAvatars: Joi.boolean(),
    }),
  }),
}).min(1);

/**
 * Schema de params com ID
 */
const userIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

module.exports = {
  updateProfileSchema,
  userIdParamSchema,
};