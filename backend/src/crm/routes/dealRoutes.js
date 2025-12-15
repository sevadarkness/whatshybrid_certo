/**
 * @fileoverview Rotas de Deal
 * @module crm/routes/dealRoutes
 */

const express = require('express');
const router = express.Router();
const dealController = require('../controllers/DealController');
const { validate } = require('../../shared/middlewares/validate');
const { asyncHandler } = require('../../shared/middlewares/asyncHandler');
const {
  createDealSchema,
  updateDealSchema,
  moveDealSchema,
  winDealSchema,
  loseDealSchema,
  listDealsQuerySchema,
  pipelineViewQuerySchema,
  dealIdParamSchema,
} = require('../schemas/dealSchema');

// Rotas de listagem
router.get(
  '/',
  validate(listDealsQuerySchema, 'query'),
  asyncHandler(dealController.list.bind(dealController))
);

router.get(
  '/stats',
  asyncHandler(dealController.getStats.bind(dealController))
);

router.get(
  '/rotting',
  asyncHandler(dealController.getRottingDeals.bind(dealController))
);

router.get(
  '/pipeline/:pipelineId',
  validate(pipelineViewQuerySchema, 'query'),
  asyncHandler(dealController.getPipelineView.bind(dealController))
);

// CRUD básico
router.post(
  '/',
  validate(createDealSchema),
  asyncHandler(dealController.create.bind(dealController))
);

router.get(
  '/:id',
  validate(dealIdParamSchema, 'params'),
  asyncHandler(dealController.getById.bind(dealController))
);

router.put(
  '/:id',
  validate(dealIdParamSchema, 'params'),
  validate(updateDealSchema),
  asyncHandler(dealController.update.bind(dealController))
);

router.delete(
  '/:id',
  validate(dealIdParamSchema, 'params'),
  asyncHandler(dealController.delete.bind(dealController))
);

// Operações de status
router.patch(
  '/:id/stage',
  validate(dealIdParamSchema, 'params'),
  validate(moveDealSchema),
  asyncHandler(dealController.moveToStage.bind(dealController))
);

router.post(
  '/:id/win',
  validate(dealIdParamSchema, 'params'),
  validate(winDealSchema),
  asyncHandler(dealController.markAsWon.bind(dealController))
);

router.post(
  '/:id/lose',
  validate(dealIdParamSchema, 'params'),
  validate(loseDealSchema),
  asyncHandler(dealController.markAsLost.bind(dealController))
);

router.post(
  '/:id/reopen',
  validate(dealIdParamSchema, 'params'),
  asyncHandler(dealController.reopen.bind(dealController))
);

module.exports = router;