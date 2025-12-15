/**
 * @fileoverview Middleware de autorização
 * @module team/middlewares/authorize
 */

const AppError = require('../../shared/errors/AppError');
const { WORKSPACE_ROLE } = require('../constants/teamConstants');

/**
 * Verifica se usuário tem permissão específica
 * @param {string} permission - Permissão requerida
 * @returns {Function} Middleware
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.member) {
      return next(AppError.forbidden('Acesso negado'));
    }

    if (!req.member.hasPermission(permission)) {
      return next(AppError.forbidden(`Permissão '${permission}' necessária`));
    }

    next();
  };
};

/**
 * Verifica se usuário tem qualquer uma das permissões
 * @param {string[]} permissions - Lista de permissões
 * @returns {Function} Middleware
 */
const requireAnyPermission = (permissions) => {
  return (req, res, next) => {
    if (!req.member) {
      return next(AppError.forbidden('Acesso negado'));
    }

    if (!req.member.hasAnyPermission(permissions)) {
      return next(AppError.forbidden('Permissão insuficiente'));
    }

    next();
  };
};

/**
 * Verifica se usuário tem todas as permissões
 * @param {string[]} permissions - Lista de permissões
 * @returns {Function} Middleware
 */
const requireAllPermissions = (permissions) => {
  return (req, res, next) => {
    if (!req.member) {
      return next(AppError.forbidden('Acesso negado'));
    }

    if (!req.member.hasAllPermissions(permissions)) {
      return next(AppError.forbidden('Permissões insuficientes'));
    }

    next();
  };
};

/**
 * Verifica se usuário tem role mínimo
 * @param {string} minRole - Role mínimo requerido
 * @returns {Function} Middleware
 */
const requireRole = (minRole) => {
  const roleHierarchy = [
    WORKSPACE_ROLE.VIEWER,
    WORKSPACE_ROLE.AGENT,
    WORKSPACE_ROLE.MANAGER,
    WORKSPACE_ROLE.ADMIN,
    WORKSPACE_ROLE.OWNER,
  ];

  return (req, res, next) => {
    if (!req.member) {
      return next(AppError.forbidden('Acesso negado'));
    }

    const userRoleIndex = roleHierarchy.indexOf(req.member.role);
    const requiredRoleIndex = roleHierarchy.indexOf(minRole);

    if (userRoleIndex < requiredRoleIndex) {
      return next(AppError.forbidden(`Role '${minRole}' ou superior necessário`));
    }

    next();
  };
};

/**
 * Verifica se é owner do workspace
 */
const requireOwner = (req, res, next) => {
  if (!req.member || req.member.role !== WORKSPACE_ROLE.OWNER) {
    return next(AppError.forbidden('Apenas o proprietário pode realizar esta ação'));
  }
  next();
};

/**
 * Verifica se é admin ou owner
 */
const requireAdmin = requireRole(WORKSPACE_ROLE.ADMIN);

/**
 * Verifica se é manager ou superior
 */
const requireManager = requireRole(WORKSPACE_ROLE.MANAGER);

module.exports = {
  authorize,
  requireRole,
  requireOwner,
  requireAdmin,
  requireManager,
};
