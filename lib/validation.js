export function sendJson(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.end(JSON.stringify(body));
}

export function requireMethod(req, res, method) {
  if (req.method === method) return true;

  res.setHeader("Allow", method);
  sendJson(res, 405, {
    error: "method_not_allowed",
    message: `Use ${method} for this endpoint.`
  });

  return false;
}

export function readBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  return null;
}

export function cleanText(value, maxLength = 3000) {
  if (typeof value !== "string") return "";

  return value
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);
}

export function cleanStringArray(value, maxItems = 20) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(item => typeof item === "string")
    .map(item => cleanText(item, 120))
    .filter(Boolean)
    .slice(0, maxItems);
}