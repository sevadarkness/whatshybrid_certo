/**
 * @fileoverview Controller de Activity
 * @module crm/controllers/ActivityController
 */

const activityService = require('../services/ActivityService');
const { success, created, noContent, paginated } = require('../../shared/utils/response');

class ActivityController {
  /**
   * Cria uma nova atividade
   * POST /api/crm/activities
   */
  async create(req, res) {
    const activity = await activityService.create(
      req.workspace._id,
      req.body,
      req.user._id
    );

    return created(res, activity.toPublicJSON(), 'Atividade criada com sucesso');
  }

  /**
   * Obtém atividade por ID
   * GET /api/crm/activities/:id
   */
  async getById(req, res) {
    const activity = await activityService.getById(
      req.workspace._id,
      req.params.id
    );

    return success(res, activity.toPublicJSON());
  }

  /**
   * Atualiza atividade
   * PUT /api/crm/activities/:id
   */
  async update(req, res) {
    const activity = await activityService.update(
      req.workspace._id,
      req.params.id,
      req.body,
      req.user._id
    );

    return success(res, activity.toPublicJSON(), 'Atividade atualizada com sucesso');
  }

  /**
   * Deleta atividade
   * DELETE /api/crm/activities/:id
   */
  async delete(req, res) {
    await activityService.delete(req.workspace._id, req.params.id);
    return noContent(res);
  }

  /**
   * Lista atividades
   * GET /api/crm/activities
   */
  async list(req, res) {
    const { page, limit, sort, order, ...filters } = req.query;
    
    const result = await activityService.list(
      req.workspace._id,
      filters,
      { page, limit, sort, order }
    );

    return paginated(res, result.items, result.total, { page, limit });
  }

  /**
   * Obtém timeline
   * GET /api/crm/activities/timeline
   */
  async getTimeline(req, res) {
    const { contactId, dealId, limit, before } = req.query;

    const activities = await activityService.getTimeline(
      req.workspace._id,
      { contactId, dealId, limit, before }
    );

    return success(res, activities);
  }

  /**
   * Marca atividade como completa
   * POST /api/crm/activities/:id/complete
   */
  async markComplete(req, res) {
    const activity = await activityService.markComplete(
      req.workspace._id,
      req.params.id,
      req.user._id,
      req.body
    );

    return success(res, activity.toPublicJSON(), 'Atividade concluída');
  }

  /**
   * Marca atividade como incompleta
   * POST /api/crm/activities/:id/incomplete
   */
  async markIncomplete(req, res) {
    const activity = await activityService.markIncomplete(
      req.workspace._id,
      req.params.id,
      req.user._id
    );

    return success(res, activity.toPublicJSON(), 'Atividade reaberta');
  }

  /**
   * Obtém tarefas pendentes
   * GET /api/crm/activities/pending
   */
  async getPendingTasks(req, res) {
    const { assignedTo, dueBefore } = req.query;

    const tasks = await activityService.getPendingTasks(
      req.workspace._id,
      { assignedTo, dueBefore }
    );

    return success(res, tasks);
  }

  /**
   * Obtém tarefas atrasadas
   * GET /api/crm/activities/overdue
   */
  async getOverdueTasks(req, res) {
    const tasks = await activityService.getOverdueTasks(
      req.workspace._id,
      req.query.userId
    );

    return success(res, tasks);
  }
}

module.exports = new ActivityController();