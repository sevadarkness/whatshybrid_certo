/**
 * @fileoverview Rotas do módulo AI
 * @module ai/routes/aiRoutes
 */

const express = require('express');
const router = express.Router();
const assistantController = require('../controllers/AssistantController');
const { validate } = require('../../shared/middlewares/validate');
const { asyncHandler } = require('../../shared/middlewares/asyncHandler');
const { authenticate, requireWorkspace } = require('../../team/middlewares/authenticate');
const { requirePermission } = require('../../team/middlewares/authorize');
const { PERMISSION } = require('../../team/constants/teamConstants');
const {
  createAssistantSchema,
  updateAssistantSchema,
  createKnowledgeSourceSchema,
  chatSchema,
  assistantIdParamSchema,
  knowledgeIdParamSchema,
} = require('../schemas/assistantSchema');

router.use(authenticate, requireWorkspace);

// Assistentes
router.get(
  '/assistants',
  requirePermission(PERMISSION.AI_USE),
  asyncHandler(assistantController.list.bind(assistantController))
);

router.post(
  '/assistants',
  requirePermission(PERMISSION.AI_MANAGE),
  validate(createAssistantSchema),
  asyncHandler(assistantController.create.bind(assistantController))
);

router.get(
  '/assistants/:id',
  validate(assistantIdParamSchema, 'params'),
  requirePermission(PERMISSION.AI_USE),
  asyncHandler(assistantController.getById.bind(assistantController))
);

router.put(
  '/assistants/:id',
  validate(assistantIdParamSchema, 'params'),
  validate(updateAssistantSchema),
  requirePermission(PERMISSION.AI_MANAGE),
  asyncHandler(assistantController.update.bind(assistantController))
);

router.delete(
  '/assistants/:id',
  validate(assistantIdParamSchema, 'params'),
  requirePermission(PERMISSION.AI_MANAGE),
  asyncHandler(assistantController.delete.bind(assistantController))
);

router.patch(
  '/assistants/:id/status',
  validate(assistantIdParamSchema, 'params'),
  requirePermission(PERMISSION.AI_MANAGE),
  asyncHandler(assistantController.setStatus.bind(assistantController))
);

router.post(
  '/assistants/:id/duplicate',
  validate(assistantIdParamSchema, 'params'),
  requirePermission(PERMISSION.AI_MANAGE),
  asyncHandler(assistantController.duplicate.bind(assistantController))
);

router.get(
  '/assistants/:id/stats',
  validate(assistantIdParamSchema, 'params'),
  requirePermission(PERMISSION.AI_USE),
  asyncHandler(assistantController.getStats.bind(assistantController))
);

// Knowledge Sources
router.get(
  '/assistants/:id/knowledge',
  validate(assistantIdParamSchema, 'params'),
  requirePermission(PERMISSION.AI_USE),
  asyncHandler(assistantController.listKnowledge.bind(assistantController))
);

router.post(
  '/assistants/:id/knowledge',
  validate(assistantIdParamSchema, 'params'),
  validate(createKnowledgeSourceSchema),
  requirePermission(PERMISSION.AI_MANAGE),
  asyncHandler(assistantController.addKnowledge.bind(assistantController))
);

router.delete(
  '/assistants/:id/knowledge/:knowledgeId',
  validate(knowledgeIdParamSchema, 'params'),
  requirePermission(PERMISSION.AI_MANAGE),
  asyncHandler(assistantController.removeKnowledge.bind(assistantController))
);

router.post(
  '/assistants/:id/knowledge/:knowledgeId/reprocess',
  validate(knowledgeIdParamSchema, 'params'),
  requirePermission(PERMISSION.AI_MANAGE),
  asyncHandler(assistantController.reprocessKnowledge.bind(assistantController))
);

// Chat
router.post(
  '/assistants/:id/chat',
  validate(assistantIdParamSchema, 'params'),
  validate(chatSchema),
  requirePermission(PERMISSION.AI_USE),
  asyncHandler(assistantController.chat.bind(assistantController))
);

router.post(
  '/conversations/:conversationId/transfer',
  requirePermission(PERMISSION.AI_USE),
  asyncHandler(assistantController.transfer.bind(assistantController))
);

router.post(
  '/conversations/:conversationId/feedback',
  requirePermission(PERMISSION.AI_USE),
  asyncHandler(assistantController.addFeedback.bind(assistantController))
);

module.exports = router;
