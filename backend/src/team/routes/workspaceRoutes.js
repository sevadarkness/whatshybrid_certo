/**
 * @fileoverview Rotas de workspace
 * @module team/routes/workspaceRoutes
 */

const express = require('express');
const router = express.Router();
const workspaceController = require('../controllers/WorkspaceController');
const { validate } = require('../../shared/middlewares/validate');
const { asyncHandler } = require('../../shared/middlewares/asyncHandler');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { PERMISSION } = require('../constants/teamConstants');
const {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  inviteMemberSchema,
  updateMemberSchema,
  acceptInviteSchema,
  workspaceIdParamSchema,
  memberIdParamSchema,
} = require('../schemas/workspaceSchema');

// Rotas públicas (convites)
router.get(
  '/invites/:token',
  asyncHandler(workspaceController.getInviteDetails.bind(workspaceController))
);

router.post(
  '/invites/:token/accept',
  validate(acceptInviteSchema),
  asyncHandler(workspaceController.acceptInvite.bind(workspaceController))
);

// Rotas autenticadas
router.use(authenticate);

router.post(
  '/',
  validate(createWorkspaceSchema),
  asyncHandler(workspaceController.create.bind(workspaceController))
);

router.get(
  '/current',
  asyncHandler(workspaceController.getCurrent.bind(workspaceController))
);

router.get(
  '/:id',
  validate(workspaceIdParamSchema, 'params'),
  asyncHandler(workspaceController.getById.bind(workspaceController))
);

router.put(
  '/:id',
  validate(workspaceIdParamSchema, 'params'),
  validate(updateWorkspaceSchema),
  requirePermission(PERMISSION.WORKSPACE_MANAGE),
  asyncHandler(workspaceController.update.bind(workspaceController))
);

router.delete(
  '/:id',
  validate(workspaceIdParamSchema, 'params'),
  requirePermission(PERMISSION.WORKSPACE_DELETE),
  asyncHandler(workspaceController.delete.bind(workspaceController))
);

// Membros
router.get(
  '/:id/members',
  validate(workspaceIdParamSchema, 'params'),
  requirePermission(PERMISSION.TEAM_VIEW),
  asyncHandler(workspaceController.getMembers.bind(workspaceController))
);

router.put(
  '/:id/members/:memberId',
  validate(memberIdParamSchema, 'params'),
  validate(updateMemberSchema),
  requirePermission(PERMISSION.TEAM_MANAGE),
  asyncHandler(workspaceController.updateMember.bind(workspaceController))
);

router.delete(
  '/:id/members/:memberId',
  validate(memberIdParamSchema, 'params'),
  requirePermission(PERMISSION.TEAM_MANAGE),
  asyncHandler(workspaceController.removeMember.bind(workspaceController))
);

// Convites
router.get(
  '/:id/invites',
  validate(workspaceIdParamSchema, 'params'),
  requirePermission(PERMISSION.TEAM_VIEW),
  asyncHandler(workspaceController.getPendingInvites.bind(workspaceController))
);

router.post(
  '/:id/invites',
  validate(workspaceIdParamSchema, 'params'),
  validate(inviteMemberSchema),
  requirePermission(PERMISSION.TEAM_INVITE),
  asyncHandler(workspaceController.inviteMember.bind(workspaceController))
);

router.delete(
  '/:id/invites/:inviteId',
  requirePermission(PERMISSION.TEAM_MANAGE),
  asyncHandler(workspaceController.cancelInvite.bind(workspaceController))
);

router.post(
  '/:id/invites/:inviteId/resend',
  requirePermission(PERMISSION.TEAM_INVITE),
  asyncHandler(workspaceController.resendInvite.bind(workspaceController))
);

// Ações especiais
router.post(
  '/:id/leave',
  validate(workspaceIdParamSchema, 'params'),
  asyncHandler(workspaceController.leave.bind(workspaceController))
);

router.post(
  '/:id/transfer-ownership',
  validate(workspaceIdParamSchema, 'params'),
  asyncHandler(workspaceController.transferOwnership.bind(workspaceController))
);

module.exports = router;