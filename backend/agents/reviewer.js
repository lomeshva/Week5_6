const { llmJSON } = require("../utils/llm");

const SYSTEM_PROMPT = `You are a senior code Reviewer agent. You analyze git diffs and code changes.

Your job:
1. Identify what changed (files, functions, logic)
2. Categorize the change: feature, bugfix, refactor, docs, test, chore
3. Identify potential issues: bugs, missing validation, security concerns, style problems
4. Assess risk: low, medium, high (with justification)
5. Decide recommended action: create_issue, create_pr, no_action

Respond as JSON with this exact structure:
{
  "summary": "Brief summary of all changes",
  "files_analyzed": ["list of files"],
  "category": "feature|bugfix|refactor|docs|test|chore",
  "issues_found": [
    {
      "severity": "low|medium|high",
      "file": "filename",
      "description": "what the issue is",
      "evidence": "specific code or diff line reference"
    }
  ],
  "risk_level": "low|medium|high",
  "risk_justification": "why this risk level",
  "recommended_action": "create_issue|create_pr|no_action",
  "action_justification": "why this action is recommended"
}`;

async function reviewChanges(diff, changedFiles, context = "") {
  const userPrompt = `Analyze these code changes:

## Changed Files
${changedFiles}

## Diff
${diff.substring(0, 12000)}

${context ? `## Additional Context\n${context}` : ""}

Provide your structured review.`;

  const result = await llmJSON(SYSTEM_PROMPT, userPrompt);
  return {
    agent: "Reviewer",
    timestamp: new Date().toISOString(),
    ...result,
  };
}

module.exports = { reviewChanges };
