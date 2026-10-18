import { readFile } from "node:fs/promises";

const educationPath = new URL("../data/education.json", import.meta.url);
const sourcesPath = new URL("../data/sources.json", import.meta.url);

async function readJson(path) {
  const content = await readFile(path, "utf8");
  return JSON.parse(content);
}

export async function getEducationData() {
  const data = await readJson(educationPath);

  if (!Array.isArray(data.records)) {
    throw new Error("invalid_education_dataset");
  }

  return data;
}

export async function getSources() {
  const data = await readJson(sourcesPath);
  return Array.isArray(data.sources) ? data.sources : [];
}

export async function searchEducation({ query = "", type = "", state = "" } = {}) {
  const data = await getEducationData();

  const normalizedQuery = query.trim().toLowerCase();
  const normalizedType = type.trim().toLowerCase();
  const normalizedState = state.trim().toLowerCase();

  const records = data.records.filter(record => {
    const matchesType =
      !normalizedType ||
      String(record.type || "").toLowerCase() === normalizedType;

    const matchesState =
      !normalizedState ||
      String(record.state || "").toLowerCase() === normalizedState;

    const searchableText = [
      record.id,
      record.name,
      record.type,
      record.description,
      record.state,
      ...(Array.isArray(record.tags) ? record.tags : [])
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesQuery =
      !normalizedQuery || searchableText.includes(normalizedQuery);

    return matchesType && matchesState && matchesQuery;
  });

  return {
    datasetVersion: data.version,
    lastUpdated: data.lastUpdated,
    total: records.length,
    records
  };
}