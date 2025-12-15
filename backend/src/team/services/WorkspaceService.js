/**
 * @fileoverview Service de Workspace
 * @module team/services/WorkspaceService
 */

const Workspace = require('../models/Workspace');
const WorkspaceMember = require('../models/WorkspaceMember');
const WorkspaceInvite = require('../models/WorkspaceInvite');
const User = require('../models/User');
const AppError = require('../../shared/errors/AppError');
const { WORKSPACE_ROLE, MEMBER_STATUS } = require('../constants/teamConstants');
const logger = require('../../infra/logging/Logger');
const emailService = require('../../shared/services/EmailService');
const pipelineService = require('../../crm/services/PipelineService');

class WorkspaceService {
  /**
   * Cria um novo workspace
   * @param {Object} data - Dados do workspace
   * @param {string} userId - ID do usuário criador
   * @returns {Promise<Workspace>}
   */
  async create(data, userId) {
    const workspace = new Workspace({
      ...data,
      ownerId: userId,
    });
    await workspace.save();

    // Cria membro owner
    await WorkspaceMember.create({
      workspaceId: workspace._id,
      userId,
      role: WORKSPACE_ROLE.OWNER,
    });

    // Atualiza contagem
    await workspace.incrementUsage('members');

    // Cria pipeline padrão
    await pipelineService.createDefaultPipeline(workspace._id, userId);

    logger.info({
      msg: 'Workspace criado',
      workspaceId: workspace._id,
      userId,
    });

    return workspace;
  }

  /**
   * Obtém workspace por ID
   * @param {string} id - ID do workspace
   * @returns {Promise<Workspace>}
   */
  async getById(id) {
    const workspace = await Workspace.findById(id);
    
    if (!workspace) {
      throw AppError.notFound('Workspace', id);
    }

    return workspace;
  }

  /**
   * Obtém workspace por slug
   * @param {string} slug - Slug do workspace
   * @returns {Promise<Workspace>}
   */
  async getBySlug(slug) {
    const workspace = await Workspace.findBySlug(slug);
    
    if (!workspace) {
      throw AppError.notFound('Workspace não encontrado');
    }

    return workspace;
  }

  /**
   * Atualiza workspace
   * @param {string} id - ID do workspace
   * @param {Object} data - Dados para atualizar
   * @param {string} userId - ID do usuário
   * @returns {Promise<Workspace>}
   */
  async update(id, data, userId) {
    const workspace = await this.getById(id);

    const allowedFields = ['name', 'description', 'logo', 'settings'];
    const updateData = {};

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        if (field === 'settings') {
          updateData.settings = { ...workspace.settings.toObject(), ...data.settings };
        } else {
          updateData[field] = data[field];
        }
      }
    }

    Object.assign(workspace, updateData);
    await workspace.save();

    logger.info({
      msg: 'Workspace atualizado',
      workspaceId: id,
      userId,
    });

    return workspace;
  }

  /**
   * Deleta workspace
   * @param {string} id - ID do workspace
   * @param {string} userId - ID do usuário
   */
  async delete(id, userId) {
    const workspace = await this.getById(id);

    // Verifica se é owner
    if (workspace.ownerId.toString() !== userId) {
      throw AppError.forbidden('Apenas o proprietário pode deletar o workspace');
    }

    await workspace.softDelete();

    // Remove todos os membros
    await WorkspaceMember.deleteMany({ workspaceId: id });

    // Cancela convites pendentes
    await WorkspaceInvite.updateMany(
      { workspaceId: id, status: 'pending' },
      { status: 'cancelled' }
    );

    logger.info({
      msg: 'Workspace deletado',
      workspaceId: id,
      userId,
    });
  }

  /**
   * Obtém membros do workspace
   * @param {string} workspaceId - ID do workspace
   * @param {Object} [options] - Opções
   * @returns {Promise<WorkspaceMember[]>}
   */
  async getMembers(workspaceId, options = {}) {
    return WorkspaceMember.getWorkspaceMembers(workspaceId, options);
  }

  /**
   * Convida membro para workspace
   * @param {string} workspaceId - ID do workspace
   * @param {Object} data - Dados do convite
   * @param {string} invitedBy - ID do usuário que convida
   * @returns {Promise<WorkspaceInvite>}
   */
  async inviteMember(workspaceId, data, invitedBy) {
    const workspace = await this.getById(workspaceId);
    const { email, role, message } = data;

    // Verifica limite de membros
    if (!workspace.isWithinLimits('members')) {
      throw AppError.paymentRequired('Limite de membros atingido. Faça upgrade do plano.');
    }

    // Verifica se já é membro
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      const existingMember = await WorkspaceMember.findByWorkspaceAndUser(
        workspaceId,
        existingUser._id
      );
      if (existingMember) {
        throw AppError.conflict('Este usuário já é membro do workspace');
      }
    }

    // Verifica se já existe convite pendente
    const existingInvite = await WorkspaceInvite.findPendingByEmail(workspaceId, email);
    if (existingInvite) {
      throw AppError.conflict('Já existe um convite pendente para este email');
    }

    // Cria convite
    const invite = await WorkspaceInvite.create({
      workspaceId,
      email,
      role,
      message,
      invitedBy,
    });

    // Envia email
    const inviter = await User.findById(invitedBy);
    await emailService.sendWorkspaceInvite({
      to: email,
      workspaceName: workspace.name,
      inviterName: inviter.name,
      role,
      message,
      token: invite.token,
    });

    logger.info({
      msg: 'Convite enviado',
      workspaceId,
      email,
      invitedBy,
    });

    return invite;
  }

  /**
   * Aceita convite
   * @param {string} token - Token do convite
   * @param {Object} userData - Dados do usuário (se for criar conta)
   * @returns {Promise<{workspace: Workspace, member: WorkspaceMember}>}
   */
  async acceptInvite(token, userData = {}) {
    const invite = await WorkspaceInvite.findByToken(token);

    if (!invite || !invite.isValid()) {
      throw AppError.badRequest('Convite inválido ou expirado');
    }

    const workspace = await this.getById(invite.workspaceId);

    // Busca ou cria usuário
    let user = await User.findByEmail(invite.email);
    let isNewUser = false;

    if (!user) {
      if (!userData.password) {
        throw AppError.badRequest('Senha é obrigatória para criar conta');
      }

      user = new User({
        name: userData.name || invite.email.split('@')[0],
        email: invite.email,
        password: userData.password,
        isEmailVerified: true, // Email verificado pelo convite
      });
      await user.save();
      isNewUser = true;
    }

    // Cria membro
    const member = await WorkspaceMember.create({
      workspaceId: workspace._id,
      userId: user._id,
      role: invite.role,
      invitedBy: invite.invitedBy,
      invitedAt: invite.createdAt,
    });

    // Atualiza convite
    await invite.accept(user._id);

    // Atualiza contagem
    await workspace.incrementUsage('members');

    logger.info({
      msg: 'Convite aceito',
      workspaceId: workspace._id,
      userId: user._id,
      isNewUser,
    });

    return { workspace, member, user, isNewUser };
  }

  /**
   * Cancela convite
   * @param {string} workspaceId - ID do workspace
   * @param {string} inviteId - ID do convite
   */
  async cancelInvite(workspaceId, inviteId) {
    const invite = await WorkspaceInvite.findOne({
      _id: inviteId,
      workspaceId,
      status: 'pending',
    });

    if (!invite) {
      throw AppError.notFound('Convite', inviteId);
    }

    await invite.cancel();

    logger.info({
      msg: 'Convite cancelado',
      workspaceId,
      inviteId,
    });
  }

  /**
   * Reenvia convite
   * @param {string} workspaceId - ID do workspace
   * @param {string} inviteId - ID do convite
   */
  async resendInvite(workspaceId, inviteId) {
    const invite = await WorkspaceInvite.findOne({
      _id: inviteId,
      workspaceId,
    }).populate('workspaceId invitedBy');

    if (!invite) {
      throw AppError.notFound('Convite', inviteId);
    }

    await invite.resend();

    await emailService.sendWorkspaceInvite({
      to: invite.email,
      workspaceName: invite.workspaceId.name,
      inviterName: invite.invitedBy.name,
      role: invite.role,
      token: invite.token,
    });

    logger.info({
      msg: 'Convite reenviado',
      workspaceId,
      inviteId,
    });
  }

  /**
   * Atualiza membro
   * @param {string} workspaceId - ID do workspace
   * @param {string} memberId - ID do membro
   * @param {Object} data - Dados para atualizar
   * @param {string} userId - ID do usuário que atualiza
   * @returns {Promise<WorkspaceMember>}
   */
  async updateMember(workspaceId, memberId, data, userId) {
    const member = await WorkspaceMember.findOne({
      _id: memberId,
      workspaceId,
    });

    if (!member) {
      throw AppError.notFound('Membro', memberId);
    }

    // Não permite alterar owner
    if (member.role === WORKSPACE_ROLE.OWNER) {
      throw AppError.forbidden('Não é possível alterar o proprietário');
    }

    // Não permite definir como owner
    if (data.role === WORKSPACE_ROLE.OWNER) {
      throw AppError.forbidden('Use transferOwnership para transferir propriedade');
    }

    if (data.role) member.role = data.role;
    if (data.status) member.status = data.status;

    await member.save();

    logger.info({
      msg: 'Membro atualizado',
      workspaceId,
      memberId,
      userId,
    });

    return member;
  }

  /**
   * Remove membro
   * @param {string} workspaceId - ID do workspace
   * @param {string} memberId - ID do membro
   * @param {string} userId - ID do usuário que remove
   */
  async removeMember(workspaceId, memberId, userId) {
    const member = await WorkspaceMember.findOne({
      _id: memberId,
      workspaceId,
    });

    if (!member) {
      throw AppError.notFound('Membro', memberId);
    }

    if (member.role === WORKSPACE_ROLE.OWNER) {
      throw AppError.forbidden('Não é possível remover o proprietário');
    }

    await member.deleteOne();

    // Atualiza contagem
    const workspace = await this.getById(workspaceId);
    await workspace.decrementUsage('members');

    logger.info({
      msg: 'Membro removido',
      workspaceId,
      memberId,
      userId,
    });
  }

  /**
   * Sai do workspace
   * @param {string} workspaceId - ID do workspace
   * @param {string} userId - ID do usuário
   */
  async leaveWorkspace(workspaceId, userId) {
    const member = await WorkspaceMember.findByWorkspaceAndUser(workspaceId, userId);

    if (!member) {
      throw AppError.notFound('Você não é membro deste workspace');
    }

    if (member.role === WORKSPACE_ROLE.OWNER) {
      throw AppError.forbidden('O proprietário não pode sair. Transfira a propriedade primeiro.');
    }

    await member.deleteOne();

    const workspace = await this.getById(workspaceId);
    await workspace.decrementUsage('members');

    logger.info({
      msg: 'Usuário saiu do workspace',
      workspaceId,
      userId,
    });
  }

  /**
   * Transfere propriedade
   * @param {string} workspaceId - ID do workspace
   * @param {string} newOwnerId - ID do novo proprietário
   * @param {string} currentOwnerId - ID do proprietário atual
   */
  async transferOwnership(workspaceId, newOwnerId, currentOwnerId) {
    const workspace = await this.getById(workspaceId);

    if (workspace.ownerId.toString() !== currentOwnerId) {
      throw AppError.forbidden('Apenas o proprietário pode transferir a propriedade');
    }

    const newOwnerMember = await WorkspaceMember.findByWorkspaceAndUser(
      workspaceId,
      newOwnerId
    );

    if (!newOwnerMember) {
      throw AppError.notFound('O novo proprietário deve ser membro do workspace');
    }

    // Atualiza roles
    await WorkspaceMember.updateOne(
      { workspaceId, userId: currentOwnerId },
      { role: WORKSPACE_ROLE.ADMIN }
    );

    await WorkspaceMember.updateOne(
      { workspaceId, userId: newOwnerId },
      { role: WORKSPACE_ROLE.OWNER }
    );

    // Atualiza workspace
    workspace.ownerId = newOwnerId;
    await workspace.save();

    logger.info({
      msg: 'Propriedade transferida',
      workspaceId,
      fromUserId: currentOwnerId,
      toUserId: newOwnerId,
    });
  }

  /**
   * Obtém convites pendentes
   * @param {string} workspaceId - ID do workspace
   * @returns {Promise<WorkspaceInvite[]>}
   */
  async getPendingInvites(workspaceId) {
    return WorkspaceInvite.getPendingInvites(workspaceId);
  }
}

module.exports = new WorkspaceService();
