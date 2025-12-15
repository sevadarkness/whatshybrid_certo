/**
 * @fileoverview Rotas de usuário
 * @module team/routes/userRoutes
 */

const express = require('express');
const router = express.Router();
const userController = require('../controllers/UserController');
const { validate } = require('../../shared/middlewares/validate');
const { asyncHandler } = require('../../shared/middlewares/asyncHandler');
const { authenticate } = require('../middlewares/authenticate');
const { updateProfileSchema } = require('../schemas/userSchema');

// Todas as rotas requerem autenticação
router.use(authenticate);

router.get(
  '/profile',
  asyncHandler(userController.getProfile.bind(userController))
);

router.put(
  '/profile',
  validate(updateProfileSchema),
  asyncHandler(userController.updateProfile.bind(userController))
);

router.get(
  '/workspaces',
  asyncHandler(userController.getWorkspaces.bind(userController))
);

router.put(
  '/avatar',
  asyncHandler(userController.updateAvatar.bind(userController))
);

router.delete(
  '/avatar',
  asyncHandler(userController.removeAvatar.bind(userController))
);

router.post(
  '/deactivate',
  asyncHandler(userController.deactivateAccount.bind(userController))
);

module.exports = router;