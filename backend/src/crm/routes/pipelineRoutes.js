/**
 * @fileoverview Rotas de Pipeline
 * @module crm/routes/pipelineRoutes
 */

const express = require('express');
const router = express.Router();
const pipelineController = require('../controllers/PipelineController');
const { validate } = require('../../shared/middlewares/validate');
const { asyncHandler } = require('../../shared/middlewares/asyncHandler');
const {
  createPipelineSchema,
  updatePipelineSchema,
  addStageSchema,
  updateStageSchema,
  reorderStagesSchema,
  pipelineIdParamSchema,
  stageIdParamSchema,
} = require('../schemas/pipelineSchema');

// Listagem
router.get(
  '/',
  asyncHandler(pipelineController.list.bind(pipelineController))
);

// CRUD básico
router.post(
  '/',
  validate(createPipelineSchema),
  asyncHandler(pipelineController.create.bind(pipelineController))
);

router.get(
  '/:id',
  validate(pipelineIdParamSchema, 'params'),
  asyncHandler(pipelineController.getById.bind(pipelineController))
);

router.put(
  '/:id',
  validate(pipelineIdParamSchema, 'params'),
  validate(updatePipelineSchema),
  asyncHandler(pipelineController.update.bind(pipelineController))
);

router.delete(
  '/:id',
  validate(pipelineIdParamSchema, 'params'),
  asyncHandler(pipelineController.delete.bind(pipelineController))
);

// Definir como padrão
router.post(
  '/:id/default',
  validate(pipelineIdParamSchema, 'params'),
  asyncHandler(pipelineController.setAsDefault.bind(pipelineController))
);

// Operações de estágios
router.post(
  '/:id/stages',
  validate(pipelineIdParamSchema, 'params'),
  validate(addStageSchema),
  asyncHandler(pipelineController.addStage.bind(pipelineController))
);

router.put(
  '/:id/stages/reorder',
  validate(pipelineIdParamSchema, 'params'),
  validate(reorderStagesSchema),
  asyncHandler(pipelineController.reorderStages.bind(pipelineController))
);

router.put(
  '/:id/stages/:stageId',
  validate(stageIdParamSchema, 'params'),
  validate(updateStageSchema),
  asyncHandler(pipelineController.updateStage.bind(pipelineController))
);

router.delete(
  '/:id/stages/:stageId',
  validate(stageIdParamSchema, 'params'),
  asyncHandler(pipelineController.removeStage.bind(pipelineController))
);

module.exports = router;