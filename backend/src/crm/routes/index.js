/**
 * @fileoverview Agregador de rotas do CRM
 * @module crm/routes
 */

const express = require('express');
const router = express.Router();

const contactRoutes = require('./contactRoutes');
const dealRoutes = require('./dealRoutes');
const pipelineRoutes = require('./pipelineRoutes');
const activityRoutes = require('./activityRoutes');

router.use('/contacts', contactRoutes);
router.use('/deals', dealRoutes);
router.use('/pipelines', pipelineRoutes);
router.use('/activities', activityRoutes);

module.exports = router;
