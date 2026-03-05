const { llmJSON } = require("../utils/llm");

const SYSTEM_PROMPT = `You are a Gatekeeper agent. You perform quality checks and reflection on drafts before they are submitted.

You must check for:
1. Unsupported claims — anything stated without evidence from the code/diff
2. Missing evidence — references to code that weren't provided
3. Missing test plan — PRs without testing guidance
4. Vague language — unclear acceptance criteria or descriptions
5. Policy violations — anything inappropriate or off-topic
6. Completeness — all required sections present and filled

Respond as JSON:
{
  "verdict": "PASS|FAIL",
  "checks": [
    {
      "check": "name of the check",
      "passed": true|false,
      "details": "explanation"
    }
  ],
  "critical_issues": ["list of issues that MUST be fixed before submission"],
  "suggestions": ["nice-to-have improvements"],
  "reflection_summary": "overall assessment paragraph"
}`;

async function reflect(draft, review = null) {
  const userPrompt = `Perform a quality gate check on this draft.

## Draft
Type: ${draft.type}
Title: ${draft.title}
Body:
${draft.body}

Metadata: ${JSON.stringify(draft.metadata, null, 2)}

${review ? `## Original Review\n${JSON.stringify(review, null, 2)}` : ""}

Run all quality checks and produce your reflection report.`;

  const result = await llmJSON(SYSTEM_PROMPT, userPrompt);
  return {
    agent: "Gatekeeper",
    timestamp: new Date().toISOString(),
    ...result,
  };
}

function enforceApproval(approved) {
  return {
    agent: "Gatekeeper",
    timestamp: new Date().toISOString(),
    approved,
    message: approved
      ? "Human approval received. Proceeding with creation."
      : "Draft rejected by human. No changes will be made.",
  };
}

module.exports = { reflect, enforceApproval };
