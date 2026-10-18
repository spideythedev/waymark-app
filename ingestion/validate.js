import { normalizeUrl } from "./normalize.js";

export function validateRecord(record) {
  const errors = [];

  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return {
      valid: false,
      errors: ["Record must be an object."]
    };
  }

  if (
    typeof record.id !== "string" ||
    !record.id.trim()
  ) {
    errors.push("A record identifier is required.");
  }

  if (
    typeof record.name !== "string" ||
    !record.name.trim()
  ) {
    errors.push("A record name is required.");
  }

  if (!normalizeUrl(record.sourceUrl)) {
    errors.push("A valid HTTP or HTTPS source URL is required.");
  }

  if (
    typeof record.sourceId !== "string" ||
    !record.sourceId.trim()
  ) {
    errors.push("A registered source identifier is required.");
  }

  if (
    typeof record.lastVerifiedAt !== "string" ||
    !Number.isFinite(Date.parse(record.lastVerifiedAt))
  ) {
    errors.push("A valid verification timestamp is required.");
  }

  if (
    typeof record.verificationStatus !== "string" ||
    !["verified", "unverified", "expired"].includes(
      record.verificationStatus
    )
  ) {
    errors.push("A valid verification status is required.");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}