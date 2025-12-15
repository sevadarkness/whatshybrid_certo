/**
 * @fileoverview Agregador de rotas do Team
 * @module team/routes
 */

const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const workspaceRoutes = require('./workspaceRoutes');

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/workspaces', workspaceRoutes);

module.exports = router;