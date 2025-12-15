/**
 * @fileoverview Rotas de Contact
 * @module crm/routes/contactRoutes
 */

const express = require('express');
const router = express.Router();
const contactController = require('../controllers/ContactController');
const { validate } = require('../../shared/middlewares/validate');
const { asyncHandler } = require('../../shared/middlewares/asyncHandler');
const {
  createContactSchema,
  updateContactSchema,
  listContactsQuerySchema,
  searchContactSchema,
  bulkImportSchema,
  updateTagsSchema,
  contactIdParamSchema,
} = require('../schemas/contactSchema');

// Rotas de listagem e busca
router.get(
  '/',
  validate(listContactsQuerySchema, 'query'),
  asyncHandler(contactController.list.bind(contactController))
);

router.get(
  '/search',
  validate(searchContactSchema, 'query'),
  asyncHandler(contactController.search.bind(contactController))
);

router.get(
  '/stats',
  asyncHandler(contactController.getStats.bind(contactController))
);

// CRUD básico
router.post(
  '/',
  validate(createContactSchema),
  asyncHandler(contactController.create.bind(contactController))
);

router.get(
  '/:id',
  validate(contactIdParamSchema, 'params'),
  asyncHandler(contactController.getById.bind(contactController))
);

router.put(
  '/:id',
  validate(contactIdParamSchema, 'params'),
  validate(updateContactSchema),
  asyncHandler(contactController.update.bind(contactController))
);

router.delete(
  '/:id',
  validate(contactIdParamSchema, 'params'),
  asyncHandler(contactController.delete.bind(contactController))
);

// Operações especiais
router.patch(
  '/:id/tags',
  validate(contactIdParamSchema, 'params'),
  validate(updateTagsSchema),
  asyncHandler(contactController.updateTags.bind(contactController))
);

router.patch(
  '/:id/score',
  validate(contactIdParamSchema, 'params'),
  asyncHandler(contactController.updateScore.bind(contactController))
);

router.patch(
  '/:id/assign',
  validate(contactIdParamSchema, 'params'),
  asyncHandler(contactController.assign.bind(contactController))
);

// Importação em massa
router.post(
  '/import',
  validate(bulkImportSchema),
  asyncHandler(contactController.bulkImport.bind(contactController))
);

module.exports = router;