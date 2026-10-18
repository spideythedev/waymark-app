export const config = Object.freeze({
  projectId: process.env.FIREBASE_PROJECT_ID || "way-mark-app",
  groqApiKey: process.env.GROQ_API_KEY || "",
  groqModel: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
  maxPromptLength: 3000,
  maxOutputTokens: 1600
});

export function isAiConfigured() {
  return Boolean(config.groqApiKey && config.groqModel);
}