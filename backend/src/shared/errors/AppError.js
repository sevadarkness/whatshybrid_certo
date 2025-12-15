/**
 * @fileoverview Classe de erro customizada para a aplicação
 * @module shared/errors/AppError
 */

const { getErrorDetails, ERROR_CODES } = require('./errorCodes');

/**
 * Classe de erro customizada que estende Error nativo
 * @extends Error
 */
class AppError extends Error {
  /**
   * Cria uma instância de AppError
   * @param {string} message - Mensagem de erro
   * @param {number} [statusCode=500] - Código HTTP
   * @param {string} [errorCode='INTERNAL_ERROR'] - Código de erro interno
   * @param {Object} [details=null] - Detalhes adicionais do erro
   * @param {boolean} [isOperational=true] - Se é um erro operacional (esperado)
   */
  constructor(
    message,
    statusCode = 500,
    errorCode = 'INTERNAL_ERROR',
    details = null,
    isOperational = true
  ) {
    super(message);

    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();

    // Captura o stack trace, excluindo o constructor
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Cria AppError a partir de código de erro predefinido
   * @param {string} errorKey - Chave do erro em ERROR_CODES
   * @param {string} [customMessage] - Mensagem customizada
   * @param {Object} [details] - Detalhes adicionais
   * @returns {AppError}
   */
  static fromCode(errorKey, customMessage = null, details = null) {
    const errorDef = getErrorDetails(errorKey);
    return new AppError(
      customMessage || errorDef.message,
      errorDef.status,
      errorDef.code,
      details
    );
  }

  /**
   * Cria erro de validação
   * @param {string} message - Mensagem de validação
   * @param {Object} [details] - Detalhes dos campos inválidos
   * @returns {AppError}
   */
  static validation(message, details = null) {
    return AppError.fromCode('VALIDATION_ERROR', message, details);
  }

  /**
   * Cria erro de não encontrado
   * @param {string} resource - Nome do recurso
   * @param {string} [identifier] - Identificador do recurso
   * @returns {AppError}
   */
  static notFound(resource, identifier = null) {
    const message = identifier
      ? `${resource} com ID "${identifier}" não encontrado`
      : `${resource} não encontrado`;
    return AppError.fromCode('NOT_FOUND', message, { resource, identifier });
  }

  /**
   * Cria erro de não autorizado
   * @param {string} [message] - Mensagem customizada
   * @returns {AppError}
   */
  static unauthorized(message = 'Não autorizado') {
    return AppError.fromCode('UNAUTHORIZED', message);
  }

  /**
   * Cria erro de acesso negado
   * @param {string} [message] - Mensagem customizada
   * @returns {AppError}
   */
  static forbidden(message = 'Acesso negado') {
    return AppError.fromCode('FORBIDDEN', message);
  }

  /**
   * Cria erro de conflito
   * @param {string} message - Mensagem de conflito
   * @param {Object} [details] - Detalhes do conflito
   * @returns {AppError}
   */
  static conflict(message, details = null) {
    return AppError.fromCode('CONFLICT', message, details);
  }

  /**
   * Cria erro de quota excedida
   * @param {string} [message] - Mensagem customizada
   * @param {Object} [details] - Detalhes da quota
   * @returns {AppError}
   */
  static quotaExceeded(message = 'Limite de quota excedido', details = null) {
    return AppError.fromCode('QUOTA_EXCEEDED', message, details);
  }

  /**
   * Cria erro de serviço externo
   * @param {string} service - Nome do serviço
   * @param {string} [originalError] - Erro original
   * @returns {AppError}
   */
  static externalService(service, originalError = null) {
    return AppError.fromCode(
      'EXTERNAL_SERVICE_ERROR',
      `Erro no serviço: ${service}`,
      { service, originalError }
    );
  }

  /**
   * Serializa o erro para resposta JSON
   * @param {boolean} [includeStack=false] - Incluir stack trace
   * @returns {Object}
   */
  toJSON(includeStack = false) {
    const json = {
      error: {
        code: this.errorCode,
        message: this.message,
        timestamp: this.timestamp,
      },
    };

    if (this.details) {
      json.error.details = this.details;
    }

    if (includeStack) {
      json.error.stack = this.stack;
    }

    return json;
  }
}

module.exports = AppError;