/**
 * @fileoverview Controller de Deal
 * @module crm/controllers/DealController
 */

const dealService = require('../services/DealService');
const { success, created, noContent, paginated } = require('../../shared/utils/response');

class DealController {
  /**
   * Cria um novo deal
   * POST /api/crm/deals
   */
  async create(req, res) {
    const deal = await dealService.create(
      req.workspace._id,
      req.body,
      req.user._id
    );

    return created(res, deal.toPublicJSON(), 'Negócio criado com sucesso');
  }

  /**
   * Obtém deal por ID
   * GET /api/crm/deals/:id
   */
  async getById(req, res) {
    const deal = await dealService.getById(
      req.workspace._id,
      req.params.id,
      { populate: ['contact', 'assignedTo', 'activities'] }
    );

    return success(res, deal.toPublicJSON());
  }

  /**
   * Atualiza deal
   * PUT /api/crm/deals/:id
   */
  async update(req, res) {
    const deal = await dealService.update(
      req.workspace._id,
      req.params.id,
      req.body,
      req.user._id
    );

    return success(res, deal.toPublicJSON(), 'Negócio atualizado com sucesso');
  }

  /**
   * Deleta deal
   * DELETE /api/crm/deals/:id
   */
  async delete(req, res) {
    await dealService.delete(
      req.workspace._id,
      req.params.id,
      req.user._id
    );

    return noContent(res);
  }

  /**
   * Lista deals
   * GET /api/crm/deals
   */
  async list(req, res) {
    const { page, limit, sort, order, ...filters } = req.query;
    
    const result = await dealService.list(
      req.workspace._id,
      filters,
      { page, limit, sort, order }
    );

    return paginated(res, result.items, result.total, { page, limit });
  }

  /**
   * Move deal para outro estágio
   * PATCH /api/crm/deals/:id/stage
   */
  async moveToStage(req, res) {
    const { stageId, reason } = req.body;

    const deal = await dealService.moveToStage(
      req.workspace._id,
      req.params.id,
      stageId,
      req.user._id,
      reason
    );

    return success(res, deal.toPublicJSON(), 'Negócio movido com sucesso');
  }

  /**
   * Marca deal como ganho
   * POST /api/crm/deals/:id/win
   */
  async markAsWon(req, res) {
    const deal = await dealService.markAsWon(
      req.workspace._id,
      req.params.id,
      req.body,
      req.user._id
    );

    return success(res, deal.toPublicJSON(), 'Negócio marcado como ganho');
  }

  /**
   * Marca deal como perdido
   * POST /api/crm/deals/:id/lose
   */
  async markAsLost(req, res) {
    const deal = await dealService.markAsLost(
      req.workspace._id,
      req.params.id,
      req.body,
      req.user._id
    );

    return success(res, deal.toPublicJSON(), 'Negócio marcado como perdido');
  }

  /**
   * Reabre deal
   * POST /api/crm/deals/:id/reopen
   */
  async reopen(req, res) {
    const { stageId } = req.body;

    const deal = await dealService.reopen(
      req.workspace._id,
      req.params.id,
      stageId,
      req.user._id
    );

    return success(res, deal.toPublicJSON(), 'Negócio reaberto com sucesso');
  }

  /**
   * Obtém visualização de pipeline (Kanban)
   * GET /api/crm/deals/pipeline/:pipelineId
   */
  async getPipelineView(req, res) {
    const { assignedTo, search, minValue, maxValue } = req.query;

    const view = await dealService.getPipelineView(
      req.workspace._id,
      req.params.pipelineId,
      { assignedTo, search, minValue, maxValue }
    );

    return success(res, view);
  }

  /**
   * Obtém estatísticas de deals
   * GET /api/crm/deals/stats
   */
  async getStats(req, res) {
    const { from, to } = req.query;
    
    const stats = await dealService.getStats(
      req.workspace._id,
      { from, to }
    );

    return success(res, stats);
  }

  /**
   * Obtém deals com SLA violado
   * GET /api/crm/deals/rotting
   */
  async getRottingDeals(req, res) {
    const deals = await dealService.getRottingDeals(req.workspace._id);
    return success(res, deals);
  }
}

module.exports = new DealController();