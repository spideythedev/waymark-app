const startedAt = Date.now();

function sendJson(res, status, payload) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  return res.json(payload);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");

      return sendJson(res, 405, {
        ok: false,
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: "This request method is not supported."
        }
      });
    }

    return sendJson(res, 200, {
      ok: true,
      service: "WAYMARK API",
      status: "operational",
      timestamp: new Date().toISOString(),
      uptimeMs: Date.now() - startedAt
    });
  } catch {
    return sendJson(res, 500, {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "WAYMARK is temporarily unavailable. Please try again."
      }
    });
  }
}