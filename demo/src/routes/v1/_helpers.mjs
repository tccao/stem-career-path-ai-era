// Wraps an async route handler so thrown domain errors map to clean JSON responses.
// Lifecycle errors carry .httpStatus (409 invalid transition, 404 not found, etc.).

export function route(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      const status = e.httpStatus || 500;
      if (status === 500) console.error('[route error]', e);
      res.status(status).json({
        error: e.code || 'internal_error',
        message: e.message,
      });
    }
  };
}

export function badRequest(message, code = 'invalid_input') {
  const e = new Error(message);
  e.httpStatus = 400;
  e.code = code;
  return e;
}
