/**
 * @fileoverview Helpers padronizados de resposta HTTP (compatível com os controllers v2).
 *
 * Assinaturas esperadas pelos controllers:
 *   - success(res, data, message?)
 *   - created(res, data, message?)
 */

function buildPayload({ ok, data = null, message = null, meta = null, error = null }) {
  const payload = {
    success: ok,
    timestamp: new Date().toISOString(),
  };

  if (message) payload.message = message;
  if (meta && typeof meta === 'object' && Object.keys(meta).length) payload.meta = meta;

  if (ok) {
    payload.data = data;
  } else {
    payload.error = error || { message: 'Erro' };
  }

  return payload;
}

/**
 * 200 OK
 */
function success(res, data = null, message = null, meta = null, statusCode = 200) {
  return res.status(statusCode).json(buildPayload({ ok: true, data, message, meta }));
}

/**
 * 201 Created
 */
function created(res, data = null, message = null, meta = null) {
  return res.status(201).json(buildPayload({ ok: true, data, message, meta }));
}

/**
 * 204 No Content
 */
function noContent(res) {
  return res.status(204).send();
}

/**
 * Paginated response
 */
function paginated(res, items, { page, limit, total }, message = null) {
  const totalPages = Math.ceil((total || 0) / (limit || 1)) || 1;
  return success(
    res,
    items,
    message,
    {
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    },
    200
  );
}

module.exports = {
  success,
  created,
  noContent,
  paginated,
};
