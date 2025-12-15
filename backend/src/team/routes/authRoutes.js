/**
 * @fileoverview Rotas de autenticação
 * @module team/routes/authRoutes
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/AuthController');
const { validate } = require('../../shared/middlewares/validate');
const { asyncHandler } = require('../../shared/middlewares/asyncHandler');
const { authenticate, optionalAuth } = require('../middlewares/authenticate');
const { rateLimiter } = require('../../shared/middlewares/rateLimiter');
const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyEmailSchema,
} = require('../schemas/authSchema');

// Rate limiters específicos
const authLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,
  message: 'Muitas tentativas. Tente novamente em 15 minutos.',
});

const strictLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5,
  message: 'Muitas tentativas. Tente novamente em 1 hora.',
});

// Rotas públicas
router.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  asyncHandler(authController.register.bind(authController))
);

router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  asyncHandler(authController.login.bind(authController))
);

router.post(
  '/refresh',
  validate(refreshTokenSchema),
  asyncHandler(authController.refresh.bind(authController))
);

router.post(
  '/forgot-password',
  strictLimiter,
  validate(forgotPasswordSchema),
  asyncHandler(authController.forgotPassword.bind(authController))
);

router.post(
  '/reset-password',
  strictLimiter,
  validate(resetPasswordSchema),
  asyncHandler(authController.resetPassword.bind(authController))
);

router.post(
  '/verify-email',
  validate(verifyEmailSchema),
  asyncHandler(authController.verifyEmail.bind(authController))
);

// Rotas autenticadas
router.post(
  '/logout',
  authenticate,
  asyncHandler(authController.logout.bind(authController))
);

router.post(
  '/logout-all',
  authenticate,
  asyncHandler(authController.logoutAll.bind(authController))
);

router.post(
  '/resend-verification',
  authenticate,
  asyncHandler(authController.resendVerification.bind(authController))
);

router.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  asyncHandler(authController.changePassword.bind(authController))
);

router.get(
  '/me',
  authenticate,
  asyncHandler(authController.me.bind(authController))
);

module.exports = router;