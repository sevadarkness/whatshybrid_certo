/**
 * @fileoverview Rotas de Activity
 * @module crm/routes/activityRoutes
 */

const express = require('express');
const router = express.Router();
const activityController = require('../controllers/ActivityController');
const { validate } = require('../../shared/middlewares/validate');
const { asyncHandler } = require('../../shared/middlewares/asyncHandler');
const {
  createActivitySchema,
  updateActivitySchema,
  listActivitiesQuerySchema,
  completeActivitySchema,
  activityIdParamSchema,
} = require('../schemas/activitySchema');

// Rotas especiais (devem vir antes das rotas com :id)
router.get(
  '/timeline',
  asyncHandler(activityController.getTimeline.bind(activityController))
);

router.get(
  '/pending',
  asyncHandler(activityController.getPendingTasks.bind(activityController))
);

router.get(
  '/overdue',
  asyncHandler(activityController.getOverdueTasks.bind(activityController))
);

// Listagem
router.get(
  '/',
  validate(listActivitiesQuerySchema, 'query'),
  asyncHandler(activityController.list.bind(activityController))
);

// CRUD básico
router.post(
  '/',
  validate(createActivitySchema),
  asyncHandler(activityController.create.bind(activityController))
);

router.get(
  '/:id',
  validate(activityIdParamSchema, 'params'),
  asyncHandler(activityController.getById.bind(activityController))
);

router.put(
  '/:id',
  validate(activityIdParamSchema, 'params'),
  validate(updateActivitySchema),
  asyncHandler(activityController.update.bind(activityController))
);

router.delete(
  '/:id',
  validate(activityIdParamSchema, 'params'),
  asyncHandler(activityController.delete.bind(activityController))
);

// Operações de status
router.post(
  '/:id/complete',
  validate(activityIdParamSchema, 'params'),
  validate(completeActivitySchema),
  asyncHandler(activityController.markComplete.bind(activityController))
);

router.post(
  '/:id/incomplete',
  validate(activityIdParamSchema, 'params'),
  asyncHandler(activityController.markIncomplete.bind(activityController))
);

module.exports = router;