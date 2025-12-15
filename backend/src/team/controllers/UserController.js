/**
 * @fileoverview Controller de User
 * @module team/controllers/UserController
 */

const userService = require('../services/UserService');
const { success, noContent } = require('../../shared/utils/response');

class UserController {
  /**
   * Obtém perfil do usuário
   * GET /api/users/profile
   */
  async getProfile(req, res) {
    return success(res, { user: req.user.toPublicJSON() });
  }

  /**
   * Atualiza perfil do usuário
   * PUT /api/users/profile
   */
  async updateProfile(req, res) {
    const user = await userService.updateProfile(req.user._id, req.body);
    return success(res, { user: user.toPublicJSON() }, 'Perfil atualizado com sucesso');
  }

  /**
   * Obtém workspaces do usuário
   * GET /api/users/workspaces
   */
  async getWorkspaces(req, res) {
    const workspaces = await userService.getUserWorkspaces(req.user._id);
    return success(res, { workspaces });
  }

  /**
   * Atualiza avatar
   * PUT /api/users/avatar
   */
  async updateAvatar(req, res) {
    const { avatarUrl } = req.body;
    const user = await userService.updateAvatar(req.user._id, avatarUrl);
    return success(res, { user: user.toPublicJSON() }, 'Avatar atualizado');
  }

  /**
   * Remove avatar
   * DELETE /api/users/avatar
   */
  async removeAvatar(req, res) {
    const user = await userService.removeAvatar(req.user._id);
    return success(res, { user: user.toPublicJSON() }, 'Avatar removido');
  }

  /**
   * Desativa conta
   * POST /api/users/deactivate
   */
  async deactivateAccount(req, res) {
    const { password } = req.body;
    await userService.deactivateAccount(req.user._id, password);
    return success(res, null, 'Conta desativada com sucesso');
  }
}

module.exports = new UserController();