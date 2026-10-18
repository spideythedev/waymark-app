import { config } from "./config.js";

export async function generateGuidance({ prompt, profile, records }) {
  if (!config.groqApiKey) {
    const error = new Error("ai_not_configured");
    error.statusCode = 503;
    throw error;
  }

  const evidence = records.map(record => ({
    id: record.id,
    name: record.name,
    type: record.type,
    description: record.description,
    source: record.source,
    verification: record.verification
  }));

  const systemPrompt = `
You are WAYMARK, an education guidance assistant for students in India.

Help students understand education pathways, compare options, and identify
practical next steps.

Rules:
- Never invent institutions, courses, fees, deadlines, exam dates, or eligibility.
- Treat supplied records as evidence, not as automatically correct.
- Never call a record verified unless its verification status explicitly says so.
- If evidence is missing, say what is unknown.
- Distinguish sourced facts, calculations, and general suggestions.
- Include the supplied record IDs when explaining factual claims based on records.
- Do not invent URLs or citations.
- Use clear, well-structured Markdown.
- Prefer headings, short paragraphs, lists, and tables when useful.
- Give practical next steps.
- Do not claim that you checked live websites unless the supplied evidence establishes it.
- Protect the student's privacy and avoid requesting unnecessary personal information.

Student context:
${JSON.stringify(profile || {})}

Available education records:
${JSON.stringify(evidence)}

If no suitable records are available, explain that the current connected dataset
does not contain enough evidence to confirm specific opportunities.
You may still provide general educational guidance, clearly labelled as such.
`.trim();

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.groqApiKey}`,
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model: config.groqModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        max_completion_tokens: config.maxOutputTokens,
        temperature: 0.3
      })
    }
  );

  if (response.status === 429) {
    const error = new Error("ai_rate_limited");
    error.statusCode = 429;
    throw error;
  }

  if (!response.ok) {
    const error = new Error("ai_provider_error");
    error.statusCode = response.status >= 500 ? 502 : 503;
    throw error;
  }

  const result = await response.json();
  const answer = result.choices?.[0]?.message?.content;

  if (typeof answer !== "string" || !answer.trim()) {
    const error = new Error("empty_ai_response");
    error.statusCode = 502;
    throw error;
  }

  return {
    answer,
    model: config.groqModel,
    datasetRecordsUsed: records.length,
    sourceStatus: records.length
      ? "curated_dataset_records_available"
      : "no_matching_education_records"
  };
}