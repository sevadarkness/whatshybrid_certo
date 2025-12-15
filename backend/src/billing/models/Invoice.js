/**
 * @fileoverview Model de Invoice
 * @module billing/models/Invoice
 */

const mongoose = require('mongoose');
const { INVOICE_STATUS } = require('../constants/billingConstants');

const invoiceItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, required: true },
    amount: { type: Number, required: true },
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      index: true,
    },
    stripeInvoiceId: {
      type: String,
      unique: true,
      sparse: true,
    },
    // Número da fatura
    number: {
      type: String,
      unique: true,
    },
    // Status
    status: {
      type: String,
      enum: Object.values(INVOICE_STATUS),
      default: INVOICE_STATUS.DRAFT,
      index: true,
    },
    // Valores
    subtotal: {
      type: Number,
      required: true,
    },
    tax: {
      type: Number,
      default: 0,
    },
    discount: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'BRL',
    },
    // Itens
    items: [invoiceItemSchema],
    // Datas
    periodStart: {
      type: Date,
    },
    periodEnd: {
      type: Date,
    },
    dueDate: {
      type: Date,
    },
    paidAt: {
      type: Date,
    },
    // Pagamento
    paymentMethod: {
      type: String,
    },
    paymentIntentId: {
      type: String,
    },
    // URLs
    hostedInvoiceUrl: {
      type: String,
    },
    invoicePdf: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Gera número da fatura
invoiceSchema.pre('save', async function (next) {
  if (this.isNew && !this.number) {
    const count = await this.constructor.countDocuments();
    const year = new Date().getFullYear();
    this.number = `INV-${year}-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

// Métodos
invoiceSchema.methods.markAsPaid = async function (paymentDetails = {}) {
  this.status = INVOICE_STATUS.PAID;
  this.paidAt = new Date();
  if (paymentDetails.paymentMethod) {
    this.paymentMethod = paymentDetails.paymentMethod;
  }
  if (paymentDetails.paymentIntentId) {
    this.paymentIntentId = paymentDetails.paymentIntentId;
  }
  return this.save();
};

invoiceSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    number: this.number,
    status: this.status,
    subtotal: this.subtotal,
    tax: this.tax,
    discount: this.discount,
    total: this.total,
    currency: this.currency,
    items: this.items,
    periodStart: this.periodStart,
    periodEnd: this.periodEnd,
    dueDate: this.dueDate,
    paidAt: this.paidAt,
    hostedInvoiceUrl: this.hostedInvoiceUrl,
    invoicePdf: this.invoicePdf,
    createdAt: this.createdAt,
  };
};

const Invoice = mongoose.model('Invoice', invoiceSchema);

module.exports = Invoice;