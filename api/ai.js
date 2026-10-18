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

const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_MESSAGE_LENGTH = 3000;
const MAX_TOTAL_HISTORY_LENGTH = 12000;

const ALLOWED_HISTORY_ROLES = new Set([
  "user",
  "assistant"
]);

function cleanHistory(value) {
  if (!Array.isArray(value)) return [];

  const history = [];
  let totalLength = 0;

  for (const item of value.slice(-MAX_HISTORY_MESSAGES)) {
    if (!item || typeof item !== "object") continue;

    if (!ALLOWED_HISTORY_ROLES.has(item.role)) continue;

    const content = cleanText(
      item.content,
      MAX_HISTORY_MESSAGE_LENGTH
    );

    if (!content) continue;

    if (totalLength + content.length > MAX_TOTAL_HISTORY_LENGTH) {
      break;
    }

    history.push({
      role: item.role,
      content
    });

    totalLength += content.length;
  }

  // Keep only complete user/assistant turns.
  while (
    history.length &&
    history[0].role !== "user"
  ) {
    history.shift();
  }

  return history;
}

function cleanProfile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return {
    displayName: cleanText(value.displayName, 80),
    stage: cleanText(value.stage, 40),
    classLevel: cleanText(value.classLevel, 30),
    educationLevel: cleanText(value.educationLevel, 40),
    stream: cleanText(value.stream || value.studyStream, 60),
    state: cleanText(value.state, 80),
    interests: cleanStringArray(value.interests).slice(0, 12),
    goal: cleanText(value.goal, 300)
  };
}

function getSourceStatus(records) {
  if (!records.length) {
    return "no_matching_records";
  }

  return "connected_dataset_records";
}

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

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return sendJson(res, 400, {
      error: "invalid_request",
      message: "A valid JSON request body is required."
    });
  }

  const prompt = cleanText(
    body.prompt,
    config.maxPromptLength
  );

  if (!prompt) {
    return sendJson(res, 400, {
      error: "prompt_required",
      message: "Enter a question to get guidance."
    });
  }

  const profile = cleanProfile(body.profile);
  const history = cleanHistory(body.history);

  // The latest prompt is supplied separately and should not be duplicated
  // as the last user message in history.
  const relevantHistory = history.slice();

  if (
    relevantHistory.length &&
    relevantHistory[relevantHistory.length - 1].role === "user"
  ) {
    const lastMessage =
      relevantHistory[relevantHistory.length - 1];

    if (lastMessage.content.trim() === prompt.trim()) {
      relevantHistory.pop();
    }
  }

  try {
    const recordsResult = await searchEducation({
      query: prompt,
      state: profile.state
    });

    const records = Array.isArray(recordsResult?.records)
      ? recordsResult.records.slice(0, 8)
      : [];

    const result = await generateGuidance({
      prompt,
      profile,
      records,
      history: relevantHistory
    });

    const hasRecords = records.length > 0;

    return sendJson(res, 200, {
      answer: result.answer,
      model: result.model,
      sourceStatus: result.sourceStatus || getSourceStatus(records),
      datasetRecordsUsed:
        result.datasetRecordsUsed ?? records.length,
      notice: hasRecords
        ? "Connected education records were available for this request. Verify important requirements and deadlines using the linked official sources."
        : "No matching education records were found in the connected dataset. This answer is general guidance, not verified live admissions information.",
      conversationContextMessages: relevantHistory.length,
      userId: user.uid
    });
  } catch (error) {
    const status = error.statusCode || 502;

    console.error("WAYMARK AI guidance error:", {
      status,
      message: error.message
    });

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