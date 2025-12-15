/**
 * @fileoverview Códigos de erro padronizados para toda a aplicação
 * @module shared/errors/errorCodes
 */

const ERROR_CODES = Object.freeze({
  // Erros genéricos (1xxx)
  INTERNAL_ERROR: { code: 'E1000', status: 500, message: 'Erro interno do servidor' },
  SERVICE_UNAVAILABLE: { code: 'E1001', status: 503, message: 'Serviço temporariamente indisponível' },
  MAINTENANCE_MODE: { code: 'E1002', status: 503, message: 'Sistema em manutenção' },

  // Erros de validação (2xxx)
  VALIDATION_ERROR: { code: 'E2000', status: 400, message: 'Erro de validação' },
  INVALID_INPUT: { code: 'E2001', status: 400, message: 'Entrada inválida' },
  MISSING_FIELD: { code: 'E2002', status: 400, message: 'Campo obrigatório ausente' },
  INVALID_FORMAT: { code: 'E2003', status: 400, message: 'Formato inválido' },
  INVALID_ID: { code: 'E2004', status: 400, message: 'ID inválido' },

  // Erros de autenticação (3xxx)
  UNAUTHORIZED: { code: 'E3000', status: 401, message: 'Não autorizado' },
  INVALID_TOKEN: { code: 'E3001', status: 401, message: 'Token inválido' },
  EXPIRED_TOKEN: { code: 'E3002', status: 401, message: 'Token expirado' },
  INVALID_CREDENTIALS: { code: 'E3003', status: 401, message: 'Credenciais inválidas' },
  SESSION_EXPIRED: { code: 'E3004', status: 401, message: 'Sessão expirada' },

  // Erros de autorização (4xxx)
  FORBIDDEN: { code: 'E4000', status: 403, message: 'Acesso negado' },
  INSUFFICIENT_PERMISSIONS: { code: 'E4001', status: 403, message: 'Permissões insuficientes' },
  WORKSPACE_ACCESS_DENIED: { code: 'E4002', status: 403, message: 'Acesso ao workspace negado' },

  // Erros de recurso (5xxx)
  NOT_FOUND: { code: 'E5000', status: 404, message: 'Recurso não encontrado' },
  CONTACT_NOT_FOUND: { code: 'E5001', status: 404, message: 'Contato não encontrado' },
  DEAL_NOT_FOUND: { code: 'E5002', status: 404, message: 'Negócio não encontrado' },
  PIPELINE_NOT_FOUND: { code: 'E5003', status: 404, message: 'Pipeline não encontrado' },
  USER_NOT_FOUND: { code: 'E5004', status: 404, message: 'Usuário não encontrado' },
  STAGE_NOT_FOUND: { code: 'E5005', status: 404, message: 'Estágio não encontrado' },

  // Erros de conflito (6xxx)
  CONFLICT: { code: 'E6000', status: 409, message: 'Conflito de dados' },
  DUPLICATE_EMAIL: { code: 'E6001', status: 409, message: 'Email já cadastrado' },
  DUPLICATE_PHONE: { code: 'E6002', status: 409, message: 'Telefone já cadastrado' },
  RESOURCE_EXISTS: { code: 'E6003', status: 409, message: 'Recurso já existe' },

  // Erros de quota/billing (7xxx)
  QUOTA_EXCEEDED: { code: 'E7000', status: 402, message: 'Limite de quota excedido' },
  SUBSCRIPTION_INACTIVE: { code: 'E7001', status: 402, message: 'Assinatura inativa' },
  INSUFFICIENT_CREDITS: { code: 'E7002', status: 402, message: 'Créditos insuficientes' },
  PLAN_LIMIT_REACHED: { code: 'E7003', status: 402, message: 'Limite do plano atingido' },
  PAYMENT_REQUIRED: { code: 'E7004', status: 402, message: 'Pagamento necessário' },

  // Erros de rate limit (8xxx)
  RATE_LIMIT_EXCEEDED: { code: 'E8000', status: 429, message: 'Muitas requisições' },
  SLOW_DOWN: { code: 'E8001', status: 429, message: 'Diminua a velocidade das requisições' },

  // Erros externos (9xxx)
  EXTERNAL_SERVICE_ERROR: { code: 'E9000', status: 502, message: 'Erro em serviço externo' },
  LLM_ERROR: { code: 'E9001', status: 502, message: 'Erro no serviço de IA' },
  PAYMENT_GATEWAY_ERROR: { code: 'E9002', status: 502, message: 'Erro no gateway de pagamento' },
  WHATSAPP_ERROR: { code: 'E9003', status: 502, message: 'Erro na API do WhatsApp' },

  // Erros de flow (10xxx)
  FLOW_ERROR: { code: 'E10000', status: 400, message: 'Erro na execução do flow' },
  FLOW_CONTEXT_ERROR: { code: 'E10001', status: 400, message: 'Contexto do flow inválido' },
  FLOW_CONFIG_ERROR: { code: 'E10002', status: 400, message: 'Configuração do step inválida' },
  FLOW_HANDLER_NOT_FOUND: { code: 'E10003', status: 400, message: 'Handler não encontrado' },
});

/**
 * Obtém detalhes de um código de erro
 * @param {string} errorKey - Chave do erro
 * @returns {Object} Detalhes do erro
 */
function getErrorDetails(errorKey) {
  return ERROR_CODES[errorKey] || ERROR_CODES.INTERNAL_ERROR;
}

module.exports = { ERROR_CODES, getErrorDetails };