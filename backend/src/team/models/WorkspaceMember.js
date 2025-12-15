/**
 * @fileoverview Model de WorkspaceMember
 * @module team/models/WorkspaceMember
 */

const mongoose = require('mongoose');
const { WORKSPACE_ROLE, MEMBER_STATUS, ROLE_PERMISSIONS } = require('../constants/teamConstants');

const workspaceMemberSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: Object.values(WORKSPACE_ROLE),
      default: WORKSPACE_ROLE.AGENT,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(MEMBER_STATUS),
      default: MEMBER_STATUS.ACTIVE,
      index: true,
    },
    // Permissões customizadas (override do role)
    customPermissions: {
      grant: [{ type: String }],
      revoke: [{ type: String }],
    },
    // Configurações do membro
    settings: {
      notifications: {
        newMessage: { type: Boolean, default: true },
        newContact: { type: Boolean, default: true },
        newDeal: { type: Boolean, default: true },
        mentions: { type: Boolean, default: true },
      },
      autoAssign: { type: Boolean, default: true },
    },
    // Dados de atividade
    lastActiveAt: {
      type: Date,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    invitedAt: {
      type: Date,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Índice único composto
workspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

// Virtual para user
workspaceMemberSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true,
});

// Virtual para workspace
workspaceMemberSchema.virtual('workspace', {
  ref: 'Workspace',
  localField: 'workspaceId',
  foreignField: '_id',
  justOne: true,
});

// Métodos
workspaceMemberSchema.methods.getPermissions = function () {
  // Começa com permissões do role
  let permissions = new Set(ROLE_PERMISSIONS[this.role] || []);

  // Adiciona permissões customizadas
  if (this.customPermissions?.grant) {
    this.customPermissions.grant.forEach((p) => permissions.add(p));
  }

  // Remove permissões revogadas
  if (this.customPermissions?.revoke) {
    this.customPermissions.revoke.forEach((p) => permissions.delete(p));
  }

  return Array.from(permissions);
};

workspaceMemberSchema.methods.hasPermission = function (permission) {
  const permissions = this.getPermissions();
  return permissions.includes(permission);
};

workspaceMemberSchema.methods.hasAnyPermission = function (permissionList) {
  const permissions = this.getPermissions();
  return permissionList.some((p) => permissions.includes(p));
};

workspaceMemberSchema.methods.hasAllPermissions = function (permissionList) {
  const permissions = this.getPermissions();
  return permissionList.every((p) => permissions.includes(p));
};

workspaceMemberSchema.methods.grantPermission = async function (permission) {
  if (!this.customPermissions) {
    this.customPermissions = { grant: [], revoke: [] };
  }
  
  // Remove de revoke se estiver lá
  this.customPermissions.revoke = this.customPermissions.revoke.filter(
    (p) => p !== permission
  );
  
  // Adiciona em grant se não estiver
  if (!this.customPermissions.grant.includes(permission)) {
    this.customPermissions.grant.push(permission);
  }

  return this.save();
};

workspaceMemberSchema.methods.revokePermission = async function (permission) {
  if (!this.customPermissions) {
    this.customPermissions = { grant: [], revoke: [] };
  }
  
  // Remove de grant se estiver lá
  this.customPermissions.grant = this.customPermissions.grant.filter(
    (p) => p !== permission
  );
  
  // Adiciona em revoke se não estiver
  if (!this.customPermissions.revoke.includes(permission)) {
    this.customPermissions.revoke.push(permission);
  }

  return this.save();
};

workspaceMemberSchema.methods.updateActivity = async function () {
  this.lastActiveAt = new Date();
  return this.save();
};

workspaceMemberSchema.methods.toPublicJSON = function () {
  const obj = {
    id: this._id,
    workspaceId: this.workspaceId,
    userId: this.userId,
    role: this.role,
    status: this.status,
    permissions: this.getPermissions(),
    settings: this.settings,
    lastActiveAt: this.lastActiveAt,
    joinedAt: this.joinedAt,
    createdAt: this.createdAt,
  };

  if (this.user) {
    obj.user = this.user.toPublicJSON ? this.user.toPublicJSON() : this.user;
  }

  return obj;
};

// Statics
workspaceMemberSchema.statics.findByWorkspaceAndUser = function (workspaceId, userId) {
  return this.findOne({ workspaceId, userId });
};

workspaceMemberSchema.statics.getWorkspaceMembers = function (workspaceId, options = {}) {
  const query = { workspaceId };
  
  if (options.status) {
    query.status = options.status;
  }

  if (options.role) {
    query.role = options.role;
  }

  return this.find(query)
    .populate('userId', 'name email avatar')
    .sort({ role: 1, joinedAt: 1 });
};

workspaceMemberSchema.statics.getUserWorkspaces = function (userId) {
  return this.find({ userId, status: MEMBER_STATUS.ACTIVE })
    .populate('workspaceId')
    .sort({ lastActiveAt: -1 });
};

const WorkspaceMember = mongoose.model('WorkspaceMember', workspaceMemberSchema);

module.exports = WorkspaceMember;