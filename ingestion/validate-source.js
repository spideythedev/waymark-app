export function validateSourceRegistry(registry) {
  const errors = [];

  if (!registry || typeof registry !== "object") {
    return {
      valid: false,
      errors: ["The source registry is invalid."]
    };
  }

  if (!Array.isArray(registry.sources)) {
    return {
      valid: false,
      errors: ["The source list is missing."]
    };
  }

  const ids = new Set();

  for (const source of registry.sources) {
    if (!source || typeof source !== "object") {
      errors.push("A source entry is invalid.");
      continue;
    }

    if (
      typeof source.id !== "string" ||
      !source.id.trim()
    ) {
      errors.push("A source identifier is required.");
    } else if (ids.has(source.id)) {
      errors.push(`Duplicate source identifier: ${source.id}`);
    } else {
      ids.add(source.id);
    }

    try {
      const url = new URL(source.url);

      if (url.protocol !== "https:") {
        errors.push(`Source ${source.id} must use HTTPS.`);
      }
    } catch {
      errors.push(`Source ${source.id || "unknown"} has an invalid URL.`);
    }

    if (!Array.isArray(source.categories)) {
      errors.push(`Source ${source.id} must define categories.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}