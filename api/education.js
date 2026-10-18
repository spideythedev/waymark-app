import {
getEducationData,
getSources
} from "../lib/data-service.js";

import {
sendJson,
requireMethod
} from "../lib/validation.js";

export default async function handler(req, res) {
if (!requireMethod(req, res, "GET")) return;

const refresh = req.query?.refresh === "1";

try {
const data = await getEducationData({ refresh });
const sources = await getSources();

res.setHeader(
  "Cache-Control",
  "public, s-maxage=60, stale-while-revalidate=300"
);

return sendJson(res, 200, {
  version: data.version,
  lastUpdated: data.lastUpdated,
  total: data.records.length,
  sourceMode: data.sourceMode,
  sourceWarning: data.sourceWarning || null,
  records: data.records,
  sources: sources.map(source => ({
    id: source.id,
    name: source.name,
    url: source.url,
    status: source.status,
    integration: source.integration,
    recordCount: source.recordCount ?? null
  }))
});

} catch (error) {
console.error(
"WAYMARK education source failed:",
error.message
);

return sendJson(res, 502, {
  error: "education_source_unavailable",
  message:
    "The education directory and local dataset could not be loaded.",
  records: [],
  sourceMode: "unavailable"
});

}
}