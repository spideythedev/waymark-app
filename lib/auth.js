import crypto from "node:crypto";

const CERT_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let cachedCertificates = null;
let certificatesExpireAt = 0;

async function getCertificates() {
  if (cachedCertificates && Date.now() < certificatesExpireAt) {
    return cachedCertificates;
  }

  const response = await fetch(CERT_URL, {
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) {
    throw new Error("firebase_certificate_service_unavailable");
  }

  const certificates = await response.json();
  const cacheControl = response.headers.get("cache-control") || "";
  const match = cacheControl.match(/max-age=(\d+)/i);
  const maxAge = match ? Number(match[1]) : 300;

  cachedCertificates = certificates;
  certificatesExpireAt = Date.now() + Math.max(60, maxAge) * 1000;

  return certificates;
}

function decodePart(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

export async function verifyFirebaseToken(token, projectId) {
  if (!token || typeof token !== "string" || token.length > 12000) {
    throw new Error("invalid_token");
  }

  const parts = token.split(".");

  if (parts.length !== 3) {
    throw new Error("invalid_token");
  }

  let header;
  let payload;

  try {
    header = decodePart(parts[0]);
    payload = decodePart(parts[1]);
  } catch {
    throw new Error("invalid_token");
  }

  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new Error("invalid_token");
  }

  const certificates = await getCertificates();
  const certificate = certificates[header.kid];

  if (!certificate) {
    throw new Error("invalid_token");
  }

  const signedContent = `${parts[0]}.${parts[1]}`;
  const signature = Buffer.from(parts[2], "base64url");

  const validSignature = crypto.verify(
    "RSA-SHA256",
    Buffer.from(signedContent),
    certificate,
    signature
  );

  if (!validSignature) {
    throw new Error("invalid_token");
  }

  const now = Math.floor(Date.now() / 1000);

  if (
    payload.aud !== projectId ||
    payload.iss !== `https://securetoken.google.com/${projectId}` ||
    typeof payload.sub !== "string" ||
    !payload.sub ||
    payload.sub.length > 128 ||
    !Number.isFinite(payload.exp) ||
    payload.exp <= now ||
    !Number.isFinite(payload.iat) ||
    payload.iat > now + 300
  ) {
    throw new Error("invalid_token");
  }

  return {
    uid: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null
  };
}

export async function requireFirebaseUser(req, projectId) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    const error = new Error("authentication_required");
    error.statusCode = 401;
    throw error;
  }

  try {
    return await verifyFirebaseToken(match[1], projectId);
  } catch (cause) {
    if (cause.message === "firebase_certificate_service_unavailable") {
      const error = new Error("authentication_service_unavailable");
      error.statusCode = 503;
      throw error;
    }

    const error = new Error("invalid_token");
    error.statusCode = 401;
    throw error;
  }
}