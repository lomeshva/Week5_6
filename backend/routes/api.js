const express = require("express");
const router = express.Router();
const GitTool = require("../tools/git");
const GitHubTool = require("../tools/github");
const { reviewChanges } = require("../agents/reviewer");
const { planAction, planFromInstruction } = require("../agents/planner");
const { draftIssue, draftPR, improveContent } = require("../agents/writer");
const { reflect, enforceApproval } = require("../agents/gatekeeper");

// In-memory session store for pending drafts
const sessions = {};

function getGit(repoPath) {
  return new GitTool(repoPath || process.env.DEFAULT_REPO_PATH);
}

function getGitHub() {
  return new GitHubTool(process.env.GITHUB_TOKEN);
}

function parseRepoName(repoPath) {
  const git = getGit(repoPath);
  const remote = git._exec("git remote get-url origin");
  const match = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
  return match ? match[1] : null;
}

// ---------- Repo Info ----------

router.post("/repo/info", (req, res) => {
  try {
    const git = getGit(req.body.repoPath);
    const info = git.getRepoInfo();
    res.json({ success: true, data: info });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ---------- Task 1: Review ----------

router.post("/review", async (req, res) => {
  try {
    const { repoPath, base, range } = req.body;
    const git = getGit(repoPath);
    const log = [];

    log.push({ agent: "System", message: "Starting review pipeline..." });

    // Tool Use: get diff
    let diff, changedFiles;
    if (range) {
      diff = git.getDiffRange(range);
      changedFiles = git._exec(`git diff --name-status ${range}`);
      log.push({ agent: "Tool:git", message: `git diff ${range}` });
    } else {
      diff = git.getDiff(base || "main");
      changedFiles = git.getChangedFiles(base || "main");
      log.push({
        agent: "Tool:git",
        message: `git diff ${base || "main"}`,
      });
    }

    if (!diff) {
      return res.json({
        success: true,
        data: {
          log: [
            ...log,
            { agent: "Reviewer", message: "No changes detected." },
          ],
          review: null,
          plan: null,
        },
      });
    }

    // Reviewer agent
    log.push({ agent: "Reviewer", message: "Analyzing changes..." });
    const review = await reviewChanges(diff, changedFiles);
    log.push({
      agent: "Reviewer",
      message: `Found ${review.issues_found.length} issue(s). Risk: ${review.risk_level}. Category: ${review.category}.`,
    });

    // Planner agent
    log.push({ agent: "Planner", message: "Creating action plan..." });
    const plan = await planAction(review);
    log.push({
      agent: "Planner",
      message: `Recommended action: ${plan.action}. Scope valid: ${plan.scope_valid}.`,
    });

    res.json({
      success: true,
      data: { log, review, plan, diff: diff.substring(0, 5000) },
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ---------- Task 2: Draft ----------

router.post("/draft", async (req, res) => {
  try {
    const { repoPath, type, instruction, review, plan } = req.body;
    const git = getGit(repoPath);
    const log = [];

    let finalPlan = plan;
    let finalReview = review;

    // If from explicit instruction (no prior review)
    if (instruction && !plan) {
      const repoInfo = git.getRepoInfo();
      log.push({
        agent: "Planner",
        message: "Planning from instruction...",
      });
      finalPlan = await planFromInstruction(instruction, repoInfo);
      log.push({
        agent: "Planner",
        message: `Plan: ${finalPlan.action}. Title direction: ${finalPlan.draft_outline?.suggested_title}`,
      });
    }

    // Writer agent
    let draft;
    if (type === "issue") {
      log.push({ agent: "Writer", message: "Drafting issue..." });
      draft = await draftIssue(finalPlan, finalReview, instruction);
    } else {
      log.push({ agent: "Writer", message: "Drafting PR..." });
      const diff = git.getDiff();
      draft = await draftPR(finalPlan, finalReview, instruction, diff);
    }
    log.push({
      agent: "Writer",
      message: `Draft created: "${draft.title}"`,
    });

    // Gatekeeper reflection
    log.push({ agent: "Gatekeeper", message: "Running reflection checks..." });
    const reflection = await reflect(draft, finalReview);
    log.push({
      agent: "Gatekeeper",
      message: `Reflection verdict: ${reflection.verdict}. ${reflection.critical_issues.length} critical issue(s).`,
    });

    // Store in session
    const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    sessions[sessionId] = { draft, reflection, repoPath, type };

    res.json({
      success: true,
      data: { log, draft, reflection, sessionId },
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ---------- Task 2 continued: Approve / Reject ----------

router.post("/approve", async (req, res) => {
  try {
    const { sessionId, approved } = req.body;
    const session = sessions[sessionId];

    if (!session) {
      return res.json({ success: false, error: "Session not found or expired." });
    }

    const log = [];
    const approval = enforceApproval(approved);
    log.push({ agent: "Gatekeeper", message: approval.message });

    if (!approved) {
      delete sessions[sessionId];
      return res.json({ success: true, data: { log, created: false } });
    }

    // Create on GitHub
    const gh = getGitHub();
    const repoName = parseRepoName(session.repoPath);

    if (!repoName) {
      return res.json({
        success: false,
        error: "Could not determine GitHub repo from remote URL.",
      });
    }

    let result;
    if (session.type === "issue") {
      log.push({ agent: "Tool:github", message: `Creating issue on ${repoName}...` });
      result = await gh.createIssue(
        repoName,
        session.draft.title,
        session.draft.body,
        session.draft.labels
      );
    } else {
      const git = getGit(session.repoPath);
      const branch = git.getCurrentBranch();
      log.push({
        agent: "Tool:github",
        message: `Creating PR on ${repoName} from ${branch}...`,
      });
      result = await gh.createPR(
        repoName,
        session.draft.title,
        session.draft.body,
        branch
      );
    }

    log.push({
      agent: "Tool:github",
      message:
        result.status < 300
          ? `Created successfully. URL: ${result.data.html_url}`
          : `API error: ${result.status} — ${JSON.stringify(result.data.message || result.data)}`,
    });

    delete sessions[sessionId];
    res.json({
      success: true,
      data: { log, created: result.status < 300, url: result.data.html_url, apiResult: result },
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ---------- Task 3: Improve ----------

router.post("/improve", async (req, res) => {
  try {
    const { repoPath, type, number } = req.body;
    const log = [];
    const gh = getGitHub();
    const repoName = parseRepoName(repoPath);

    if (!repoName) {
      return res.json({
        success: false,
        error: "Could not determine GitHub repo from remote URL.",
      });
    }

    // Fetch existing
    log.push({
      agent: "Tool:github",
      message: `Fetching ${type} #${number} from ${repoName}...`,
    });

    let existing;
    if (type === "issue") {
      existing = await gh.getIssue(repoName, number);
    } else {
      existing = await gh.getPR(repoName, number);
    }

    if (existing.status !== 200) {
      return res.json({
        success: false,
        error: `Could not fetch ${type} #${number}: ${existing.status}`,
      });
    }

    const { title, body } = existing.data;
    log.push({
      agent: "Reviewer",
      message: `Analyzing ${type} #${number}: "${title}"`,
    });

    // Writer: critique + improve
    log.push({ agent: "Writer", message: "Critiquing and rewriting..." });
    const improvement = await improveContent(type, title, body || "(empty body)");
    log.push({
      agent: "Writer",
      message: `Found ${improvement.critique.issues.length} issue(s). Quality: ${improvement.critique.overall_quality}.`,
    });

    // Gatekeeper reflection on the improved version
    log.push({ agent: "Gatekeeper", message: "Reflecting on improvement..." });
    const reflection = await reflect(
      {
        type,
        title: improvement.improved.title,
        body: improvement.improved.body,
        metadata: {},
      },
      null
    );
    log.push({
      agent: "Gatekeeper",
      message: `Reflection verdict: ${reflection.verdict}.`,
    });

    const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    sessions[sessionId] = {
      draft: improvement.improved,
      type,
      number,
      repoPath,
      isImprovement: true,
    };

    res.json({
      success: true,
      data: {
        log,
        original: { title, body },
        improvement,
        reflection,
        sessionId,
      },
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ---------- Apply Improvement ----------

router.post("/apply-improvement", async (req, res) => {
  try {
    const { sessionId, approved } = req.body;
    const session = sessions[sessionId];

    if (!session || !session.isImprovement) {
      return res.json({ success: false, error: "Session not found." });
    }

    const log = [];
    const approval = enforceApproval(approved);
    log.push({ agent: "Gatekeeper", message: approval.message });

    if (!approved) {
      delete sessions[sessionId];
      return res.json({ success: true, data: { log, updated: false } });
    }

    const gh = getGitHub();
    const repoName = parseRepoName(session.repoPath);

    log.push({
      agent: "Tool:github",
      message: `Updating ${session.type} #${session.number} on ${repoName}...`,
    });

    let result;
    if (session.type === "issue") {
      result = await gh.updateIssue(
        repoName,
        session.number,
        session.draft.title,
        session.draft.body
      );
    } else {
      result = await gh.updatePR(
        repoName,
        session.number,
        session.draft.title,
        session.draft.body
      );
    }

    log.push({
      agent: "Tool:github",
      message:
        result.status < 300
          ? `Updated successfully.`
          : `API error: ${result.status}`,
    });

    delete sessions[sessionId];
    res.json({
      success: true,
      data: { log, updated: result.status < 300, apiResult: result },
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
