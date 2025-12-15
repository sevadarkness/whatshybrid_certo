/**
 * @fileoverview Service de autenticação
 * @module team/services/AuthService
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Workspace = require('../models/Workspace');
const WorkspaceMember = require('../models/WorkspaceMember');
const AppError = require('../../shared/errors/AppError');
const { AUTH_CONFIG, WORKSPACE_ROLE } = require('../constants/teamConstants');
const config = require('../../config');
const logger = require('../../infra/logging/Logger');
const emailService = require('../../shared/services/EmailService');

class AuthService {
  /**
   * Registra novo usuário
   * @param {Object} data - Dados do usuário
   * @returns {Promise<{user: User, tokens: Object, workspace?: Workspace}>}
   */
  async register(data) {
    const { name, email, password, phone, workspaceName } = data;

    // Verifica se email já existe
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      throw AppError.conflict('Este email já está cadastrado');
    }

    // Cria usuário
    const user = new User({
      name,
      email,
      password,
      phone,
    });

    // Gera token de verificação
    const verificationToken = user.generateEmailVerificationToken();
    await user.save();

    // Cria workspace se fornecido nome
    let workspace = null;
    if (workspaceName) {
      workspace = await this.createWorkspaceForUser(user, workspaceName);
    }

    // Gera tokens
    const tokens = await this.generateTokens(user);

    // Envia email de verificação
    await this.sendVerificationEmail(user, verificationToken);

    logger.info({
      msg: 'Usuário registrado',
      userId: user._id,
      email: user.email,
    });

    return { user, tokens, workspace };
  }

  /**
   * Login de usuário
   * @param {string} email - Email
   * @param {string} password - Senha
   * @param {Object} options - Opções (rememberMe, ip, device)
   * @returns {Promise<{user: User, tokens: Object}>}
   */
  async login(email, password, options = {}) {
    // Busca usuário com senha
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    
    if (!user) {
      throw AppError.unauthorized('Credenciais inválidas');
    }

    if (!user.isActive) {
      throw AppError.forbidden('Conta desativada');
    }

    // Verifica bloqueio
    if (user.isLocked()) {
      throw AppError.tooManyRequests('Conta bloqueada temporariamente. Tente novamente em 15 minutos.');
    }

    // Verifica senha
    const isValid = await user.comparePassword(password);
    if (!isValid) {
      await user.incrementLoginAttempts();
      throw AppError.unauthorized('Credenciais inválidas');
    }

    // Reseta tentativas e atualiza último login
    await user.resetLoginAttempts();
    user.lastLoginAt = new Date();
    user.lastLoginIp = options.ip;
    await user.save();

    // Gera tokens
    const tokens = await this.generateTokens(user, {
      rememberMe: options.rememberMe,
      device: options.device,
    });

    logger.info({
      msg: 'Login realizado',
      userId: user._id,
      ip: options.ip,
    });

    return { user, tokens };
  }

  /**
   * Refresh de token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>}
   */
  async refreshTokens(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
      
      const user = await User.findById(decoded.userId).select('+refreshTokens');
      if (!user || !user.isActive) {
        throw AppError.unauthorized('Token inválido');
      }

      // Verifica se token existe na lista
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const tokenEntry = user.refreshTokens?.find(
        (t) => t.token === tokenHash && t.expiresAt > new Date()
      );

      if (!tokenEntry) {
        throw AppError.unauthorized('Token inválido ou expirado');
      }

      // Remove token antigo e gera novos
      user.refreshTokens = user.refreshTokens.filter((t) => t.token !== tokenHash);
      await user.save();

      const tokens = await this.generateTokens(user);

      return tokens;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw AppError.unauthorized('Token inválido');
    }
  }

  /**
   * Logout
   * @param {string} userId - ID do usuário
   * @param {string} refreshToken - Refresh token (opcional, se não fornecido remove todos)
   */
  async logout(userId, refreshToken = null) {
    const user = await User.findById(userId).select('+refreshTokens');
    if (!user) return;

    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      user.refreshTokens = user.refreshTokens?.filter((t) => t.token !== tokenHash) || [];
    } else {
      // Remove todos os tokens
      user.refreshTokens = [];
    }

    await user.save();

    logger.info({
      msg: 'Logout realizado',
      userId,
      allSessions: !refreshToken,
    });
  }

  /**
   * Esqueci senha
   * @param {string} email - Email
   */
  async forgotPassword(email) {
    const user = await User.findByEmail(email);
    
    // Não revela se o email existe ou não
    if (!user) {
      logger.warn({ msg: 'Forgot password para email inexistente', email });
      return;
    }

    const resetToken = user.generatePasswordResetToken();
    await user.save();

    await emailService.sendPasswordReset(user.email, user.name, resetToken);

    logger.info({
      msg: 'Email de reset de senha enviado',
      userId: user._id,
    });
  }

  /**
   * Reset de senha
   * @param {string} token - Token de reset
   * @param {string} newPassword - Nova senha
   */
  async resetPassword(token, newPassword) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      throw AppError.badRequest('Token inválido ou expirado');
    }

    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.refreshTokens = []; // Invalida todas as sessões
    await user.save();

    await emailService.sendPasswordChanged(user.email, user.name);

    logger.info({
      msg: 'Senha resetada',
      userId: user._id,
    });
  }

  /**
   * Verifica email
   * @param {string} token - Token de verificação
   */
  async verifyEmail(token) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
      throw AppError.badRequest('Token inválido ou expirado');
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    logger.info({
      msg: 'Email verificado',
      userId: user._id,
    });

    return user;
  }

  /**
   * Reenvia email de verificação
   * @param {string} userId - ID do usuário
   */
  async resendVerificationEmail(userId) {
    const user = await User.findById(userId);
    
    if (!user) {
      throw AppError.notFound('Usuário', userId);
    }

    if (user.isEmailVerified) {
      throw AppError.badRequest('Email já verificado');
    }

    const verificationToken = user.generateEmailVerificationToken();
    await user.save();

    await this.sendVerificationEmail(user, verificationToken);
  }

  /**
   * Altera senha
   * @param {string} userId - ID do usuário
   * @param {string} currentPassword - Senha atual
   * @param {string} newPassword - Nova senha
   */
  async changePassword(userId, currentPassword, newPassword) {
    const user = await User.findById(userId).select('+password');
    
    if (!user) {
      throw AppError.notFound('Usuário', userId);
    }

    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) {
      throw AppError.unauthorized('Senha atual incorreta');
    }

    user.password = newPassword;
    user.refreshTokens = []; // Invalida todas as sessões
    await user.save();

    await emailService.sendPasswordChanged(user.email, user.name);

    logger.info({
      msg: 'Senha alterada',
      userId,
    });
  }

  /**
   * Gera tokens de acesso e refresh
   * @param {User} user - Usuário
   * @param {Object} options - Opções
   * @returns {Promise<Object>}
   */
  async generateTokens(user, options = {}) {
    const { rememberMe = false, device = 'unknown' } = options;

    const accessToken = jwt.sign(
      { userId: user._id, email: user.email },
      config.jwt.secret,
      { expiresIn: AUTH_CONFIG.ACCESS_TOKEN_EXPIRY }
    );

    const refreshExpiry = rememberMe ? '30d' : AUTH_CONFIG.REFRESH_TOKEN_EXPIRY;
    const refreshToken = jwt.sign(
      { userId: user._id, type: 'refresh' },
      config.jwt.refreshSecret,
      { expiresIn: refreshExpiry }
    );

    // Salva refresh token hasheado
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + (rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000);

    if (!user.refreshTokens) user.refreshTokens = [];
    user.refreshTokens.push({
      token: tokenHash,
      device,
      expiresAt,
    });

    // Limita a 10 sessões
    if (user.refreshTokens.length > 10) {
      user.refreshTokens = user.refreshTokens.slice(-10);
    }

    await user.save();

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutos em segundos
    };
  }

  /**
   * Cria workspace para usuário
   * @param {User} user - Usuário
   * @param {string} workspaceName - Nome do workspace
   * @returns {Promise<Workspace>}
   */
  async createWorkspaceForUser(user, workspaceName) {
    const workspace = new Workspace({
      name: workspaceName,
      ownerId: user._id,
    });
    await workspace.save();

    // Cria membro owner
    await WorkspaceMember.create({
      workspaceId: workspace._id,
      userId: user._id,
      role: WORKSPACE_ROLE.OWNER,
    });

    // Atualiza contagem
    await workspace.incrementUsage('members');

    return workspace;
  }

  /**
   * Envia email de verificação
   * @param {User} user - Usuário
   * @param {string} token - Token
   */
  async sendVerificationEmail(user, token) {
    await emailService.sendEmailVerification(user.email, user.name, token);
  }

  /**
   * Valida token de acesso
   * @param {string} token - Token
   * @returns {Promise<User>}
   */
  async validateAccessToken(token) {
    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      const user = await User.findById(decoded.userId);
      
      if (!user || !user.isActive) {
        throw AppError.unauthorized('Token inválido');
      }

      return user;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw AppError.unauthorized('Token expirado');
      }
      throw AppError.unauthorized('Token inválido');
    }
  }
}

module.exports = new AuthService();