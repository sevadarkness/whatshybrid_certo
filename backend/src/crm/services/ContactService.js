/**
 * @fileoverview Service de Contact
 * @module crm/services/ContactService
 */

const contactRepository = require('../repositories/ContactRepository');
const activityService = require('./ActivityService');
const AppError = require('../../shared/errors/AppError');
const { normalizePhone, normalizeEmail, normalizeTags } = require('../../shared/utils/normalize');
const { CONTACT_STATUS, ACTIVITY_TYPE } = require('../constants/crmConstants');
const logger = require('../../infra/logging/Logger');

class ContactService {
  /**
   * Cria um novo contato
   * @param {string} workspaceId - ID do workspace
   * @param {Object} data - Dados do contato
   * @param {string} userId - ID do usuário criador
   * @returns {Promise<Contact>}
   */
  async create(workspaceId, data, userId) {
    // Normaliza dados
    const normalizedData = this.normalizeContactData(data);

    // Verifica duplicados
    await this.checkDuplicates(workspaceId, normalizedData);

    // Cria contato
    const contact = await contactRepository.create({
      ...normalizedData,
      workspaceId,
      createdBy: userId,
      updatedBy: userId,
    });

    // Registra atividade
    await activityService.create(workspaceId, {
      type: ACTIVITY_TYPE.NOTE,
      title: 'Contato criado',
      contactId: contact._id,
      metadata: { source: data.source },
    }, userId);

    logger.info({
      msg: 'Contato criado',
      contactId: contact._id,
      workspaceId,
      userId,
    });

    return contact;
  }

  /**
   * Obtém contato por ID
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do contato
   * @param {Object} [options] - Opções
   * @returns {Promise<Contact>}
   */
  async getById(workspaceId, id, options = {}) {
    const contact = await contactRepository.findById(workspaceId, id, options);
    
    if (!contact) {
      throw AppError.notFound('Contato', id);
    }

    return contact;
  }

  /**
   * Atualiza contato
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do contato
   * @param {Object} data - Dados para atualizar
   * @param {string} userId - ID do usuário
   * @returns {Promise<Contact>}
   */
  async update(workspaceId, id, data, userId) {
    const contact = await this.getById(workspaceId, id);

    // Normaliza dados
    const normalizedData = this.normalizeContactData(data);

    // Verifica duplicados (excluindo o próprio contato)
    await this.checkDuplicates(workspaceId, normalizedData, id);

    // Atualiza
    const updated = await contactRepository.update(workspaceId, id, {
      ...normalizedData,
      updatedBy: userId,
    });

    logger.info({
      msg: 'Contato atualizado',
      contactId: id,
      workspaceId,
      userId,
    });

    return updated;
  }

  /**
   * Deleta contato
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do contato
   * @param {string} userId - ID do usuário
   * @returns {Promise<void>}
   */
  async delete(workspaceId, id, userId) {
    const contact = await this.getById(workspaceId, id);
    await contactRepository.delete(workspaceId, id, userId);

    logger.info({
      msg: 'Contato deletado',
      contactId: id,
      workspaceId,
      userId,
    });
  }

  /**
   * Lista contatos
   * @param {string} workspaceId - ID do workspace
   * @param {Object} filters - Filtros
   * @param {Object} options - Opções de paginação
   * @returns {Promise<{items: Contact[], total: number}>}
   */
  async list(workspaceId, filters = {}, options = {}) {
    return contactRepository.list(workspaceId, filters, options);
  }

  /**
   * Busca contatos
   * @param {string} workspaceId - ID do workspace
   * @param {string} query - Query de busca
   * @param {number} [limit] - Limite
   * @returns {Promise<Contact[]>}
   */
  async search(workspaceId, query, limit) {
    return contactRepository.search(workspaceId, query, limit);
  }

  /**
   * Busca ou cria contato
   * @param {string} workspaceId - ID do workspace
   * @param {Object} data - Dados do contato
   * @param {string} userId - ID do usuário
   * @returns {Promise<{contact: Contact, created: boolean}>}
   */
  async findOrCreate(workspaceId, data, userId) {
    const normalizedData = this.normalizeContactData(data);
    
    const result = await contactRepository.findOrCreate(workspaceId, {
      ...normalizedData,
      createdBy: userId,
      updatedBy: userId,
    });

    if (result.created) {
      logger.info({
        msg: 'Contato criado via findOrCreate',
        contactId: result.contact._id,
        workspaceId,
      });
    }

    return result;
  }

  /**
   * Atualiza score do contato
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do contato
   * @param {number} delta - Alteração no score
   * @param {string} userId - ID do usuário
   * @param {string} [reason] - Motivo da alteração
   * @returns {Promise<Contact>}
   */
  async updateScore(workspaceId, id, delta, userId, reason = null) {
    const contact = await this.getById(workspaceId, id);
    const oldScore = contact.score;
    
    await contact.updateScore(delta, userId);

    // Registra atividade
    await activityService.create(workspaceId, {
      type: ACTIVITY_TYPE.SCORE_CHANGED,
      title: `Score alterado: ${oldScore} → ${contact.score}`,
      contactId: id,
      metadata: { oldScore, newScore: contact.score, delta, reason },
    }, userId);

    return contact;
  }

  /**
   * Adiciona tags ao contato
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do contato
   * @param {string[]} tags - Tags para adicionar
   * @param {string} userId - ID do usuário
   * @returns {Promise<Contact>}
   */
  async addTags(workspaceId, id, tags, userId) {
    const contact = await this.getById(workspaceId, id);
    const normalizedTags = normalizeTags(tags);
    
    await contact.addTags(normalizedTags, userId);

    // Registra atividade
    await activityService.create(workspaceId, {
      type: ACTIVITY_TYPE.TAG_ADDED,
      title: `Tags adicionadas: ${normalizedTags.join(', ')}`,
      contactId: id,
      metadata: { tags: normalizedTags },
    }, userId);

    return contact;
  }

  /**
   * Remove tags do contato
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do contato
   * @param {string[]} tags - Tags para remover
   * @param {string} userId - ID do usuário
   * @returns {Promise<Contact>}
   */
  async removeTags(workspaceId, id, tags, userId) {
    const contact = await this.getById(workspaceId, id);
    const normalizedTags = normalizeTags(tags);
    
    await contact.removeTags(normalizedTags, userId);

    // Registra atividade
    await activityService.create(workspaceId, {
      type: ACTIVITY_TYPE.TAG_REMOVED,
      title: `Tags removidas: ${normalizedTags.join(', ')}`,
      contactId: id,
      metadata: { tags: normalizedTags },
    }, userId);

    return contact;
  }

  /**
   * Atribui contato a um usuário
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do contato
   * @param {string} assignedTo - ID do usuário atribuído
   * @param {string} userId - ID do usuário que fez a atribuição
   * @returns {Promise<Contact>}
   */
  async assign(workspaceId, id, assignedTo, userId) {
    const contact = await this.getById(workspaceId, id);
    
    const updated = await contactRepository.update(workspaceId, id, {
      assignedTo,
      updatedBy: userId,
    });

    // Registra atividade
    await activityService.create(workspaceId, {
      type: ACTIVITY_TYPE.ASSIGNED,
      title: 'Contato atribuído',
      contactId: id,
      metadata: { assignedTo },
    }, userId);

    return updated;
  }

  /**
   * Importa contatos em massa
   * @param {string} workspaceId - ID do workspace
   * @param {Object[]} contacts - Lista de contatos
   * @param {Object} options - Opções de importação
   * @param {string} userId - ID do usuário
   * @returns {Promise<Object>}
   */
  async bulkImport(workspaceId, contacts, options = {}, userId) {
    const { skipDuplicates = true, updateExisting = false, defaultTags = [], defaultSource } = options;

    const results = {
      total: contacts.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    for (let i = 0; i < contacts.length; i++) {
      const data = contacts[i];
      
      try {
        const normalizedData = this.normalizeContactData({
          ...data,
          tags: [...(data.tags || []), ...defaultTags],
          source: data.source || defaultSource,
        });

        // Verifica se já existe
        let existing = null;
        if (normalizedData.phone) {
          existing = await contactRepository.findByPhone(workspaceId, normalizedData.phone);
        }
        if (!existing && normalizedData.email) {
          existing = await contactRepository.findByEmail(workspaceId, normalizedData.email);
        }

        if (existing) {
          if (updateExisting) {
            await contactRepository.update(workspaceId, existing._id, {
              ...normalizedData,
              updatedBy: userId,
            });
            results.updated++;
          } else if (skipDuplicates) {
            results.skipped++;
          }
        } else {
          await contactRepository.create({
            ...normalizedData,
            workspaceId,
            createdBy: userId,
            updatedBy: userId,
          });
          results.created++;
        }
      } catch (error) {
        results.errors.push({
          index: i,
          data: { name: data.name, email: data.email, phone: data.phone },
          error: error.message,
        });
      }
    }

    logger.info({
      msg: 'Importação de contatos concluída',
      workspaceId,
      userId,
      results: {
        total: results.total,
        created: results.created,
        updated: results.updated,
        skipped: results.skipped,
        errors: results.errors.length,
      },
    });

    return results;
  }

  /**
   * Obtém estatísticas de contatos
   * @param {string} workspaceId - ID do workspace
   * @returns {Promise<Object>}
   */
  async getStats(workspaceId) {
    return contactRepository.getStats(workspaceId);
  }

  /**
   * Normaliza dados do contato
   * @param {Object} data - Dados brutos
   * @returns {Object}
   */
  normalizeContactData(data) {
    const normalized = { ...data };

    if (data.phone) {
      normalized.phone = normalizePhone(data.phone);
    }

    if (data.email) {
      normalized.email = normalizeEmail(data.email);
    }

    if (data.tags) {
      normalized.tags = normalizeTags(data.tags);
    }

    if (data.name) {
      normalized.name = data.name.trim();
    }

    return normalized;
  }

  /**
   * Verifica duplicados
   * @param {string} workspaceId - ID do workspace
   * @param {Object} data - Dados do contato
   * @param {string} [excludeId] - ID para excluir
   * @throws {AppError} Se encontrar duplicado
   */
  async checkDuplicates(workspaceId, data, excludeId = null) {
    if (data.email) {
      const existing = await contactRepository.findByEmail(workspaceId, data.email);
      if (existing && (!excludeId || existing._id.toString() !== excludeId)) {
        throw AppError.conflict('Email já cadastrado para outro contato');
      }
    }

    if (data.phone) {
      const existing = await contactRepository.findByPhone(workspaceId, data.phone);
      if (existing && (!excludeId || existing._id.toString() !== excludeId)) {
        throw AppError.conflict('Telefone já cadastrado para outro contato');
      }
    }
  }
}

module.exports = new ContactService();