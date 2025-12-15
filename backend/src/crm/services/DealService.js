/**
 * @fileoverview Service de Deal
 * @module crm/services/DealService
 */

const dealRepository = require('../repositories/DealRepository');
const pipelineRepository = require('../repositories/PipelineRepository');
const contactRepository = require('../repositories/ContactRepository');
const activityService = require('./ActivityService');
const AppError = require('../../shared/errors/AppError');
const { DEAL_STATUS, ACTIVITY_TYPE } = require('../constants/crmConstants');
const logger = require('../../infra/logging/Logger');

class DealService {
  /**
   * Cria um novo deal
   * @param {string} workspaceId - ID do workspace
   * @param {Object} data - Dados do deal
   * @param {string} userId - ID do usuário criador
   * @returns {Promise<Deal>}
   */
  async create(workspaceId, data, userId) {
    // Valida pipeline e estágio
    const pipeline = await pipelineRepository.findById(workspaceId, data.pipelineId);
    if (!pipeline) {
      throw AppError.notFound('Pipeline', data.pipelineId);
    }

    const stage = pipeline.getStageById(data.stageId);
    if (!stage) {
      throw AppError.notFound('Estágio', data.stageId);
    }

    // Valida contato
    const contact = await contactRepository.findById(workspaceId, data.contactId);
    if (!contact) {
      throw AppError.notFound('Contato', data.contactId);
    }

    // Verifica se permite múltiplos deals por contato
    if (!pipeline.settings.allowMultipleDealsPerContact) {
      const existingDeals = await dealRepository.getByContact(
        workspaceId,
        data.contactId,
        { status: DEAL_STATUS.OPEN }
      );
      
      if (existingDeals.length > 0) {
        throw AppError.conflict('Já existe um negócio aberto para este contato neste pipeline');
      }
    }

    // Define probabilidade baseada no estágio se configurado
    if (pipeline.settings.defaultProbabilityByStage && !data.probability) {
      data.probability = stage.probability;
    }

    // Cria deal
    const deal = await dealRepository.create({
      ...data,
      workspaceId,
      createdBy: userId,
      updatedBy: userId,
    });

    // Atualiza o stageHistory com o nome do estágio
    deal.stageHistory[0].stageName = stage.name;
    await deal.save();

    // Atualiza métricas do contato
    await contactRepository.incrementMetrics(data.contactId, {
      totalDeals: 1,
    });

    // Registra atividade
    await activityService.create(workspaceId, {
      type: ACTIVITY_TYPE.DEAL_CREATED,
      title: `Negócio criado: ${deal.title}`,
      contactId: data.contactId,
      dealId: deal._id,
      metadata: {
        pipelineName: pipeline.name,
        stageName: stage.name,
        value: deal.value,
      },
    }, userId);

    logger.info({
      msg: 'Deal criado',
      dealId: deal._id,
      pipelineId: data.pipelineId,
      contactId: data.contactId,
      workspaceId,
      userId,
    });

    return deal;
  }

  /**
   * Obtém deal por ID
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do deal
   * @param {Object} [options] - Opções
   * @returns {Promise<Deal>}
   */
  async getById(workspaceId, id, options = {}) {
    const deal = await dealRepository.findById(workspaceId, id, options);
    
    if (!deal) {
      throw AppError.notFound('Negócio', id);
    }

    return deal;
  }

  /**
   * Atualiza deal
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do deal
   * @param {Object} data - Dados para atualizar
   * @param {string} userId - ID do usuário
   * @returns {Promise<Deal>}
   */
  async update(workspaceId, id, data, userId) {
    const deal = await this.getById(workspaceId, id);

    // Se está mudando de pipeline, valida
    if (data.pipelineId && data.pipelineId !== deal.pipelineId.toString()) {
      const pipeline = await pipelineRepository.findById(workspaceId, data.pipelineId);
      if (!pipeline) {
        throw AppError.notFound('Pipeline', data.pipelineId);
      }

      // Se mudou de pipeline, deve fornecer novo stageId
      if (!data.stageId) {
        const firstStage = pipeline.getFirstStage();
        data.stageId = firstStage._id;
      }
    }

    // Se está mudando de estágio, valida
    if (data.stageId && data.stageId !== deal.stageId.toString()) {
      return this.moveToStage(workspaceId, id, data.stageId, userId, data.reason);
    }

    const updated = await dealRepository.update(workspaceId, id, {
      ...data,
      updatedBy: userId,
    });

    logger.info({
      msg: 'Deal atualizado',
      dealId: id,
      workspaceId,
      userId,
    });

    return updated;
  }

  /**
   * Move deal para outro estágio
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do deal
   * @param {string} stageId - ID do novo estágio
   * @param {string} userId - ID do usuário
   * @param {string} [reason] - Motivo da movimentação
   * @returns {Promise<Deal>}
   */
  async moveToStage(workspaceId, id, stageId, userId, reason = null) {
    const deal = await this.getById(workspaceId, id);

    if (deal.status !== DEAL_STATUS.OPEN) {
      throw AppError.validation('Não é possível mover um negócio fechado');
    }

    const pipeline = await pipelineRepository.findById(workspaceId, deal.pipelineId);
    const newStage = pipeline.getStageById(stageId);

    if (!newStage) {
      throw AppError.notFound('Estágio', stageId);
    }

    const oldStage = pipeline.getStageById(deal.stageId);

    // Move para o novo estágio
    await deal.moveToStage(stageId, newStage.name, userId);

    // Atualiza probabilidade se configurado
    if (pipeline.settings.defaultProbabilityByStage) {
      deal.probability = newStage.probability;
      await deal.save();
    }

    // Se é estágio de vitória, marca como ganho
    if (newStage.isWinStage) {
      return this.markAsWon(workspaceId, id, {}, userId);
    }

    // Se é estágio de perda, marca como perdido
    if (newStage.isLossStage) {
      return this.markAsLost(workspaceId, id, { lossReason: 'other' }, userId);
    }

    // Registra atividade
    await activityService.create(workspaceId, {
      type: ACTIVITY_TYPE.STAGE_CHANGE,
      title: `Movido de "${oldStage?.name}" para "${newStage.name}"`,
      contactId: deal.contactId,
      dealId: deal._id,
      metadata: {
        fromStageId: deal.stageId,
        fromStageName: oldStage?.name,
        toStageId: stageId,
        toStageName: newStage.name,
        reason,
      },
    }, userId);

    logger.info({
      msg: 'Deal movido de estágio',
      dealId: id,
      fromStage: oldStage?.name,
      toStage: newStage.name,
      workspaceId,
      userId,
    });

    return deal;
  }

  /**
   * Marca deal como ganho
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do deal
   * @param {Object} data - Dados adicionais
   * @param {string} userId - ID do usuário
   * @returns {Promise<Deal>}
   */
  async markAsWon(workspaceId, id, data = {}, userId) {
    const deal = await this.getById(workspaceId, id);

    if (deal.status !== DEAL_STATUS.OPEN) {
      throw AppError.validation('Negócio já está fechado');
    }

    await deal.markAsWon(data, userId);

    // Atualiza métricas do contato
    await contactRepository.incrementMetrics(deal.contactId, {
      wonDeals: 1,
      wonValue: deal.actualValue || deal.value,
    });

    // Registra atividade
    await activityService.create(workspaceId, {
      type: ACTIVITY_TYPE.DEAL_WON,
      title: `Negócio ganho: ${deal.title}`,
      contactId: deal.contactId,
      dealId: deal._id,
      metadata: {
        value: deal.actualValue || deal.value,
        cycleTime: deal.totalCycleTime,
      },
    }, userId);

    logger.info({
      msg: 'Deal ganho',
      dealId: id,
      value: deal.actualValue || deal.value,
      workspaceId,
      userId,
    });

    return deal;
  }

  /**
   * Marca deal como perdido
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do deal
   * @param {Object} data - Dados de perda
   * @param {string} userId - ID do usuário
   * @returns {Promise<Deal>}
   */
  async markAsLost(workspaceId, id, data, userId) {
    const deal = await this.getById(workspaceId, id);

    if (deal.status !== DEAL_STATUS.OPEN) {
      throw AppError.validation('Negócio já está fechado');
    }

    await deal.markAsLost(data, userId);

    // Atualiza métricas do contato
    await contactRepository.incrementMetrics(deal.contactId, {
      lostDeals: 1,
    });

    // Registra atividade
    await activityService.create(workspaceId, {
      type: ACTIVITY_TYPE.DEAL_LOST,
      title: `Negócio perdido: ${deal.title}`,
      contactId: deal.contactId,
      dealId: deal._id,
      metadata: {
        lossReason: data.lossReason,
        competitorName: data.competitorName,
        cycleTime: deal.totalCycleTime,
      },
    }, userId);

    logger.info({
      msg: 'Deal perdido',
      dealId: id,
      lossReason: data.lossReason,
      workspaceId,
      userId,
    });

    return deal;
  }

  /**
   * Reabre deal
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do deal
   * @param {string} [stageId] - ID do estágio para reabrir
   * @param {string} userId - ID do usuário
   * @returns {Promise<Deal>}
   */
  async reopen(workspaceId, id, stageId, userId) {
    const deal = await this.getById(workspaceId, id);

    if (deal.status === DEAL_STATUS.OPEN) {
      throw AppError.validation('Negócio já está aberto');
    }

    const pipeline = await pipelineRepository.findById(workspaceId, deal.pipelineId);
    
    // Se não especificou estágio, usa o primeiro
    let stage;
    if (stageId) {
      stage = pipeline.getStageById(stageId);
      if (!stage) {
        throw AppError.notFound('Estágio', stageId);
      }
    } else {
      stage = pipeline.getFirstStage();
    }

    await deal.reopen(stage._id, stage.name, userId);

    logger.info({
      msg: 'Deal reaberto',
      dealId: id,
      stageName: stage.name,
      workspaceId,
      userId,
    });

    return deal;
  }

  /**
   * Deleta deal
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do deal
   * @param {string} userId - ID do usuário
   * @returns {Promise<void>}
   */
  async delete(workspaceId, id, userId) {
    const deal = await this.getById(workspaceId, id);
    await dealRepository.delete(workspaceId, id, userId);

    logger.info({
      msg: 'Deal deletado',
      dealId: id,
      workspaceId,
      userId,
    });
  }

  /**
   * Lista deals
   * @param {string} workspaceId - ID do workspace
   * @param {Object} filters - Filtros
   * @param {Object} options - Opções de paginação
   * @returns {Promise<{items: Deal[], total: number}>}
   */
  async list(workspaceId, filters = {}, options = {}) {
    return dealRepository.list(workspaceId, filters, options);
  }

  /**
   * Obtém deals para visualização de pipeline (Kanban)
   * @param {string} workspaceId - ID do workspace
   * @param {string} pipelineId - ID do pipeline
   * @param {Object} [filters] - Filtros
   * @returns {Promise<Object>}
   */
  async getPipelineView(workspaceId, pipelineId, filters = {}) {
    const [pipeline, deals, stats] = await Promise.all([
      pipelineRepository.findById(workspaceId, pipelineId),
      dealRepository.getByPipeline(workspaceId, pipelineId, filters),
      dealRepository.getPipelineStats(workspaceId, pipelineId),
    ]);

    if (!pipeline) {
      throw AppError.notFound('Pipeline', pipelineId);
    }

    // Organiza deals por estágio
    const dealsByStage = {};
    for (const stage of pipeline.stages) {
      const stageId = stage._id.toString();
      dealsByStage[stageId] = {
        stage: stage.toObject(),
        deals: [],
        stats: stats.byStage[stageId] || { count: 0, totalValue: 0, weightedValue: 0 },
      };
    }

    for (const deal of deals) {
      const stageId = deal.stageId.toString();
      if (dealsByStage[stageId]) {
        dealsByStage[stageId].deals.push(deal);
      }
    }

    return {
      pipeline: pipeline.toPublicJSON(),
      stages: Object.values(dealsByStage),
      summary: {
        totalDeals: deals.length,
        totalValue: stats.totalValue,
        weightedValue: stats.weightedValue,
        byStatus: stats.byStatus,
      },
    };
  }

  /**
   * Obtém estatísticas de deals
   * @param {string} workspaceId - ID do workspace
   * @param {Object} [dateRange] - Range de datas
   * @returns {Promise<Object>}
   */
  async getStats(workspaceId, dateRange = {}) {
    return dealRepository.getStats(workspaceId, dateRange);
  }

  /**
   * Obtém deals com SLA violado
   * @param {string} workspaceId - ID do workspace
   * @returns {Promise<Deal[]>}
   */
  async getRottingDeals(workspaceId) {
    return dealRepository.getRottingDeals(workspaceId);
  }
}

module.exports = new DealService();
