/**
 * @fileoverview Model de WorkspaceInvite
 * @module team/models/WorkspaceInvite
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const { WORKSPACE_ROLE, INVITE_STATUS, AUTH_CONFIG } = require('../constants/teamConstants');

const workspaceInviteSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    role: {
      type: String,
      enum: Object.values(WORKSPACE_ROLE).filter((r) => r !== WORKSPACE_ROLE.OWNER),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(INVITE_STATUS),
      default: INVITE_STATUS.PENDING,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    message: {
      type: String,
      maxlength: 500,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    acceptedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Índice composto para evitar convites duplicados
workspaceInviteSchema.index(
  { workspaceId: 1, email: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: INVITE_STATUS.PENDING } }
);

// Middleware pre-save
workspaceInviteSchema.pre('save', function (next) {
  if (this.isNew && !this.token) {
    this.token = crypto.randomBytes(32).toString('hex');
  }

  if (this.isNew && !this.expiresAt) {
    this.expiresAt = new Date(Date.now() + AUTH_CONFIG.INVITE_EXPIRY);
  }

  next();
});

// Métodos
workspaceInviteSchema.methods.isValid = function () {
  return (
    this.status === INVITE_STATUS.PENDING &&
    this.expiresAt > new Date()
  );
};

workspaceInviteSchema.methods.accept = async function (userId) {
  this.status = INVITE_STATUS.ACCEPTED;
  this.acceptedBy = userId;
  this.acceptedAt = new Date();
  return this.save();
};

workspaceInviteSchema.methods.cancel = async function () {
  this.status = INVITE_STATUS.CANCELLED;
  return this.save();
};

workspaceInviteSchema.methods.expire = async function () {
  this.status = INVITE_STATUS.EXPIRED;
  return this.save();
};

workspaceInviteSchema.methods.resend = async function () {
  this.token = crypto.randomBytes(32).toString('hex');
  this.expiresAt = new Date(Date.now() + AUTH_CONFIG.INVITE_EXPIRY);
  this.status = INVITE_STATUS.PENDING;
  return this.save();
};

// Statics
workspaceInviteSchema.statics.findByToken = function (token) {
  return this.findOne({ token })
    .populate('workspaceId', 'name slug logo')
    .populate('invitedBy', 'name email');
};

workspaceInviteSchema.statics.findPendingByEmail = function (workspaceId, email) {
  return this.findOne({
    workspaceId,
    email: email.toLowerCase(),
    status: INVITE_STATUS.PENDING,
    expiresAt: { $gt: new Date() },
  });
};

workspaceInviteSchema.statics.getPendingInvites = function (workspaceId) {
  return this.find({
    workspaceId,
    status: INVITE_STATUS.PENDING,
    expiresAt: { $gt: new Date() },
  })
    .populate('invitedBy', 'name email')
    .sort({ createdAt: -1 });
};

workspaceInviteSchema.statics.expireOldInvites = async function () {
  return this.updateMany(
    {
      status: INVITE_STATUS.PENDING,
      expiresAt: { $lt: new Date() },
    },
    { status: INVITE_STATUS.EXPIRED }
  );
};

const WorkspaceInvite = mongoose.model('WorkspaceInvite', workspaceInviteSchema);

module.exports = WorkspaceInvite;
