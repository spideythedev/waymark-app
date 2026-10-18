import { sendJson, requireMethod } from "../lib/validation.js";
import { isAiConfigured, config } from "../lib/config.js";

export default function handler(req, res) {
  if (!requireMethod(req, res, "GET")) return;

  return sendJson(res, 200, {
    application: "WAYMARK",
    status: "operational",
    version: "2.0.0",
    services: {
      aiConfigured: isAiConfigured(),
      educationDataset: "curated_json",
      liveOfficialData: false
    },
    projectId: config.projectId,
    timestamp: new Date().toISOString()
  });
}