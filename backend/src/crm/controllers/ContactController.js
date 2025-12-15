/**
 * @fileoverview Controller de Contact
 * @module crm/controllers/ContactController
 */

const contactService = require('../services/ContactService');
const { success, created, noContent, paginated } = require('../../shared/utils/response');

class ContactController {
  /**
   * Cria um novo contato
   * POST /api/crm/contacts
   */
  async create(req, res) {
    const contact = await contactService.create(
      req.workspace._id,
      req.body,
      req.user._id
    );

    return created(res, contact.toPublicJSON(), 'Contato criado com sucesso');
  }

  /**
   * Obtém contato por ID
   * GET /api/crm/contacts/:id
   */
  async getById(req, res) {
    const contact = await contactService.getById(
      req.workspace._id,
      req.params.id,
      { populate: ['assignedTo', 'deals'] }
    );

    return success(res, contact.toPublicJSON());
  }

  /**
   * Atualiza contato
   * PUT /api/crm/contacts/:id
   */
  async update(req, res) {
    const contact = await contactService.update(
      req.workspace._id,
      req.params.id,
      req.body,
      req.user._id
    );

    return success(res, contact.toPublicJSON(), 'Contato atualizado com sucesso');
  }

  /**
   * Deleta contato
   * DELETE /api/crm/contacts/:id
   */
  async delete(req, res) {
    await contactService.delete(
      req.workspace._id,
      req.params.id,
      req.user._id
    );

    return noContent(res);
  }

  /**
   * Lista contatos
   * GET /api/crm/contacts
   */
  async list(req, res) {
    const { page, limit, sort, order, ...filters } = req.query;
    
    const result = await contactService.list(
      req.workspace._id,
      filters,
      { page, limit, sort, order }
    );

    return paginated(res, result.items, result.total, { page, limit });
  }

  /**
   * Busca contatos
   * GET /api/crm/contacts/search
   */
  async search(req, res) {
    const { q, limit } = req.query;
    
    const contacts = await contactService.search(
      req.workspace._id,
      q,
      limit
    );

    return success(res, contacts);
  }

  /**
   * Atualiza tags do contato
   * PATCH /api/crm/contacts/:id/tags
   */
  async updateTags(req, res) {
    const { add, remove } = req.body;
    let contact;

    if (add && add.length > 0) {
      contact = await contactService.addTags(
        req.workspace._id,
        req.params.id,
        add,
        req.user._id
      );
    }

    if (remove && remove.length > 0) {
      contact = await contactService.removeTags(
        req.workspace._id,
        req.params.id,
        remove,
        req.user._id
      );
    }

    return success(res, contact.toPublicJSON(), 'Tags atualizadas com sucesso');
  }

  /**
   * Atualiza score do contato
   * PATCH /api/crm/contacts/:id/score
   */
  async updateScore(req, res) {
    const { delta, reason } = req.body;

    const contact = await contactService.updateScore(
      req.workspace._id,
      req.params.id,
      delta,
      req.user._id,
      reason
    );

    return success(res, contact.toPublicJSON(), 'Score atualizado com sucesso');
  }

  /**
   * Atribui contato a usuário
   * PATCH /api/crm/contacts/:id/assign
   */
  async assign(req, res) {
    const { assignedTo } = req.body;

    const contact = await contactService.assign(
      req.workspace._id,
      req.params.id,
      assignedTo,
      req.user._id
    );

    return success(res, contact.toPublicJSON(), 'Contato atribuído com sucesso');
  }

  /**
   * Importa contatos em massa
   * POST /api/crm/contacts/import
   */
  async bulkImport(req, res) {
    const { contacts, options } = req.body;

    const result = await contactService.bulkImport(
      req.workspace._id,
      contacts,
      options,
      req.user._id
    );

    return success(res, result, 'Importação concluída');
  }

  /**
   * Obtém estatísticas de contatos
   * GET /api/crm/contacts/stats
   */
  async getStats(req, res) {
    const stats = await contactService.getStats(req.workspace._id);
    return success(res, stats);
  }
}

module.exports = new ContactController();