const { llmJSON } = require("../utils/llm");

const SYSTEM_PROMPT = `You are a Planner agent. You receive a code review and decide on a concrete plan of action.

Given the review results, you must:
1. Validate the scope — is the review complete enough to act on?
2. Decide what to create: issue, pr, or nothing
3. Outline the structure of the draft (title direction, sections to include)
4. Flag any blockers or missing info

Respond as JSON:
{
  "scope_valid": true|false,
  "scope_notes": "any concerns about scope",
  "action": "draft_issue|draft_pr|no_action",
  "action_rationale": "why this action",
  "draft_outline": {
    "suggested_title": "concise title",
    "sections": ["list of sections to include"],
    "key_points": ["main points to cover"],
    "labels": ["suggested labels"]
  },
  "blockers": ["any blockers or missing information"]
}`;

async function planAction(reviewResult, instruction = "") {
  const userPrompt = `Based on this review, create an action plan.

## Review Result
${JSON.stringify(reviewResult, null, 2)}

${instruction ? `## Explicit Instruction\n${instruction}` : ""}

Decide what action to take and outline the draft.`;

  const result = await llmJSON(SYSTEM_PROMPT, userPrompt);
  return {
    agent: "Planner",
    timestamp: new Date().toISOString(),
    ...result,
  };
}

async function planFromInstruction(instruction, repoInfo) {
  const userPrompt = `Create an action plan based on this instruction.

## Instruction
${instruction}

## Repository Info
${JSON.stringify(repoInfo, null, 2)}

Decide whether this needs an issue or PR draft, and outline it.`;

  const result = await llmJSON(SYSTEM_PROMPT, userPrompt);
  return {
    agent: "Planner",
    timestamp: new Date().toISOString(),
    ...result,
  };
}

module.exports = { planAction, planFromInstruction };
