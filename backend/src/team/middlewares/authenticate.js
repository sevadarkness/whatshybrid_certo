/**
 * @fileoverview Middleware de autenticação
 * @module team/middlewares/authenticate
 */

const authService = require('../services/AuthService');
const WorkspaceMember = require('../models/WorkspaceMember');
const Workspace = require('../models/Workspace');
const AppError = require('../../shared/errors/AppError');

/**
 * Middleware de autenticação obrigatória
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw AppError.unauthorized('Token não fornecido');
    }

    const token = authHeader.split(' ')[1];
    const user = await authService.validateAccessToken(token);

    req.user = user;

    // Se há workspace no header, carrega
    const workspaceId = req.headers['x-workspace-id'];
    if (workspaceId) {
      const member = await WorkspaceMember.findByWorkspaceAndUser(workspaceId, user._id);
      
      if (!member || member.status !== 'active') {
        throw AppError.forbidden('Você não tem acesso a este workspace');
      }

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace || !workspace.isActive) {
        throw AppError.notFound('Workspace não encontrado ou inativo');
      }

      req.workspace = workspace;
      req.member = member;
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware de autenticação opcional
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      req.user = await authService.validateAccessToken(token);
    }

    next();
  } catch (error) {
    // Ignora erros de autenticação
    next();
  }
};

/**
 * Middleware que requer workspace
 */
const requireWorkspace = (req, res, next) => {
  if (!req.workspace) {
    return next(AppError.badRequest('Workspace não especificado. Envie o header X-Workspace-Id.'));
  }
  next();
};

module.exports = {
  authenticate,
  optionalAuth,
  requireWorkspace,
};