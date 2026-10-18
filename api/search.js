import { searchEducation } from "../lib/data-service.js";
import { sendJson, requireMethod, cleanText } from "../lib/validation.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, "GET")) return;

  const query = cleanText(req.query?.q || "", 120);
  const type = cleanText(req.query?.type || "", 50);
  const state = cleanText(req.query?.state || "", 80);

  try {
    const result = await searchEducation({ query, type, state });

    return sendJson(res, 200, {
      ...result,
      sourceStatus: result.total
        ? "curated_records_found"
        : "no_matching_records",
      message: result.total
        ? null
        : "No matching records are currently available in WAYMARK's curated dataset."
    });
  } catch {
    return sendJson(res, 500, {
      error: "search_unavailable",
      message: "Search is temporarily unavailable."
    });
  }
}