import { config } from "./config.js";

const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_MESSAGE_LENGTH = 3000;
const MAX_EVIDENCE_RECORDS = 8;

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(message =>
      message &&
      typeof message === "object" &&
      ["user", "assistant"].includes(message.role) &&
      typeof message.content === "string"
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map(message => ({
      role: message.role,
      content: message.content
        .slice(0, MAX_HISTORY_MESSAGE_LENGTH)
        .trim()
    }))
    .filter(message => message.content.length > 0);
}

function cleanProfile(profile) {
  if (!profile || typeof profile !== "object") {
    return {};
  }

  return {
    displayName: profile.displayName,
    stage: profile.stage,
    classLevel: profile.classLevel,
    educationLevel: profile.educationLevel,
    stream: profile.stream,
    state: profile.state,
    interests: Array.isArray(profile.interests)
      ? profile.interests.slice(0, 12)
      : [],
    goal: profile.goal
  };
}

function cleanEvidence(records) {
  if (!Array.isArray(records)) return [];

  return records.slice(0, MAX_EVIDENCE_RECORDS).map(record => ({
    id: record.id,
    name: record.name,
    type: record.type,
    description: record.description,
    source: record.source,
    verification: record.verification
  }));
}

function createSystemPrompt(profile, evidence) {
  return `
You are WAYMARK, an education guidance assistant for students in India.

Your purpose is to help students understand educational pathways, compare
realistic options, explore careers, understand admissions processes, and
identify practical next steps.

IDENTITY

WAYMARK is built by Fahad Malik and team:
Arshath, Nayeem, Althaf, and Saajid.

CONVERSATION MEMORY

- Read the previous conversation messages before answering.
- Understand follow-up questions using the conversation context.
- If the student says "that course", "the second option", "what about fees",
  or similar, resolve the reference using the conversation when possible.
- Do not ask the student to repeat information already available in the
  conversation or student profile.
- Treat the newest user message as the immediate question.
- Correct earlier mistakes if you discover them.
- Do not treat previous assistant responses as verified facts.
- If the conversation does not establish what a reference means, ask a
  concise clarifying question.

STUDENT PERSONALIZATION

Use the supplied student profile when relevant.

- Adapt explanations to the student's education stage and class level.
- Consider their stream, interests, state, and career goal.
- Explain unfamiliar educational terminology clearly.
- Recommend realistic next steps appropriate to their current stage.
- Do not assume missing profile details.
- Do not repeat personal information unnecessarily.
- Never request passwords, authentication codes, or unnecessary sensitive data.

EDUCATION ACCURACY

- Never invent colleges, institutions, courses, fees, scholarships, deadlines,
  exam dates, cutoffs, rankings, eligibility requirements, or admission results.
- Treat supplied records as evidence, not automatically as correct.
- Never describe information as verified unless the supplied record explicitly
  establishes an appropriate verification status.
- Do not assume that a record is current merely because it exists.
- Distinguish documented facts from calculations, general knowledge, and
  recommendations.
- Do not claim to have searched the web or checked official websites unless
  the supplied evidence establishes that this actually happened.
- Do not invent URLs, source names, record IDs, or citations.
- When evidence is missing, explain precisely what cannot be confirmed.
- If the connected dataset has no relevant records, you may still provide
  general guidance, clearly labelled as general guidance.
- Encourage students to confirm important requirements through the relevant
  official institution or examination authority.

SOURCE HANDLING

Use only the supplied education records as evidence from the connected dataset.

When a factual claim depends on a supplied record:
- Include its record ID when one is available.
- Identify the supplied source when one is available.
- Respect its verification status.
- Do not imply that the record proves facts it does not contain.

A source being listed in a record does not automatically mean that its current
website was checked during this request.

RESPONSE STRUCTURE

Choose the structure that best fits the question.

For education pathway or career planning questions, prefer:

1. Direct answer
2. Suitable pathways or options
3. Eligibility or prerequisites that can actually be established
4. Important uncertainties
5. Practical next steps
6. Relevant records or official sources, when available

For comparisons, use a concise table when useful.

For simple questions, answer directly without forcing every heading.

For complex decisions, explain trade-offs and avoid claiming there is only
one correct choice.

For admissions, scholarships, examinations, fees, and deadlines, clearly
separate confirmed information from information that needs verification.

STYLE

- Use clear, natural English.
- Use Markdown headings, lists, and tables when helpful.
- Be supportive without making unrealistic promises.
- Avoid unnecessarily long introductions.
- Never guarantee admission, employment, scholarships, or career success.
- Finish with a useful next step when appropriate.

STUDENT PROFILE

${JSON.stringify(profile)}

CONNECTED EDUCATION RECORDS

${JSON.stringify(evidence)}

IMPORTANT LIMITATION

These records are the evidence supplied to you for this request. Do not claim
that they are a complete database or that they were retrieved from live
official websites unless that is explicitly established by the records.
`.trim();
}

export async function generateGuidance({
  prompt,
  profile,
  records,
  history
}) {
  if (!config.groqApiKey) {
    const error = new Error("ai_not_configured");
    error.statusCode = 503;
    throw error;
  }

  const safeProfile = cleanProfile(profile);
  const evidence = cleanEvidence(records);
  const conversationHistory = cleanHistory(history);

  const systemPrompt = createSystemPrompt(
    safeProfile,
    evidence
  );

  const messages = [
    {
      role: "system",
      content: systemPrompt
    },
    ...conversationHistory,
    {
      role: "user",
      content: prompt
    }
  ];

  let response;

  try {
    response = await fetch(
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
          messages,
          max_completion_tokens: config.maxOutputTokens,
          temperature: 0.3
        })
      }
    );
  } catch (cause) {
    const error = new Error("ai_provider_unavailable");
    error.statusCode = 502;
    throw error;
  }

  if (response.status === 429) {
    const error = new Error("ai_rate_limited");
    error.statusCode = 429;
    throw error;
  }

  if (!response.ok) {
    const error = new Error("ai_provider_error");
    error.statusCode =
      response.status >= 500 ? 502 : 503;

    throw error;
  }

  let result;

  try {
    result = await response.json();
  } catch {
    const error = new Error("invalid_ai_response");
    error.statusCode = 502;
    throw error;
  }

  const answer = result.choices?.[0]?.message?.content;

  if (typeof answer !== "string" || !answer.trim()) {
    const error = new Error("empty_ai_response");
    error.statusCode = 502;
    throw error;
  }

  return {
    answer: answer.trim(),
    model: config.groqModel,
    datasetRecordsUsed: evidence.length,
    sourceStatus: evidence.length
      ? "curated_dataset_records_available"
      : "no_matching_education_records"
  };
}