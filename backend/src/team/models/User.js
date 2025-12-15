/**
 * @fileoverview Model de User
 * @module team/models/User
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    phone: {
      type: String,
      trim: true,
    },
    avatar: {
      type: String,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      select: false,
    },
    emailVerificationExpires: {
      type: Date,
      select: false,
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    timezone: {
      type: String,
      default: 'America/Sao_Paulo',
    },
    language: {
      type: String,
      enum: ['pt-BR', 'en-US', 'es-ES'],
      default: 'pt-BR',
    },
    preferences: {
      theme: {
        type: String,
        enum: ['light', 'dark', 'system'],
        default: 'system',
      },
      notifications: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
        desktop: { type: Boolean, default: true },
        sounds: { type: Boolean, default: true },
      },
      display: {
        compactMode: { type: Boolean, default: false },
        showAvatars: { type: Boolean, default: true },
      },
    },
    // Segurança
    lastLoginAt: {
      type: Date,
    },
    lastLoginIp: {
      type: String,
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
    },
    refreshTokens: [{
      token: { type: String, select: false },
      device: String,
      createdAt: { type: Date, default: Date.now },
      expiresAt: Date,
    }],
    // Status
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isSuperAdmin: {
      type: Boolean,
      default: false,
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

// Virtual para workspaces
userSchema.virtual('workspaces', {
  ref: 'WorkspaceMember',
  localField: '_id',
  foreignField: 'userId',
});

// Middleware pre-save para hash de senha
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Método para comparar senha
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Método para verificar se está bloqueado
userSchema.methods.isLocked = function () {
  return this.lockUntil && this.lockUntil > Date.now();
};

// Método para incrementar tentativas de login
userSchema.methods.incrementLoginAttempts = async function () {
  // Se já passou o tempo de bloqueio, reseta
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 },
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };
  
  // Bloqueia após 5 tentativas
  if (this.loginAttempts + 1 >= 5) {
    updates.$set = { lockUntil: Date.now() + 15 * 60 * 1000 }; // 15 minutos
  }

  return this.updateOne(updates);
};

// Método para resetar tentativas de login
userSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $set: { loginAttempts: 0 },
    $unset: { lockUntil: 1 },
  });
};

// Método para gerar token de verificação de email
userSchema.methods.generateEmailVerificationToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto.createHash('sha256').update(token).digest('hex');
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 horas
  return token;
};

// Método para gerar token de reset de senha
userSchema.methods.generatePasswordResetToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');
  this.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hora
  return token;
};

// Método para verificar token de email
userSchema.methods.verifyEmailToken = function (token) {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  return (
    this.emailVerificationToken === hashedToken &&
    this.emailVerificationExpires > Date.now()
  );
};

// Método para verificar token de reset
userSchema.methods.verifyPasswordResetToken = function (token) {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  return (
    this.passwordResetToken === hashedToken &&
    this.passwordResetExpires > Date.now()
  );
};

// Método para soft delete
userSchema.methods.softDelete = async function () {
  this.deletedAt = new Date();
  this.isActive = false;
  this.email = `deleted_${Date.now()}_${this.email}`;
  return this.save();
};

// Método para JSON público
userSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    phone: this.phone,
    avatar: this.avatar,
    isEmailVerified: this.isEmailVerified,
    timezone: this.timezone,
    language: this.language,
    preferences: this.preferences,
    lastLoginAt: this.lastLoginAt,
    isActive: this.isActive,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

// Soft delete filter
userSchema.pre(/^^find/, function (next) {
  if (!this.getOptions().includeDeleted) {
    this.where({ deletedAt: null });
  }
  next();
});

// Statics
userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase() });
};

const User = mongoose.model('User', userSchema);

module.exports = User;