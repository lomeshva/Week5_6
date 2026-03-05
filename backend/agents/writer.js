const { llmJSON } = require("../utils/llm");

const ISSUE_SYSTEM = `You are a Writer agent that drafts GitHub Issues. 
Write clear, structured issues following best practices.

Respond as JSON:
{
  "title": "concise descriptive title",
  "body": "full markdown body of the issue",
  "labels": ["relevant labels"],
  "metadata": {
    "problem_description": "what the problem is",
    "evidence": "supporting evidence from code",
    "acceptance_criteria": ["list of criteria"],
    "risk_level": "low|medium|high"
  }
}

The body must include these sections in markdown:
## Problem Description
## Evidence
## Acceptance Criteria
## Risk Level`;

const PR_SYSTEM = `You are a Writer agent that drafts GitHub Pull Requests.
Write clear, structured PR descriptions.

Respond as JSON:
{
  "title": "concise descriptive title",
  "body": "full markdown body of the PR",
  "labels": ["relevant labels"],
  "metadata": {
    "summary": "what this PR does",
    "files_affected": ["list of files"],
    "behavior_change": "what changes for the user/system",
    "test_plan": "how to test this",
    "risk_level": "low|medium|high"
  }
}

The body must include these sections in markdown:
## Summary
## Files Affected
## Behavior Change
## Test Plan
## Risk Level`;

const IMPROVE_SYSTEM = `You are a Writer agent that improves existing GitHub Issues or PRs.
First critique the current content, then propose improvements.

Respond as JSON:
{
  "critique": {
    "issues": [
      {
        "type": "unclear|missing|vague|incomplete",
        "description": "what the problem is",
        "location": "which part of the text"
      }
    ],
    "overall_quality": "poor|fair|good|excellent"
  },
  "improved": {
    "title": "improved title",
    "body": "full improved markdown body"
  },
  "changes_summary": "brief description of what was changed and why"
}`;

async function draftIssue(plan, review = null, instruction = "") {
  const userPrompt = `Draft a GitHub Issue based on this plan.

## Plan
${JSON.stringify(plan, null, 2)}

${review ? `## Review Findings\n${JSON.stringify(review, null, 2)}` : ""}
${instruction ? `## Explicit Instruction\n${instruction}` : ""}

Write a thorough, well-structured issue.`;

  const result = await llmJSON(ISSUE_SYSTEM, userPrompt);
  return {
    agent: "Writer",
    type: "issue",
    timestamp: new Date().toISOString(),
    ...result,
  };
}

async function draftPR(plan, review = null, instruction = "", diff = "") {
  const userPrompt = `Draft a GitHub Pull Request based on this plan.

## Plan
${JSON.stringify(plan, null, 2)}

${review ? `## Review Findings\n${JSON.stringify(review, null, 2)}` : ""}
${instruction ? `## Explicit Instruction\n${instruction}` : ""}
${diff ? `## Diff (truncated)\n${diff.substring(0, 6000)}` : ""}

Write a thorough, well-structured PR description.`;

  const result = await llmJSON(PR_SYSTEM, userPrompt);
  return {
    agent: "Writer",
    type: "pr",
    timestamp: new Date().toISOString(),
    ...result,
  };
}

async function improveContent(type, currentTitle, currentBody) {
  const userPrompt = `Improve this existing GitHub ${type}.

## Current Title
${currentTitle}

## Current Body
${currentBody}

First critique it, then provide an improved version.`;

  const result = await llmJSON(IMPROVE_SYSTEM, userPrompt);
  return {
    agent: "Writer",
    type: `improve_${type}`,
    timestamp: new Date().toISOString(),
    ...result,
  };
}

module.exports = { draftIssue, draftPR, improveContent };
