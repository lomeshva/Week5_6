const OpenAI = require("openai");

let client = null;

function getClient() {
  if (!client) {
    client = new OpenAI({
      baseURL: process.env.OLLAMA_URL || "http://localhost:11434/v1",
      apiKey: "ollama",
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

function fixJSON(raw) {
  let s = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found");
  s = s.substring(start, end + 1);
  s = s.replace(/,\s*([}\]])/g, "$1");
  s = s.replace(/[\x00-\x1F\x7F]/g, (ch) =>
    ch === "\n" || ch === "\r" || ch === "\t" ? ch : ""
  );
  s = s.replace(/\\\n/g, "\\n");
  return s;
}

async function llmJSON(systemPrompt, userPrompt, options = {}) {
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const raw = await llmCall(
      systemPrompt +
      "\n\nCRITICAL: Respond with ONLY a valid JSON object. No markdown, no explanation. Start with { and end with }. No trailing commas.",
      userPrompt,
      { ...options, temperature: attempt === 1 ? 0.1 : 0.05 }
    );
    try {
      return JSON.parse(fixJSON(raw));
    } catch (err) {
      console.error(`[LLM] JSON parse fail (attempt ${attempt}/${maxRetries}):`, err.message);
      if (attempt === maxRetries) {
        try {
          const fixRaw = await llmCall(
            "You are a JSON fixer. Return ONLY the fixed valid JSON. Nothing else.",
            "Fix this JSON:\n" + raw,
            { temperature: 0 }
          );
          return JSON.parse(fixJSON(fixRaw));
        } catch {
          throw new Error("LLM returned invalid JSON after " + maxRetries + " attempts");
        }
      }
    }
  }
}

module.exports = { llmCall, llmJSON };