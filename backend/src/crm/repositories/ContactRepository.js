/**
 * @fileoverview Repository de Contact
 * @module crm/repositories/ContactRepository
 */

const Contact = require('../models/Contact');
const { toObjectId } = require('../../shared/utils/ids');

class ContactRepository {
  /**
   * Cria um novo contato
   * @param {Object} data - Dados do contato
   * @returns {Promise<Contact>}
   */
  async create(data) {
    const contact = new Contact(data);
    return contact.save();
  }

  /**
   * Busca contato por ID
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do contato
   * @param {Object} [options] - Opções
   * @returns {Promise<Contact|null>}
   */
  async findById(workspaceId, id, options = {}) {
    const query = Contact.findOne({
      _id: toObjectId(id),
      workspaceId: toObjectId(workspaceId),
    });

    if (options.populate) {
      if (options.populate.includes('assignedTo')) {
        query.populate('assignedTo', 'name email avatar');
      }
      if (options.populate.includes('deals')) {
        query.populate('activeDeals');
      }
    }

    return query.exec();
  }

  /**
   * Busca contato por email
   * @param {string} workspaceId - ID do workspace
   * @param {string} email - Email
   * @returns {Promise<Contact|null>}
   */
  async findByEmail(workspaceId, email) {
    return Contact.findByEmail(workspaceId, email);
  }

  /**
   * Busca contato por telefone
   * @param {string} workspaceId - ID do workspace
   * @param {string} phone - Telefone
   * @returns {Promise<Contact|null>}
   */
  async findByPhone(workspaceId, phone) {
    return Contact.findByPhone(workspaceId, phone);
  }

  /**
   * Busca contato por WhatsApp JID
   * @param {string} workspaceId - ID do workspace
   * @param {string} jid - WhatsApp JID
   * @returns {Promise<Contact|null>}
   */
  async findByWhatsAppJid(workspaceId, jid) {
    return Contact.findByWhatsAppJid(workspaceId, jid);
  }

  /**
   * Busca ou cria contato
   * @param {string} workspaceId - ID do workspace
   * @param {Object} data - Dados do contato
   * @returns {Promise<{contact: Contact, created: boolean}>}
   */
  async findOrCreate(workspaceId, data) {
    // Tenta encontrar por telefone primeiro
    if (data.phone) {
      const existing = await this.findByPhone(workspaceId, data.phone);
      if (existing) {
        return { contact: existing, created: false };
      }
    }

    // Depois por email
    if (data.email) {
      const existing = await this.findByEmail(workspaceId, data.email);
      if (existing) {
        return { contact: existing, created: false };
      }
    }

    // Por WhatsApp JID
    if (data.whatsapp?.jid) {
      const existing = await this.findByWhatsAppJid(workspaceId, data.whatsapp.jid);
      if (existing) {
        return { contact: existing, created: false };
      }
    }

    // Cria novo
    const contact = await this.create({ ...data, workspaceId });
    return { contact, created: true };
  }

  /**
   * Atualiza contato
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do contato
   * @param {Object} data - Dados para atualizar
   * @returns {Promise<Contact|null>}
   */
  async update(workspaceId, id, data) {
    return Contact.findOneAndUpdate(
      { _id: toObjectId(id), workspaceId: toObjectId(workspaceId) },
      { $set: data },
      { new: true, runValidators: true }
    );
  }

  /**
   * Deleta contato (soft delete)
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do contato
   * @param {string} userId - ID do usuário
   * @returns {Promise<Contact|null>}
   */
  async delete(workspaceId, id, userId) {
    const contact = await this.findById(workspaceId, id);
    if (!contact) return null;
    return contact.softDelete(userId);
  }

  /**
   * Lista contatos com filtros
   * @param {string} workspaceId - ID do workspace
   * @param {Object} filters - Filtros
   * @param {Object} options - Opções de paginação/ordenação
   * @returns {Promise<{items: Contact[], total: number}>}
   */
  async list(workspaceId, filters = {}, options = {}) {
    const {
      page = 1,
      limit = 20,
      sort = 'createdAt',
      order = 'desc',
    } = options;

    const query = { workspaceId: toObjectId(workspaceId) };

    // Aplica filtros
    if (filters.status) {
      query.status = Array.isArray(filters.status)
        ? { $in: filters.status }
        : filters.status;
    }

    if (filters.type) {
      query.type = Array.isArray(filters.type)
        ? { $in: filters.type }
        : filters.type;
    }

    if (filters.source) {
      query.source = filters.source;
    }

    if (filters.assignedTo) {
      query.assignedTo = toObjectId(filters.assignedTo);
    }

    if (filters.unassigned) {
      query.assignedTo = null;
    }

    if (filters.tags) {
      const tags = Array.isArray(filters.tags) ? filters.tags : [filters.tags];
      query.tags = { $all: tags };
    }

    if (filters.minScore !== undefined) {
      query.score = { ...query.score, $gte: filters.minScore };
    }

    if (filters.maxScore !== undefined) {
      query.score = { ...query.score, $lte: filters.maxScore };
    }

    if (filters.createdFrom) {
      query.createdAt = { ...query.createdAt, $gte: new Date(filters.createdFrom) };
    }

    if (filters.createdTo) {
      query.createdAt = { ...query.createdAt, $lte: new Date(filters.createdTo) };
    }

    if (filters.hasEmail !== undefined) {
      query.email = filters.hasEmail ? { $exists: true, $ne: null } : { $in: [null, ''] };
    }

    if (filters.hasPhone !== undefined) {
      query.phone = filters.hasPhone ? { $exists: true, $ne: null } : { $in: [null, ''] };
    }

    if (filters.search) {
      query.$text = { $search: filters.search };
    }

    // Executa queries
    const skip = (page - 1) * limit;
    const sortObj = { [sort]: order === 'asc' ? 1 : -1 };

    const [items, total] = await Promise.all([
      Contact.find(query)
        .populate('assignedTo', 'name email avatar')
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean(),
      Contact.countDocuments(query),
    ]);

    return { items, total };
  }

  /**
   * Busca por texto
   * @param {string} workspaceId - ID do workspace
   * @param {string} query - Query de busca
   * @param {number} [limit=10] - Limite
   * @returns {Promise<Contact[]>}
   */
  async search(workspaceId, query, limit = 10) {
    return Contact.search(workspaceId, query, { limit });
  }

  /**
   * Conta contatos por critério
   * @param {string} workspaceId - ID do workspace
   * @param {Object} [criteria] - Critérios
   * @returns {Promise<number>}
   */
  async count(workspaceId, criteria = {}) {
    return Contact.countDocuments({
      workspaceId: toObjectId(workspaceId),
      ...criteria,
    });
  }

  /**
   * Atualiza métricas do contato
   * @param {string} contactId - ID do contato
   * @param {Object} metrics - Métricas a atualizar
   * @returns {Promise<Contact>}
   */
  async updateMetrics(contactId, metrics) {
    return Contact.findByIdAndUpdate(
      contactId,
      { $set: { metrics } },
      { new: true }
    );
  }

  /**
   * Incrementa métricas do contato
   * @param {string} contactId - ID do contato
   * @param {Object} increments - Incrementos
   * @returns {Promise<Contact>}
   */
  async incrementMetrics(contactId, increments) {
    const incObj = {};
    for (const [key, value] of Object.entries(increments)) {
      incObj[`metrics.${key}`] = value;
    }

    return Contact.findByIdAndUpdate(
      contactId,
      { $inc: incObj },
      { new: true }
    );
  }

  /**
   * Bulk insert de contatos
   * @param {Array} contacts - Contatos a inserir
   * @param {Object} [options] - Opções
   * @returns {Promise<Object>}
   */
  async bulkInsert(contacts, options = {}) {
    const { skipDuplicates = true } = options;

    try {
      const result = await Contact.insertMany(contacts, {
        ordered: false,
        rawResult: true,
      });

      return {
        inserted: result.insertedCount,
        errors: [],
      };
    } catch (error) {
      if (error.writeErrors && skipDuplicates) {
        const insertedCount = contacts.length - error.writeErrors.length;
        return {
          inserted: insertedCount,
          errors: error.writeErrors.map((e) => ({
            index: e.index,
            message: e.errmsg,
          })),
        };
      }
      throw error;
    }
  }

  /**
   * Obtém estatísticas de contatos
   * @param {string} workspaceId - ID do workspace
   * @returns {Promise<Object>}
   */
  async getStats(workspaceId) {
    const stats = await Contact.aggregate([
      { $match: { workspaceId: toObjectId(workspaceId), deletedAt: null } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          byStatus: {
            $push: '$status',
          },
          byType: {
            $push: '$type',
          },
          bySource: {
            $push: '$source',
          },
          avgScore: { $avg: '$score' },
          withEmail: {
            $sum: { $cond: [{ $gt: ['$email', null] }, 1, 0] },
          },
          withPhone: {
            $sum: { $cond: [{ $gt: ['$phone', null] }, 1, 0] },
          },
        },
      },
    ]);

    if (stats.length === 0) {
      return {
        total: 0,
        byStatus: {},
        byType: {},
        bySource: {},
        avgScore: 0,
        withEmail: 0,
        withPhone: 0,
      };
    }

    const result = stats[0];

    // Conta por status, type, source
    const countBy = (arr) =>
      arr.reduce((acc, val) => {
        acc[val] = (acc[val] || 0) + 1;
        return acc;
      }, {});

    return {
      total: result.total,
      byStatus: countBy(result.byStatus),
      byType: countBy(result.byType),
      bySource: countBy(result.bySource),
      avgScore: Math.round(result.avgScore || 0),
      withEmail: result.withEmail,
      withPhone: result.withPhone,
    };
  }
}

module.exports = new ContactRepository();