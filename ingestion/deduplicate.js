import { normalizeIdentifier } from "./normalize.js";

export function findDuplicateGroups(records) {
  if (!Array.isArray(records)) {
    throw new TypeError("Records must be an array.");
  }

  const groups = new Map();

  for (const record of records) {
    if (!record || typeof record !== "object") {
      continue;
    }

    const name = normalizeIdentifier(record.name);
    const sourceId = normalizeIdentifier(record.sourceId);

    if (!name || !sourceId) {
      continue;
    }

    const key = `${sourceId}:${name}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(record);
  }

  return [...groups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => ({
      key,
      records: items
    }));
}