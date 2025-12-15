/**
 * @fileoverview Model de Contact
 * @module crm/models/Contact
 */

const mongoose = require('mongoose');
const { CONTACT_STATUS, CONTACT_TYPE, CONTACT_SOURCE, SCORE_DEFAULTS } = require('../constants/crmConstants');

const contactSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    phoneNormalized: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(CONTACT_TYPE),
      default: CONTACT_TYPE.LEAD,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(CONTACT_STATUS),
      default: CONTACT_STATUS.ACTIVE,
      index: true,
    },
    source: {
      type: String,
      enum: Object.values(CONTACT_SOURCE),
      default: CONTACT_SOURCE.MANUAL,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    score: {
      type: Number,
      default: SCORE_DEFAULTS.INITIAL,
      min: SCORE_DEFAULTS.MIN,
      max: SCORE_DEFAULTS.MAX,
      index: true,
    },
    avatar: {
      type: String,
    },
    company: {
      name: String,
      position: String,
      website: String,
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String,
    },
    social: {
      instagram: String,
      facebook: String,
      linkedin: String,
      twitter: String,
    },
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: new Map(),
    },
    notes: {
      type: String,
      maxlength: 5000,
    },
    // Métricas
    metrics: {
      totalDeals: { type: Number, default: 0 },
      wonDeals: { type: Number, default: 0 },
      lostDeals: { type: Number, default: 0 },
      totalValue: { type: Number, default: 0 },
      wonValue: { type: Number, default: 0 },
      messageCount: { type: Number, default: 0 },
      avgResponseTime: { type: Number, default: 0 }, // em minutos
    },
    // Timestamps de interação
    firstContactAt: {
      type: Date,
    },
    lastContactAt: {
      type: Date,
      index: true,
    },
    lastMessageAt: {
      type: Date,
    },
    convertedAt: {
      type: Date,
    },
    // WhatsApp específico
    whatsapp: {
      jid: String,
      profilePicUrl: String,
      pushName: String,
      isBlocked: { type: Boolean, default: false },
      lastSeen: Date,
    },
    // Controle
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    deletedAt: {
      type: Date,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Índices compostos
contactSchema.index({ workspaceId: 1, email: 1 }, { unique: true, sparse: true });
contactSchema.index({ workspaceId: 1, phoneNormalized: 1 }, { unique: true, sparse: true });
contactSchema.index({ workspaceId: 1, status: 1, type: 1 });
contactSchema.index({ workspaceId: 1, tags: 1 });
contactSchema.index({ workspaceId: 1, assignedTo: 1, status: 1 });
contactSchema.index({ workspaceId: 1, createdAt: -1 });
contactSchema.index({ workspaceId: 1, score: -1 });
contactSchema.index({ workspaceId: 1, 'whatsapp.jid': 1 }, { sparse: true });

// Índice de texto para busca
contactSchema.index(
  {
    name: 'text',
    email: 'text',
    phone: 'text',
    'company.name': 'text',
    notes: 'text',
  },
  {
    weights: {
      name: 10,
      email: 5,
      phone: 5,
      'company.name': 3,
      notes: 1,
    },
    name: 'contact_text_search',
  }
);

// Virtual para deals ativos
contactSchema.virtual('activeDeals', {
  ref: 'Deal',
  localField: '_id',
  foreignField: 'contactId',
  match: { status: 'open' },
});

// Virtual para atividades recentes
contactSchema.virtual('recentActivities', {
  ref: 'Activity',
  localField: '_id',
  foreignField: 'contactId',
  options: { sort: { createdAt: -1 }, limit: 10 },
});

// Middleware pre-save
contactSchema.pre('save', function (next) {
  // Normaliza telefone
  if (this.isModified('phone') && this.phone) {
    this.phoneNormalized = this.phone.replace(/\D/g, '');
  }

  // Define firstContactAt
  if (this.isNew && !this.firstContactAt) {
    this.firstContactAt = new Date();
  }

  next();
});

// Soft delete
contactSchema.pre(/^^find/, function (next) {
  if (!this.getOptions().includeDeleted) {
    this.where({ deletedAt: null });
  }
  next();
});

// Métodos de instância
contactSchema.methods.softDelete = async function (userId) {
  this.deletedAt = new Date();
  this.updatedBy = userId;
  return this.save();
};

contactSchema.methods.restore = async function (userId) {
  this.deletedAt = null;
  this.updatedBy = userId;
  return this.save();
};

contactSchema.methods.updateScore = async function (delta, userId) {
  const newScore = Math.max(
    SCORE_DEFAULTS.MIN,
    Math.min(SCORE_DEFAULTS.MAX, this.score + delta)
  );
  this.score = newScore;
  this.updatedBy = userId;
  return this.save();
};

contactSchema.methods.addTags = async function (tags, userId) {
  const uniqueTags = [...new Set([...this.tags, ...tags])];
  this.tags = uniqueTags.slice(0, 20);
  this.updatedBy = userId;
  return this.save();
};

contactSchema.methods.removeTags = async function (tags, userId) {
  this.tags = this.tags.filter((t) => !tags.includes(t));
  this.updatedBy = userId;
  return this.save();
};

contactSchema.methods.toPublicJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  delete obj.deletedAt;
  return obj;
};

// Statics
contactSchema.statics.findByPhone = function (workspaceId, phone) {
  const normalized = phone.replace(/\D/g, '');
  return this.findOne({ workspaceId, phoneNormalized: normalized });
};

contactSchema.statics.findByEmail = function (workspaceId, email) {
  return this.findOne({ workspaceId, email: email.toLowerCase() });
};

contactSchema.statics.findByWhatsAppJid = function (workspaceId, jid) {
  return this.findOne({ workspaceId, 'whatsapp.jid': jid });
};

contactSchema.statics.search = function (workspaceId, query, options = {}) {
  const { limit = 10 } = options;
  
  return this.find(
    {
      workspaceId,
      $text: { $search: query },
    },
    { score: { $meta: 'textScore' } }
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit);
};

const Contact = mongoose.model('Contact', contactSchema);

module.exports = Contact;