/**
 * @fileoverview Model de Subscription
 * @module billing/models/Subscription
 */

const mongoose = require('mongoose');
const { PLAN, SUBSCRIPTION_STATUS, BILLING_CYCLE } = require('../constants/billingConstants');

const subscriptionSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      unique: true,
      index: true,
    },
    // Stripe IDs
    stripeCustomerId: {
      type: String,
      index: true,
    },
    stripeSubscriptionId: {
      type: String,
      unique: true,
      sparse: true,
    },
    stripePriceId: {
      type: String,
    },
    // Plano
    plan: {
      type: String,
      enum: Object.values(PLAN),
      default: PLAN.FREE,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(SUBSCRIPTION_STATUS),
      default: SUBSCRIPTION_STATUS.ACTIVE,
      index: true,
    },
    billingCycle: {
      type: String,
      enum: Object.values(BILLING_CYCLE),
      default: BILLING_CYCLE.MONTHLY,
    },
    // Datas
    currentPeriodStart: {
      type: Date,
    },
    currentPeriodEnd: {
      type: Date,
    },
    trialStart: {
      type: Date,
    },
    trialEnd: {
      type: Date,
    },
    canceledAt: {
      type: Date,
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    // Uso
    usage: {
      messages: { type: Number, default: 0 },
      aiMessages: { type: Number, default: 0 },
      contacts: { type: Number, default: 0 },
      storage: { type: Number, default: 0 },
      lastResetAt: { type: Date, default: Date.now },
    },
    // Metadata
    metadata: {
      type: Map,
      of: String,
    },
  },
  {
    timestamps: true,
  }
);

// Métodos
subscriptionSchema.methods.isActive = function () {
  return [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.TRIALING].includes(this.status);
};

subscriptionSchema.methods.isTrialing = function () {
  return this.status === SUBSCRIPTION_STATUS.TRIALING && this.trialEnd > new Date();
};

subscriptionSchema.methods.canUpgrade = function (newPlan) {
  const planOrder = [PLAN.FREE, PLAN.STARTER, PLAN.PROFESSIONAL, PLAN.ENTERPRISE];
  return planOrder.indexOf(newPlan) > planOrder.indexOf(this.plan);
};

subscriptionSchema.methods.resetMonthlyUsage = async function () {
  this.usage.messages = 0;
  this.usage.aiMessages = 0;
  this.usage.lastResetAt = new Date();
  return this.save();
};

subscriptionSchema.methods.incrementUsage = async function (type, amount = 1) {
  const field = `usage.${type}`;
  return this.updateOne({ $inc: { [field]: amount } });
};

subscriptionSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    workspaceId: this.workspaceId,
    plan: this.plan,
    status: this.status,
    billingCycle: this.billingCycle,
    currentPeriodStart: this.currentPeriodStart,
    currentPeriodEnd: this.currentPeriodEnd,
    trialEnd: this.trialEnd,
    cancelAtPeriodEnd: this.cancelAtPeriodEnd,
    usage: this.usage,
    createdAt: this.createdAt,
  };
};

const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = Subscription;