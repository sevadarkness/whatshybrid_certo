/**
 * @fileoverview Model de Workspace
 * @module team/models/Workspace
 */

const mongoose = require('mongoose');
const slugify = require('slugify');

const businessHoursSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    timezone: { type: String, default: 'America/Sao_Paulo' },
    schedule: {
      monday: { enabled: { type: Boolean, default: true }, start: String, end: String },
      tuesday: { enabled: { type: Boolean, default: true }, start: String, end: String },
      wednesday: { enabled: { type: Boolean, default: true }, start: String, end: String },
      thursday: { enabled: { type: Boolean, default: true }, start: String, end: String },
      friday: { enabled: { type: Boolean, default: true }, start: String, end: String },
      saturday: { enabled: { type: Boolean, default: false }, start: String, end: String },
      sunday: { enabled: { type: Boolean, default: false }, start: String, end: String },
    },
  },
  { _id: false }
);

const workspaceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      maxlength: 500,
    },
    logo: {
      type: String,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    settings: {
      timezone: { type: String, default: 'America/Sao_Paulo' },
      language: { type: String, default: 'pt-BR' },
      currency: { type: String, default: 'BRL' },
      dateFormat: { type: String, default: 'DD/MM/YYYY' },
      businessHours: { type: businessHoursSchema, default: () => ({}) },
    },
    // Limites do plano
    limits: {
      members: { type: Number, default: 5 },
      contacts: { type: Number, default: 1000 },
      channels: { type: Number, default: 2 },
      messagesPerMonth: { type: Number, default: 5000 },
      storage: { type: Number, default: 1073741824 }, // 1GB em bytes
    },
    // Uso atual
    usage: {
      members: { type: Number, default: 0 },
      contacts: { type: Number, default: 0 },
      channels: { type: Number, default: 0 },
      messagesThisMonth: { type: Number, default: 0 },
      storage: { type: Number, default: 0 },
      lastResetAt: { type: Date, default: Date.now },
    },
    // Billing
    plan: {
      type: String,
      enum: ['free', 'starter', 'professional', 'enterprise'],
      default: 'free',
    },
    billingCustomerId: {
      type: String,
    },
    subscriptionId: {
      type: String,
    },
    subscriptionStatus: {
      type: String,
      enum: ['active', 'past_due', 'canceled', 'trialing', null],
    },
    trialEndsAt: {
      type: Date,
    },
    // Status
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    suspendedAt: {
      type: Date,
    },
    suspendedReason: {
      type: String,
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

// Virtual para membros
workspaceSchema.virtual('members', {
  ref: 'WorkspaceMember',
  localField: '_id',
  foreignField: 'workspaceId',
});

// Middleware pre-save
workspaceSchema.pre('save', async function (next) {
  // Gera slug se não existir
  if (!this.slug || this.isModified('name')) {
    let baseSlug = slugify(this.name, { lower: true, strict: true });
    let slug = baseSlug;
    let counter = 1;

    // Verifica unicidade
    while (await this.constructor.findOne({ slug, _id: { $ne: this._id } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    this.slug = slug;
  }

  next();
});

// Soft delete
workspaceSchema.pre(/^^find/, function (next) {
  if (!this.getOptions().includeDeleted) {
    this.where({ deletedAt: null });
  }
  next();
});

// Métodos
workspaceSchema.methods.isWithinLimits = function (resource, increment = 1) {
  const current = this.usage[resource] || 0;
  const limit = this.limits[resource];
  
  if (!limit) return true;
  return current + increment <= limit;
};

workspaceSchema.methods.incrementUsage = async function (resource, amount = 1) {
  const update = {};
  update[`usage.${resource}`] = amount;
  
  return this.updateOne({ $inc: update });
};

workspaceSchema.methods.decrementUsage = async function (resource, amount = 1) {
  const update = {};
  update[`usage.${resource}`] = -amount;
  
  return this.updateOne({
    $inc: update,
    $max: { [`usage.${resource}`]: 0 },
  });
};

workspaceSchema.methods.resetMonthlyUsage = async function () {
  this.usage.messagesThisMonth = 0;
  this.usage.lastResetAt = new Date();
  return this.save();
};

workspaceSchema.methods.suspend = async function (reason) {
  this.isActive = false;
  this.suspendedAt = new Date();
  this.suspendedReason = reason;
  return this.save();
};

workspaceSchema.methods.reactivate = async function () {
  this.isActive = true;
  this.suspendedAt = null;
  this.suspendedReason = null;
  return this.save();
};

workspaceSchema.methods.softDelete = async function () {
  this.deletedAt = new Date();
  this.isActive = false;
  this.slug = `deleted_${Date.now()}_${this.slug}`;
  return this.save();
};

workspaceSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    name: this.name,
    slug: this.slug,
    description: this.description,
    logo: this.logo,
    settings: this.settings,
    plan: this.plan,
    limits: this.limits,
    usage: this.usage,
    isActive: this.isActive,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

// Statics
workspaceSchema.statics.findBySlug = function (slug) {
  return this.findOne({ slug: slug.toLowerCase() });
};

const Workspace = mongoose.model('Workspace', workspaceSchema);

module.exports = Workspace;