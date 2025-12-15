/**
 * @fileoverview Controller de Workspace
 * @module team/controllers/WorkspaceController
 */

const workspaceService = require('../services/WorkspaceService');
const { success, created, noContent } = require('../../shared/utils/response');

class WorkspaceController {
  /**
   * Cria workspace
   * POST /api/workspaces
   */
  async create(req, res) {
    const workspace = await workspaceService.create(req.body, req.user._id);
    return created(res, { workspace: workspace.toPublicJSON() }, 'Workspace criado com sucesso');
  }

  /**
   * Obtém workspace atual
   * GET /api/workspaces/current
   */
  async getCurrent(req, res) {
    return success(res, { workspace: req.workspace.toPublicJSON() });
  }

  /**
   * Obtém workspace por ID
   * GET /api/workspaces/:id
   */
  async getById(req, res) {
    const workspace = await workspaceService.getById(req.params.id);
    return success(res, { workspace: workspace.toPublicJSON() });
  }

  /**
   * Atualiza workspace
   * PUT /api/workspaces/:id
   */
  async update(req, res) {
    const workspace = await workspaceService.update(
      req.params.id,
      req.body,
      req.user._id
    );
    return success(res, { workspace: workspace.toPublicJSON() }, 'Workspace atualizado');
  }

  /**
   * Deleta workspace
   * DELETE /api/workspaces/:id
   */
  async delete(req, res) {
    await workspaceService.delete(req.params.id, req.user._id);
    return noContent(res);
  }

  /**
   * Lista membros
   * GET /api/workspaces/:id/members
   */
  async getMembers(req, res) {
    const members = await workspaceService.getMembers(req.params.id);
    return success(res, { members: members.map((m) => m.toPublicJSON()) });
  }

  /**
   * Convida membro
   * POST /api/workspaces/:id/invites
   */
  async inviteMember(req, res) {
    const invite = await workspaceService.inviteMember(
      req.params.id,
      req.body,
      req.user._id
    );
    return created(res, { invite }, 'Convite enviado com sucesso');
  }

  /**
   * Aceita convite
   * POST /api/workspaces/invites/:token/accept
   */
  async acceptInvite(req, res) {
    const result = await workspaceService.acceptInvite(req.params.token, req.body);
    return success(res, {
      workspace: result.workspace.toPublicJSON(),
      member: result.member.toPublicJSON(),
      isNewUser: result.isNewUser,
    }, 'Convite aceito com sucesso');
  }

  /**
   * Obtém detalhes do convite
   * GET /api/workspaces/invites/:token
   */
  async getInviteDetails(req, res) {
    const WorkspaceInvite = require('../models/WorkspaceInvite');
    const invite = await WorkspaceInvite.findByToken(req.params.token);

    if (!invite || !invite.isValid()) {
      return success(res, { valid: false, message: 'Convite inválido ou expirado' });
    }

    return success(res, {
      valid: true,
      workspace: {
        name: invite.workspaceId.name,
        logo: invite.workspaceId.logo,
      },
      invitedBy: {
        name: invite.invitedBy.name,
      },
      role: invite.role,
      email: invite.email,
    });
  }

  /**
   * Lista convites pendentes
   * GET /api/workspaces/:id/invites
   */
  async getPendingInvites(req, res) {
    const invites = await workspaceService.getPendingInvites(req.params.id);
    return success(res, { invites });
  }

  /**
   * Cancela convite
   * DELETE /api/workspaces/:id/invites/:inviteId
   */
  async cancelInvite(req, res) {
    await workspaceService.cancelInvite(req.params.id, req.params.inviteId);
    return noContent(res);
  }

  /**
   * Reenvia convite
   * POST /api/workspaces/:id/invites/:inviteId/resend
   */
  async resendInvite(req, res) {
    await workspaceService.resendInvite(req.params.id, req.params.inviteId);
    return success(res, null, 'Convite reenviado');
  }

  /**
   * Atualiza membro
   * PUT /api/workspaces/:id/members/:memberId
   */
  async updateMember(req, res) {
    const member = await workspaceService.updateMember(
      req.params.id,
      req.params.memberId,
      req.body,
      req.user._id
    );
    return success(res, { member: member.toPublicJSON() }, 'Membro atualizado');
  }

  /**
   * Remove membro
   * DELETE /api/workspaces/:id/members/:memberId
   */
  async removeMember(req, res) {
    await workspaceService.removeMember(
      req.params.id,
      req.params.memberId,
      req.user._id
    );
    return noContent(res);
  }

  /**
   * Sai do workspace
   * POST /api/workspaces/:id/leave
   */
  async leave(req, res) {
    await workspaceService.leaveWorkspace(req.params.id, req.user._id);
    return success(res, null, 'Você saiu do workspace');
  }

  /**
   * Transfere propriedade
   * POST /api/workspaces/:id/transfer-ownership
   */
  async transferOwnership(req, res) {
    const { newOwnerId } = req.body;
    await workspaceService.transferOwnership(
      req.params.id,
      newOwnerId,
      req.user._id
    );
    return success(res, null, 'Propriedade transferida com sucesso');
  }
}

module.exports = new WorkspaceController();