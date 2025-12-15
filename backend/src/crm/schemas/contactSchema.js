/**
 * @fileoverview Schemas de validação para Contact
 * @module crm/schemas/contactSchema
 */

const Joi = require('joi');
const { CONTACT_STATUS, CONTACT_TYPE, CONTACT_SOURCE } = require('../constants/crmConstants');

/**
 * Schema base de contato
 */
const contactBase = {
  name: Joi.string().trim().max(200),
  email: Joi.string().email().lowercase().trim(),
  phone: Joi.string().pattern(/^^\+?[\d\s-]{8,20}$/),
  type: Joi.string().valid(...Object.values(CONTACT_TYPE)),
  status: Joi.string().valid(...Object.values(CONTACT_STATUS)),
  source: Joi.string().valid(...Object.values(CONTACT_SOURCE)),
  assignedTo: Joi.string().hex().length(24),
  tags: Joi.array().items(Joi.string().trim().max(50)).max(20),
  score: Joi.number().min(0).max(100),
  avatar: Joi.string().uri(),
  company: Joi.object({
    name: Joi.string().trim().max(200),
    position: Joi.string().trim().max(100),
    website: Joi.string().uri(),
  }),
  address: Joi.object({
    street: Joi.string().trim().max(300),
    city: Joi.string().trim().max(100),
    state: Joi.string().trim().max(100),
    zipCode: Joi.string().trim().max(20),
    country: Joi.string().trim().max(100),
  }),
  social: Joi.object({
    instagram: Joi.string().trim().max(100),
    facebook: Joi.string().trim().max(100),
    linkedin: Joi.string().trim().max(100),
    twitter: Joi.string().trim().max(100),
  }),
  customFields: Joi.object().pattern(Joi.string(), Joi.any()),
  notes: Joi.string().max(5000),
};

/**
 * Schema para criar contato
 */
const createContactSchema = Joi.object({
  ...contactBase,
  name: contactBase.name.required(),
}).or('email', 'phone'); // Requer pelo menos email ou phone

/**
 * Schema para atualizar contato
 */
const updateContactSchema = Joi.object({
  ...contactBase,
}).min(1);

/**
 * Schema para query de listagem
 */
const listContactsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().valid('name', 'createdAt', 'updatedAt', 'score', 'lastContactAt').default('createdAt'),
  order: Joi.string().valid('asc', 'desc').default('desc'),
  search: Joi.string().trim().max(100),
  status: Joi.alternatives().try(
    Joi.string().valid(...Object.values(CONTACT_STATUS)),
    Joi.array().items(Joi.string().valid(...Object.values(CONTACT_STATUS)))
  ),
  type: Joi.alternatives().try(
    Joi.string().valid(...Object.values(CONTACT_TYPE)),
    Joi.array().items(Joi.string().valid(...Object.values(CONTACT_TYPE)))
  ),
  source: Joi.string().valid(...Object.values(CONTACT_SOURCE)),
  tags: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string())
  ),
  assignedTo: Joi.string().hex().length(24),
  unassigned: Joi.boolean(),
  minScore: Joi.number().min(0).max(100),
  maxScore: Joi.number().min(0).max(100),
  createdFrom: Joi.date().iso(),
  createdTo: Joi.date().iso(),
  hasEmail: Joi.boolean(),
  hasPhone: Joi.boolean(),
});

/**
 * Schema para busca de contato
 */
const searchContactSchema = Joi.object({
  q: Joi.string().trim().min(2).max(100).required(),
  limit: Joi.number().integer().min(1).max(50).default(10),
});

/**
 * Schema para importação em massa
 */
const bulkImportSchema = Joi.object({
  contacts: Joi.array()
    .items(createContactSchema)
    .min(1)
    .max(1000)
    .required(),
  options: Joi.object({
    skipDuplicates: Joi.boolean().default(true),
    updateExisting: Joi.boolean().default(false),
    defaultTags: Joi.array().items(Joi.string()).max(10),
    defaultSource: Joi.string().valid(...Object.values(CONTACT_SOURCE)),
  }),
});

/**
 * Schema para merge de contatos
 */
const mergeContactsSchema = Joi.object({
  sourceIds: Joi.array().items(Joi.string().hex().length(24)).min(1).max(10).required(),
  targetId: Joi.string().hex().length(24).required(),
  strategy: Joi.string().valid('keep_target', 'keep_source', 'merge').default('merge'),
});

/**
 * Schema para adicionar/remover tags
 */
const updateTagsSchema = Joi.object({
  add: Joi.array().items(Joi.string().trim().max(50)).max(20),
  remove: Joi.array().items(Joi.string().trim().max(50)).max(20),
}).or('add', 'remove');

/**
 * Schema de params com ID
 */
const contactIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

module.exports = {
  createContactSchema,
  updateContactSchema,
  listContactsQuerySchema,
  searchContactSchema,
  bulkImportSchema,
  mergeContactsSchema,
  updateTagsSchema,
  contactIdParamSchema,
};