const express = require('express');

module.exports = function createWebhookRoutes({ controller }) {
  const router = express.Router();
  router.post('/:webhookId', controller.handle.bind(controller));
  return router;
};