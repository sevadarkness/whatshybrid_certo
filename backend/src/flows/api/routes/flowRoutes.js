const express = require('express');

module.exports = function createFlowRoutes({ controller, authMiddleware }) {
  const router = express.Router();

  router.post('/', authMiddleware, controller.create.bind(controller));
  router.get('/', authMiddleware, controller.list.bind(controller));
  router.get('/:id', authMiddleware, controller.getById.bind(controller));
  router.put('/:id', authMiddleware, controller.update.bind(controller));
  router.delete('/:id', authMiddleware, controller.delete.bind(controller));

  router.post('/:id/execute', authMiddleware, controller.execute.bind(controller));

  return router;
};