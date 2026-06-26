// Thin wrapper around Google's Gemini API (free tier: gemini-2.5-flash).
// Used by the "AI Assistant" on the problem-solving page to review a user's code
// and to hand out progressive hints. The API key lives ONLY on the server
// (GEMINI_API_KEY) — it is never shipped to the browser.
//
// Get a free key at https://aistudio.google.com/apikey and set:
//   GEMINI_API_KEY=...        (required)
//   GEMINI_MODEL=gemini-2.5-flash   (optional override)

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const endpoint = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const httpError = (message, status) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

// Calls Gemini with a JSON response schema so we always get back structured data
// the frontend can render directly (no brittle markdown parsing).
const callGemini = async ({ system, prompt, schema, temperature = 0.4 }) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw httpError('AI assistant is not configured on the server.', 503);

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: {
      temperature,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  };

  let resp;
  try {
    resp = await fetch(`${endpoint(GEMINI_MODEL)}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw httpError('Could not reach the AI service. Try again.', 502);
  }

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data?.error?.message || `AI request failed (${resp.status}).`;
    throw httpError(msg, resp.status === 429 ? 429 : 502);
  }

  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || '')
    .join('');
  try {
    return JSON.parse(text);
  } catch {
    throw httpError('The AI returned an unexpected response.', 502);
  }
};

// Trim long fields so we don't blow past sensible token sizes.
const clamp = (value, max) => {
  const str = String(value ?? '');
  return str.length > max ? `${str.slice(0, max)}\n…(truncated)` : str;
};

const buildProblemContext = (problem) => {
  const constraints = (problem.constraints || []).join('\n');
  const examples = (problem.examples || [])
    .slice(0, 3)
    .map((ex, i) => `Example ${i + 1}:\n  Input: ${clamp(ex.input, 400)}\n  Output: ${clamp(ex.output, 400)}`)
    .join('\n');
  return [
    `Title: ${problem.title}`,
    `Difficulty: ${problem.difficulty}`,
    problem.tags?.length ? `Tags: ${problem.tags.join(', ')}` : '',
    `\nStatement:\n${clamp(problem.description, 4000)}`,
    constraints ? `\nConstraints:\n${clamp(constraints, 1000)}` : '',
    examples ? `\n${examples}` : '',
  ].filter(Boolean).join('\n');
};

// ── Code review ───────────────────────────────────────────────────────────────
const reviewSchema = {
  type: 'OBJECT',
  properties: {
    currentApproach: { type: 'STRING' },
    suggestedApproach: { type: 'STRING' },
    keyIdea: { type: 'STRING' },
    codeQualityRating: { type: 'STRING', enum: ['Poor', 'Okayish', 'Good', 'Excellent'] },
    codeQualityComment: { type: 'STRING' },
    timeComplexity: { type: 'STRING' },
    spaceComplexity: { type: 'STRING' },
    performanceTip: { type: 'STRING' },
    correctnessConcern: { type: 'STRING' },
  },
  required: [
    'currentApproach', 'suggestedApproach', 'keyIdea',
    'codeQualityRating', 'codeQualityComment',
    'timeComplexity', 'spaceComplexity', 'performanceTip',
  ],
};

const reviewCode = ({ problem, language, code }) => callGemini({
  temperature: 0.3,
  schema: reviewSchema,
  system:
    'You are a senior competitive-programming mentor reviewing a user\'s solution. ' +
    'Be precise and concise — every field is a single line (max ~20 words). ' +
    'Judge the code as written. For complexity give Big-O for THIS code. ' +
    'performanceTip must be one concrete actionable line (e.g. "Replace the inner loop with a hash map to drop to O(n)"). ' +
    'codeQualityComment is one line on readability/structure/naming. ' +
    'Set correctnessConcern only if you spot a likely bug or missed edge case, else leave it empty. ' +
    'Do NOT rewrite their full solution.',
  prompt:
    `Problem:\n${buildProblemContext(problem)}\n\n` +
    `Language: ${language}\n\nUser's code:\n\`\`\`\n${clamp(code, 12000)}\n\`\`\``,
});

// ── Hints ─────────────────────────────────────────────────────────────────────
const hintSchema = {
  type: 'OBJECT',
  properties: {
    hints: { type: 'ARRAY', items: { type: 'STRING' } },
    codeIssues: { type: 'ARRAY', items: { type: 'STRING' } },
    nextStep: { type: 'STRING' },
  },
  required: ['hints', 'nextStep'],
};

const getHint = ({ problem, language, code }) => callGemini({
  temperature: 0.5,
  schema: hintSchema,
  system:
    'You are a mentor giving a stuck student progressive hints. ' +
    'Return 2–4 hints ordered from gentle nudge to more specific, each one line. ' +
    'NEVER reveal the full solution or write complete code — guide the thinking only. ' +
    'If the user already wrote code, populate codeIssues with concrete, specific bugs or ' +
    'misconceptions you see in it (one line each); if the code is empty or fine, return an empty list. ' +
    'nextStep is a single line telling them what to try next.',
  prompt:
    `Problem:\n${buildProblemContext(problem)}\n\n` +
    `Language: ${language}\n\nUser's current code (may be empty/partial):\n\`\`\`\n${clamp(code, 12000)}\n\`\`\``,
});

module.exports = { reviewCode, getHint, GEMINI_MODEL };
