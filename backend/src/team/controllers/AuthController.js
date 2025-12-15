/**
 * @fileoverview Controller de autenticação
 * @module team/controllers/AuthController
 */

const authService = require('../services/AuthService');
const { success, created } = require('../../shared/utils/response');

class AuthController {
  /**
   * Registro de usuário
   * POST /api/auth/register
   */
  async register(req, res) {
    const result = await authService.register(req.body);

    return created(res, {
      user: result.user.toPublicJSON(),
      workspace: result.workspace?.toPublicJSON(),
      tokens: result.tokens,
    }, 'Conta criada com sucesso');
  }

  /**
   * Login
   * POST /api/auth/login
   */
  async login(req, res) {
    const { email, password, rememberMe } = req.body;

    const result = await authService.login(email, password, {
      rememberMe,
      ip: req.ip,
      device: req.headers['user-agent'],
    });

    return success(res, {
      user: result.user.toPublicJSON(),
      tokens: result.tokens,
    }, 'Login realizado com sucesso');
  }

  /**
   * Refresh token
   * POST /api/auth/refresh
   */
  async refresh(req, res) {
    const { refreshToken } = req.body;
    const tokens = await authService.refreshTokens(refreshToken);
    return success(res, { tokens });
  }

  /**
   * Logout
   * POST /api/auth/logout
   */
  async logout(req, res) {
    const { refreshToken } = req.body;
    await authService.logout(req.user._id, refreshToken);
    return success(res, null, 'Logout realizado com sucesso');
  }

  /**
   * Logout de todas as sessões
   * POST /api/auth/logout-all
   */
  async logoutAll(req, res) {
    await authService.logout(req.user._id);
    return success(res, null, 'Todas as sessões encerradas');
  }

  /**
   * Esqueci senha
   * POST /api/auth/forgot-password
   */
  async forgotPassword(req, res) {
    await authService.forgotPassword(req.body.email);
    return success(res, null, 'Se o email existir, você receberá instruções para redefinir a senha');
  }

  /**
   * Reset de senha
   * POST /api/auth/reset-password
   */
  async resetPassword(req, res) {
    const { token, password } = req.body;
    await authService.resetPassword(token, password);
    return success(res, null, 'Senha redefinida com sucesso');
  }

  /**
   * Verificar email
   * POST /api/auth/verify-email
   */
  async verifyEmail(req, res) {
    const user = await authService.verifyEmail(req.body.token);
    return success(res, { user: user.toPublicJSON() }, 'Email verificado com sucesso');
  }

  /**
   * Reenviar verificação de email
   * POST /api/auth/resend-verification
   */
  async resendVerification(req, res) {
    await authService.resendVerificationEmail(req.user._id);
    return success(res, null, 'Email de verificação reenviado');
  }

  /**
   * Alterar senha
   * POST /api/auth/change-password
   */
  async changePassword(req, res) {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user._id, currentPassword, newPassword);
    return success(res, null, 'Senha alterada com sucesso');
  }

  /**
   * Obtém usuário atual
   * GET /api/auth/me
   */
  async me(req, res) {
    return success(res, { user: req.user.toPublicJSON() });
  }
}

module.exports = new AuthController();