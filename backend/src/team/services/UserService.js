/**
 * @fileoverview Service de User
 * @module team/services/UserService
 */

const User = require('../models/User');
const WorkspaceMember = require('../models/WorkspaceMember');
const AppError = require('../../shared/errors/AppError');
const logger = require('../../infra/logging/Logger');

class UserService {
  /**
   * Obtém usuário por ID
   * @param {string} id - ID do usuário
   * @returns {Promise<User>}
   */
  async getById(id) {
    const user = await User.findById(id);
    
    if (!user) {
      throw AppError.notFound('Usuário', id);
    }

    return user;
  }

  /**
   * Obtém usuário por email
   * @param {string} email - Email
   * @returns {Promise<User|null>}
   */
  async getByEmail(email) {
    return User.findByEmail(email);
  }

  /**
   * Atualiza perfil do usuário
   * @param {string} id - ID do usuário
   * @param {Object} data - Dados para atualizar
   * @returns {Promise<User>}
   */
  async updateProfile(id, data) {
    const user = await this.getById(id);

    const allowedFields = ['name', 'phone', 'avatar', 'timezone', 'language', 'preferences'];
    const updateData = {};

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }

    Object.assign(user, updateData);
    await user.save();

    logger.info({
      msg: 'Perfil atualizado',
      userId: id,
    });

    return user;
  }

  /**
   * Obtém workspaces do usuário
   * @param {string} userId - ID do usuário
   * @returns {Promise<Object[]>}
   */
  async getUserWorkspaces(userId) {
    const memberships = await WorkspaceMember.getUserWorkspaces(userId);

    return memberships.map((m) => ({
      workspace: m.workspaceId.toPublicJSON(),
      role: m.role,
      permissions: m.getPermissions(),
      joinedAt: m.joinedAt,
      lastActiveAt: m.lastActiveAt,
    }));
  }

  /**
   * Desativa conta do usuário
   * @param {string} userId - ID do usuário
   * @param {string} password - Senha para confirmação
   */
  async deactivateAccount(userId, password) {
    const user = await User.findById(userId).select('+password');
    
    if (!user) {
      throw AppError.notFound('Usuário', userId);
    }

    const isValid = await user.comparePassword(password);
    if (!isValid) {
      throw AppError.unauthorized('Senha incorreta');
    }

    // Verifica se é owner de algum workspace
    const ownedWorkspaces = await WorkspaceMember.find({
      userId,
      role: 'owner',
    }).populate('workspaceId', 'name');

    if (ownedWorkspaces.length > 0) {
      const names = ownedWorkspaces.map((m) => m.workspaceId.name).join(', ');
      throw AppError.badRequest(
        `Você é proprietário dos workspaces: ${names}. Transfira a propriedade antes de desativar sua conta.`
      );
    }

    await user.softDelete();

    // Remove de todos os workspaces
    await WorkspaceMember.deleteMany({ userId });

    logger.info({
      msg: 'Conta desativada',
      userId,
    });
  }

  /**
   * Atualiza foto de perfil
   * @param {string} userId - ID do usuário
   * @param {string} avatarUrl - URL do avatar
   * @returns {Promise<User>}
   */
  async updateAvatar(userId, avatarUrl) {
    const user = await this.getById(userId);
    user.avatar = avatarUrl;
    await user.save();
    return user;
  }

  /**
   * Remove foto de perfil
   * @param {string} userId - ID do usuário
   * @returns {Promise<User>}
   */
  async removeAvatar(userId) {
    const user = await this.getById(userId);
    user.avatar = null;
    await user.save();
    return user;
  }
}

module.exports = new UserService();