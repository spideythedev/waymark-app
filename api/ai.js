import { config } from "../lib/config.js";
import { requireFirebaseUser } from "../lib/auth.js";
import { searchEducation } from "../lib/data-service.js";
import { generateGuidance } from "../lib/ai-service.js";
import {
  sendJson,
  requireMethod,
  readBody,
  cleanText,
  cleanStringArray
} from "../lib/validation.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, "POST")) return;

  let user;

  try {
    user = await requireFirebaseUser(req, config.projectId);
  } catch (error) {
    return sendJson(res, error.statusCode || 401, {
      error: error.message || "authentication_failed",
      message: error.statusCode === 503
        ? "Authentication is temporarily unavailable."
        : "Please sign in again to use WAYMARK guidance."
    });
  }

  const body = readBody(req);

  if (!body) {
    return sendJson(res, 400, {
      error: "invalid_request",
      message: "A valid JSON request body is required."
    });
  }

  const prompt = cleanText(body.prompt, config.maxPromptLength);

  if (!prompt) {
    return sendJson(res, 400, {
      error: "prompt_required",
      message: "Enter a question to get guidance."
    });
  }

  const suppliedProfile =
    body.profile && typeof body.profile === "object"
      ? body.profile
      : {};

  const profile = {
    stage: cleanText(suppliedProfile.stage, 40),
    classLevel: cleanText(suppliedProfile.classLevel, 30),
    stream: cleanText(suppliedProfile.stream, 40),
    state: cleanText(suppliedProfile.state, 80),
    interests: cleanStringArray(suppliedProfile.interests)
  };

  try {
    const records = await searchEducation({
      query: prompt,
      state: profile.state
    });

    const result = await generateGuidance({
      prompt,
      profile,
      records: records.records.slice(0, 8)
    });

    return sendJson(res, 200, {
      answer: result.answer,
      model: result.model,
      sourceStatus: result.sourceStatus,
      datasetRecordsUsed: result.datasetRecordsUsed,
      userId: user.uid,
      notice: records.records.length
        ? "Answers may include general guidance. Check linked official sources before making admissions or financial decisions."
        : "No matching education records were found in the connected dataset. This answer is general guidance, not verified live admissions information."
    });
  } catch (error) {
    const status = error.statusCode || 502;

    return sendJson(res, status, {
      error: error.message || "guidance_unavailable",
      message: status === 429
        ? "The guidance service is busy. Please try again shortly."
        : status === 503
          ? "The guidance service is not configured or is temporarily unavailable."
          : "WAYMARK could not generate guidance right now."
    });
  }
}