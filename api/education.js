import { getEducationData, getSources } from "../lib/data-service.js";
import { sendJson, requireMethod } from "../lib/validation.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, "GET")) return;

  try {
    const [data, sources] = await Promise.all([
      getEducationData(),
      getSources()
    ]);

    return sendJson(res, 200, {
      version: data.version,
      lastUpdated: data.lastUpdated,
      total: data.records.length,
      records: data.records,
      sources: sources.map(source => ({
        id: source.id,
        name: source.name,
        url: source.url,
        status: source.status,
        integration: source.integration
      }))
    });
  } catch {
    return sendJson(res, 500, {
      error: "education_data_unavailable",
      message: "Education data could not be loaded."
    });
  }
}