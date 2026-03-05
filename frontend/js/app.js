const API = "";

// State
let currentSession = null;
let reviewData = null;

// --- Helpers ---

function $(sel) {
  return document.querySelector(sel);
}

function $$(sel) {
  return document.querySelectorAll(sel);
}

function repoPath() {
  return $("#repo-path").value.trim();
}

async function api(endpoint, body) {
  const res = await fetch(`${API}/api${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

function appendLog(container, entries) {
  entries.forEach((e) => {
    const div = document.createElement("div");
    div.className = "log-entry";
    div.innerHTML = `<span class="log-agent">[${e.agent}]</span>${escapeHtml(e.message)}`;
    container.appendChild(div);
  });
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function renderMarkdown(md) {
  if (!md) return "";
  return escapeHtml(md)
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^- (.+)$/gm, "&bull; $1")
    .replace(/\n/g, "<br>");
}

function showLoading(el) {
  el.innerHTML = '<span class="loading">Working</span>';
}

function clearEl(el) {
  el.innerHTML = "";
}

// --- Tabs ---

$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$(".tab").forEach((t) => t.classList.remove("active"));
    $$(".section").forEach((s) => s.classList.remove("active"));
    tab.classList.add("active");
    $(`#section-${tab.dataset.section}`).classList.add("active");
  });
});

// --- Task 1: Review ---

$("#btn-review").addEventListener("click", async () => {
  const base = $("#review-base").value.trim() || undefined;
  const range = $("#review-range").value.trim() || undefined;
  const logEl = $("#review-log");
  const outputEl = $("#review-output");

  clearEl(logEl);
  clearEl(outputEl);
  showLoading(outputEl);

  const resp = await api("/review", { repoPath: repoPath(), base, range });

  clearEl(outputEl);

  if (!resp.success) {
    outputEl.textContent = `Error: ${resp.error}`;
    return;
  }

  const { log, review, plan, diff } = resp.data;
  appendLog(logEl, log);
  reviewData = { review, plan };

  if (!review) {
    outputEl.textContent = "No changes to review.";
    return;
  }

  // Review panel
  let html = "";

  html += `<div class="panel">
    <div class="panel-header">Review Summary</div>
    <div class="panel-body">
<strong>Category:</strong> ${review.category}
<strong>Risk:</strong> ${review.risk_level} — ${escapeHtml(review.risk_justification)}
<strong>Files:</strong> ${review.files_analyzed.join(", ")}

<strong>Summary:</strong> ${escapeHtml(review.summary)}
    </div>
  </div>`;

  if (review.issues_found.length > 0) {
    html += `<div class="panel">
      <div class="panel-header">Issues Found (${review.issues_found.length})</div>
      <div class="panel-body">`;
    review.issues_found.forEach((issue, i) => {
      html += `<strong>${i + 1}. [${issue.severity}] ${escapeHtml(issue.file)}</strong>
${escapeHtml(issue.description)}
Evidence: ${escapeHtml(issue.evidence)}
`;
    });
    html += `</div></div>`;
  }

  html += `<div class="panel">
    <div class="panel-header">Plan</div>
    <div class="panel-body">
<strong>Action:</strong> ${plan.action}
<strong>Rationale:</strong> ${escapeHtml(plan.action_rationale)}
${plan.draft_outline ? `<strong>Suggested title:</strong> ${escapeHtml(plan.draft_outline.suggested_title)}` : ""}
${plan.blockers.length > 0 ? `<strong>Blockers:</strong> ${plan.blockers.join(", ")}` : ""}
    </div>
  </div>`;

  // Action buttons
  if (plan.action !== "no_action") {
    const draftType = plan.action === "draft_issue" ? "issue" : "pr";
    html += `<div class="approval-bar">
      <button onclick="draftFromReview('${draftType}')">Draft ${draftType.toUpperCase()} from Review</button>
    </div>`;
  }

  outputEl.innerHTML = html;
});

// --- Task 2: Draft ---

async function draftFromReview(type) {
  // Switch to draft tab
  $$(".tab").forEach((t) => t.classList.remove("active"));
  $$(".section").forEach((s) => s.classList.remove("active"));
  $('[data-section="draft"]').classList.add("active");
  $("#section-draft").classList.add("active");
  $("#draft-type").value = type;

  await executeDraft(type, "", reviewData?.review, reviewData?.plan);
}

$("#btn-draft").addEventListener("click", async () => {
  const type = $("#draft-type").value;
  const instruction = $("#draft-instruction").value.trim();
  await executeDraft(type, instruction);
});

async function executeDraft(type, instruction, review, plan) {
  const logEl = $("#draft-log");
  const outputEl = $("#draft-output");
  const approvalEl = $("#draft-approval");

  clearEl(logEl);
  clearEl(outputEl);
  approvalEl.classList.add("hidden");
  showLoading(outputEl);

  const resp = await api("/draft", {
    repoPath: repoPath(),
    type,
    instruction,
    review: review || undefined,
    plan: plan || undefined,
  });

  clearEl(outputEl);

  if (!resp.success) {
    outputEl.textContent = `Error: ${resp.error}`;
    return;
  }

  const { log, draft, reflection, sessionId } = resp.data;
  currentSession = sessionId;
  appendLog(logEl, log);

  let html = "";

  // Draft preview
  html += `<div class="panel">
    <div class="panel-header">Draft ${type.toUpperCase()}: ${escapeHtml(draft.title)}</div>
    <div class="panel-body rendered">${renderMarkdown(draft.body)}</div>
  </div>`;

  if (draft.labels && draft.labels.length) {
    html += `<div class="status">Labels: ${draft.labels.join(", ")}</div>`;
  }

  // Reflection
  html += `<div class="panel">
    <div class="panel-header">Reflection Report — <span class="verdict ${reflection.verdict.toLowerCase()}">${reflection.verdict}</span></div>
    <div class="panel-body">`;
  reflection.checks.forEach((c) => {
    html += `<div class="check-item ${c.passed ? "check-pass" : "check-fail"}">${escapeHtml(c.check)}: ${escapeHtml(c.details)}</div>`;
  });
  if (reflection.critical_issues.length > 0) {
    html += `\n<strong>Critical Issues:</strong>\n`;
    reflection.critical_issues.forEach((ci) => {
      html += `&bull; ${escapeHtml(ci)}\n`;
    });
  }
  html += `\n${escapeHtml(reflection.reflection_summary)}`;
  html += `</div></div>`;

  outputEl.innerHTML = html;

  // Show approval bar
  approvalEl.classList.remove("hidden");
}

// Approve / Reject
$("#btn-approve").addEventListener("click", () => submitApproval(true));
$("#btn-reject").addEventListener("click", () => submitApproval(false));

async function submitApproval(approved) {
  if (!currentSession) return;

  const logEl = $("#draft-log");
  const approvalEl = $("#draft-approval");
  const resultEl = $("#draft-result");

  approvalEl.classList.add("hidden");
  showLoading(resultEl);

  const resp = await api("/approve", {
    sessionId: currentSession,
    approved,
  });

  clearEl(resultEl);

  if (!resp.success) {
    resultEl.textContent = `Error: ${resp.error}`;
    return;
  }

  appendLog(logEl, resp.data.log);

  if (resp.data.created) {
    resultEl.innerHTML = `Created successfully. <a href="${resp.data.url}" target="_blank">${resp.data.url}</a>`;
  } else {
    resultEl.textContent = approved
      ? "Creation failed. Check logs."
      : "Draft rejected. No changes made.";
  }

  currentSession = null;
}

// --- Task 3: Improve ---

$("#btn-improve").addEventListener("click", async () => {
  const type = $("#improve-type").value;
  const number = $("#improve-number").value.trim();
  const logEl = $("#improve-log");
  const outputEl = $("#improve-output");
  const approvalEl = $("#improve-approval");

  if (!number) return;

  clearEl(logEl);
  clearEl(outputEl);
  approvalEl.classList.add("hidden");
  showLoading(outputEl);

  const resp = await api("/improve", {
    repoPath: repoPath(),
    type,
    number: parseInt(number),
  });

  clearEl(outputEl);

  if (!resp.success) {
    outputEl.textContent = `Error: ${resp.error}`;
    return;
  }

  const { log, original, improvement, reflection, sessionId } = resp.data;
  currentSession = sessionId;
  appendLog(logEl, log);

  let html = "";

  // Original
  html += `<div class="panel">
    <div class="panel-header">Original: ${escapeHtml(original.title)}</div>
    <div class="panel-body rendered">${renderMarkdown(original.body || "(empty)")}</div>
  </div>`;

  // Critique
  html += `<div class="panel">
    <div class="panel-header">Critique — Quality: ${improvement.critique.overall_quality}</div>
    <div class="panel-body">`;
  improvement.critique.issues.forEach((issue) => {
    html += `<div class="check-item check-fail">[${issue.type}] ${escapeHtml(issue.description)} (${escapeHtml(issue.location)})</div>`;
  });
  html += `</div></div>`;

  // Improved version
  html += `<div class="panel">
    <div class="panel-header">Improved: ${escapeHtml(improvement.improved.title)}</div>
    <div class="panel-body rendered">${renderMarkdown(improvement.improved.body)}</div>
  </div>`;

  html += `<div class="status">${escapeHtml(improvement.changes_summary)}</div>`;

  // Reflection
  html += `<div class="panel">
    <div class="panel-header">Reflection — <span class="verdict ${reflection.verdict.toLowerCase()}">${reflection.verdict}</span></div>
    <div class="panel-body">${escapeHtml(reflection.reflection_summary)}</div>
  </div>`;

  outputEl.innerHTML = html;
  approvalEl.classList.remove("hidden");
});

// Improve approve/reject
$("#btn-improve-approve").addEventListener("click", () => submitImproveApproval(true));
$("#btn-improve-reject").addEventListener("click", () => submitImproveApproval(false));

async function submitImproveApproval(approved) {
  if (!currentSession) return;

  const logEl = $("#improve-log");
  const approvalEl = $("#improve-approval");
  const resultEl = $("#improve-result");

  approvalEl.classList.add("hidden");
  showLoading(resultEl);

  const resp = await api("/apply-improvement", {
    sessionId: currentSession,
    approved,
  });

  clearEl(resultEl);

  if (!resp.success) {
    resultEl.textContent = `Error: ${resp.error}`;
    return;
  }

  appendLog(logEl, resp.data.log);
  resultEl.textContent = resp.data.updated
    ? "Updated successfully on GitHub."
    : approved
      ? "Update failed. Check logs."
      : "Rejected. No changes made.";

  currentSession = null;
}

// --- Repo info on load ---

async function loadRepoInfo() {
  const el = $("#repo-info");
  if (!repoPath()) {
    el.textContent = "Set a repo path above.";
    return;
  }
  const resp = await api("/repo/info", { repoPath: repoPath() });
  if (resp.success) {
    const d = resp.data;
    el.textContent = `branch: ${d.branch} | remote: ${d.remote}\n${d.status || "(clean)"}`;
  } else {
    el.textContent = `Error: ${resp.error}`;
  }
}

$("#repo-path").addEventListener("change", loadRepoInfo);

// Init
document.addEventListener("DOMContentLoaded", () => {
  if (repoPath()) loadRepoInfo();
});
