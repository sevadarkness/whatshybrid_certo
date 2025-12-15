/**
 * @fileoverview Rotas do módulo AI
 * @module ai/routes
 */

const express = require('express');
const router = express.Router();
const assistantController = require('../controllers/AssistantController');
const knowledgeController = require('../controllers/KnowledgeController');
const { validate } = require('../../shared/middlewares/validate');
const { asyncHandler } = require('../../shared/middlewares/asyncHandler');
const { authenticate, requireWorkspace } = require('../../team/middlewares/authenticate');
const { requirePermission } = require('../../team/middlewares/authorize');
const { PERMISSION } = require('../../team/constants/teamConstants');
const {
  createAssistantSchema,
  updateAssistantSchema,
  chatSchema,
  assistantIdParamSchema,
} = require('../schemas/assistantSchema');
const {
  createKnowledgeBaseSchema,
  updateKnowledgeBaseSchema,
  addSourceSchema,
  searchSchema,
  knowledgeBaseIdParamSchema,
  sourceIdParamSchema,
} = require('../schemas/knowledgeBaseSchema');

router.use(authenticate);
router.use(requireWorkspace);

// ===== Assistants =====
router.post(
  '/assistants',
  requirePermission(PERMISSION.AI_MANAGE),
  validate(createAssistantSchema),
  asyncHandler(assistantController.create.bind(assistantController))
);

router.get(
  '/assistants',
  requirePermission(PERMISSION.AI_USE),
  asyncHandler(assistantController.list.bind(assistantController))
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

router.post(
  '/assistants/:id/default',
  validate(assistantIdParamSchema, 'params'),
  requirePermission(PERMISSION.AI_MANAGE),
  asyncHandler(assistantController.setAsDefault.bind(assistantController))
);

router.post(
  '/assistants/:id/chat',
  validate(assistantIdParamSchema, 'params'),
  validate(chatSchema),
  requirePermission(PERMISSION.AI_USE),
  asyncHandler(assistantController.chat.bind(assistantController))
);

router.post(
  '/assistants/:id/chat/stream',
  validate(assistantIdParamSchema, 'params'),
  validate(chatSchema),
  requirePermission(PERMISSION.AI_USE),
  asyncHandler(assistantController.chatStream.bind(assistantController))
);

router.post(
  '/assistants/:id/test',
  validate(assistantIdParamSchema, 'params'),
  requirePermission(PERMISSION.AI_MANAGE),
  asyncHandler(assistantController.test.bind(assistantController))
);

router.post(
  '/conversations/:conversationId/transfer',
  requirePermission(PERMISSION.AI_USE),
  asyncHandler(assistantController.transferToHuman.bind(assistantController))
);

// ===== Knowledge Bases =====
router.post(
  '/knowledge-bases',
  requirePermission(PERMISSION.AI_MANAGE),
  validate(createKnowledgeBaseSchema),
  asyncHandler(knowledgeController.create.bind(knowledgeController))
);

router.get(
  '/knowledge-bases',
  requirePermission(PERMISSION.AI_USE),
  asyncHandler(knowledgeController.list.bind(knowledgeController))
);

router.get(
  '/knowledge-bases/:id',
  validate(knowledgeBaseIdParamSchema, 'params'),
  requirePermission(PERMISSION.AI_USE),
  asyncHandler(knowledgeController.getById.bind(knowledgeController))
);

router.put(
  '/knowledge-bases/:id',
  validate(knowledgeBaseIdParamSchema, 'params'),
  validate(updateKnowledgeBaseSchema),
  requirePermission(PERMISSION.AI_MANAGE),
  asyncHandler(knowledgeController.update.bind(knowledgeController))
);

router.delete(
  '/knowledge-bases/:id',
  validate(knowledgeBaseIdParamSchema, 'params'),
  requirePermission(PERMISSION.AI_MANAGE),
  asyncHandler(knowledgeController.delete.bind(knowledgeController))
);

router.post(
  '/knowledge-bases/:id/sources',
  validate(knowledgeBaseIdParamSchema, 'params'),
  validate(addSourceSchema),
  requirePermission(PERMISSION.AI_MANAGE),
  asyncHandler(knowledgeController.addSource.bind(knowledgeController))
);

router.delete(
  '/knowledge-bases/:id/sources/:sourceId',
  validate(sourceIdParamSchema, 'params'),
  requirePermission(PERMISSION.AI_MANAGE),
  asyncHandler(knowledgeController.removeSource.bind(knowledgeController))
);

router.post(
  '/knowledge-bases/:id/sources/:sourceId/reprocess',
  validate(sourceIdParamSchema, 'params'),
  requirePermission(PERMISSION.AI_MANAGE),
  asyncHandler(knowledgeController.reprocessSource.bind(knowledgeController))
);

router.post(
  '/knowledge-bases/search',
  validate(searchSchema),
  requirePermission(PERMISSION.AI_USE),
  asyncHandler(knowledgeController.search.bind(knowledgeController))
);

module.exports = router;
