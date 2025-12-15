/**
 * @fileoverview Schemas de validação para autenticação
 * @module team/schemas/authSchema
 */

const Joi = require('joi');
const { AUTH_CONFIG } = require('../constants/teamConstants');

/**
 * Schema de registro
 */
const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string()
    .min(AUTH_CONFIG.PASSWORD_MIN_LENGTH)
    .pattern(/^^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .message('Senha deve conter letras maiúsculas, minúsculas e números')
    .required(),
  phone: Joi.string().pattern(/^^\+?[\d\s-]{8,20}$/),
  workspaceName: Joi.string().trim().min(2).max(100),
});

/**
 * Schema de login
 */
const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().required(),
  rememberMe: Joi.boolean().default(false),
});

/**
 * Schema de refresh token
 */
const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

/**
 * Schema de esqueci senha
 */
const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
});

/**
 * Schema de reset de senha
 */
const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  password: Joi.string()
    .min(AUTH_CONFIG.PASSWORD_MIN_LENGTH)
    .pattern(/^^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .message('Senha deve conter letras maiúsculas, minúsculas e números')
    .required(),
});

/**
 * Schema de alteração de senha
 */
const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string()
    .min(AUTH_CONFIG.PASSWORD_MIN_LENGTH)
    .pattern(/^^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .message('Senha deve conter letras maiúsculas, minúsculas e números')
    .required(),
});

/**
 * Schema de verificação de email
 */
const verifyEmailSchema = Joi.object({
  token: Joi.string().required(),
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyEmailSchema,
};