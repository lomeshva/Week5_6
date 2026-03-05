const OpenAI = require("openai");

let client = null;

function getClient() {
  if (!client) {
    // Ollama exposes an OpenAI-compatible API at localhost:11434
    client = new OpenAI({
      baseURL: process.env.OLLAMA_URL || "http://localhost:11434/v1",
      apiKey: "ollama", // Ollama doesn't need a real key but the library requires one
    });
  }
  return client;
}

async function llmCall(systemPrompt, userPrompt, options = {}) {
  const model = options.model || process.env.LLM_MODEL || "llama3.2";
  const temperature = options.temperature ?? 0.3;

  const resp = await getClient().chat.completions.create({
    model,
    temperature,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  return resp.choices[0].message.content;
}

async function llmJSON(systemPrompt, userPrompt, options = {}) {
  const raw = await llmCall(
    systemPrompt +
      "\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown fences, no preamble, no explanation. Just the JSON object.",
    userPrompt,
    { ...options, temperature: 0.1 }
  );
  // Strip any accidental markdown fences or text before/after JSON
  let cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  // Find the first { and last } to extract JSON even if there's surrounding text
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1) {
    cleaned = cleaned.substring(start, end + 1);
  }
  return JSON.parse(cleaned);
}

module.exports = { llmCall, llmJSON };
