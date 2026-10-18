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
    const state = normalizeIdentifier(record.state);
    const sourceId = normalizeIdentifier(
      record.source?.sourceId ?? record.sourceId
    );

    if (!name || !state || !sourceId) {
      continue;
    }

    const key = `${sourceId}:${state}:${name}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(record);
  }

  return [...groups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => ({
      key,
      count: items.length,
      records: items.map((record) => ({
        id: record.id ?? null,
        name: record.name,
        state: record.state
      }))
    }));
}