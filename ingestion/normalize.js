export function normalizeText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeIdentifier(value) {
  return normalizeText(value).toLocaleLowerCase("en-IN");
}

export function normalizeUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    url.hash = "";

    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new TypeError("A record must be an object.");
  }

  return {
    ...record,
    name:
      typeof record.name === "string"
        ? normalizeText(record.name)
        : record.name,
    sourceUrl: normalizeUrl(record.sourceUrl)
  };
}