/**
 * @fileoverview Handlers padronizados de resposta
 * @module shared/http/responseHandler
 */

/**
 * Envia resposta de sucesso padronizada
 * @param {import('express').Response} res - Response
 * @param {*} data - Dados da resposta
 * @param {number} [statusCode=200] - Código HTTP
 * @param {Object} [meta={}] - Metadados adicionais
 */
function success(res, data, statusCode = 200, meta = {}) {
  const response = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };

  if (Object.keys(meta).length > 0) {
    response.meta = meta;
  }

  res.status(statusCode).json(response);
}

/**
 * Envia resposta de criação (201)
 * @param {import('express').Response} res - Response
 * @param {*} data - Dados criados
 * @param {string} [location] - URL do recurso criado
 */
function created(res, data, location = null) {
  if (location) {
    res.setHeader('Location', location);
  }
  success(res, data, 201);
}

/**
 * Envia resposta sem conteúdo (204)
 * @param {import('express').Response} res - Response
 */
function noContent(res) {
  res.status(204).send();
}

/**
 * Envia resposta paginada
 * @param {import('express').Response} res - Response
 * @param {Array} items - Itens da página atual
 * @param {Object} pagination - Informações de paginação
 * @param {number} pagination.page - Página atual
 * @param {number} pagination.limit - Itens por página
 * @param {number} pagination.total - Total de itens
 */
function paginated(res, items, pagination) {
  const { page, limit, total } = pagination;
  const totalPages = Math.ceil(total / limit);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  success(res, items, 200, {
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext,
      hasPrev,
    },
  });
}

/**
 * Envia arquivo para download
 * @param {import('express').Response} res - Response
 * @param {Buffer|string} content - Conteúdo do arquivo
 * @param {string} filename - Nome do arquivo
 * @param {string} [contentType='application/octet-stream'] - Tipo do conteúdo
 */
function download(res, content, filename, contentType = 'application/octet-stream') {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(content);
}

/**
 * Envia CSV para download
 * @param {import('express').Response} res - Response
 * @param {string} csvContent - Conteúdo CSV
 * @param {string} filename - Nome do arquivo
 */
function csv(res, csvContent, filename) {
  download(res, csvContent, filename, 'text/csv; charset=utf-8');
}

/**
 * Middleware que adiciona helpers de resposta ao res
 * @param {import('express').Request} req - Request
 * @param {import('express').Response} res - Response
 * @param {import('express').NextFunction} next - Next
 */
function responseHelpers(req, res, next) {
  res.success = (data, statusCode, meta) => success(res, data, statusCode, meta);
  res.created = (data, location) => created(res, data, location);
  res.noContent = () => noContent(res);
  res.paginated = (items, pagination) => paginated(res, items, pagination);
  res.download = (content, filename, contentType) => download(res, content, filename, contentType);
  res.csv = (csvContent, filename) => csv(res, csvContent, filename);
  next();
}

module.exports = {
  success,
  created,
  noContent,
  paginated,
  download,
  csv,
  responseHelpers,
};