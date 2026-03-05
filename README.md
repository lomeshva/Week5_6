# GitHub Repository Agent

A multi-agent Web UI system for reviewing code, drafting GitHub Issues/PRs, and improving existing ones.

## Architecture

```
┌──────────────────────────────────────────────────┐
│                   Web Frontend                    │
│  (plain HTML/CSS/JS — no framework, no colors)   │
└──────────────────────┬───────────────────────────┘
                       │ HTTP/JSON
┌──────────────────────▼───────────────────────────┐
│               Express API Server                  │
│                                                   │
│  ┌───────────┐  ┌──────────┐  ┌────────────────┐│
│  │  Reviewer  │  │ Planner  │  │    Writer       ││
│  │  Agent     │  │ Agent    │  │    Agent        ││
│  └─────┬─────┘  └────┬─────┘  └───────┬────────┘│
│        │              │                │          │
│  ┌─────▼──────────────▼────────────────▼────────┐│
│  │              Gatekeeper Agent                 ││
│  │   (reflection, quality gate, human approval)  ││
│  └──────────────────┬───────────────────────────┘│
│                     │                             │
│  ┌──────────────────▼───────────────────────────┐│
│  │                 Tools                         ││
│  │   GitTool (local git)   GitHubTool (API)     ││
│  └──────────────────────────────────────────────┘│
└──────────────────────────────────────────────────┘
```

## Agents

| Agent        | Role                                                    |
|--------------|---------------------------------------------------------|
| **Reviewer** | Analyzes git diffs, categorizes changes, finds issues   |
| **Planner**  | Creates structured action plans from reviews or instructions |
| **Writer**   | Drafts Issue/PR content or improves existing content    |
| **Gatekeeper** | Reflection checks, quality gate, enforces human approval |

## Patterns Implemented

1. **Planning** — Planner agent creates structured plan before any writing
2. **Tool Use** — Real `git diff`, `git log`, file reads, GitHub API calls
3. **Reflection** — Gatekeeper checks for unsupported claims, missing evidence, policy issues
4. **Multi-Agent** — Four distinct agents with separate responsibilities

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your values:
#   GITHUB_TOKEN   — GitHub Personal Access Token
#   OPENAI_API_KEY — OpenAI API key
#   DEFAULT_REPO_PATH — path to a local git repo
```

**GitHub Token**: Create at https://github.com/settings/tokens with `repo` scope.

### 3. Run

```bash
npm start
```

Open http://localhost:3000

## Usage

### Task 1: Review Changes

1. Enter a repository path (absolute) or leave blank to use the default
2. Set a base branch (e.g., `main`) or commit range (e.g., `HEAD~3..HEAD`)
3. Click **Run Review**
4. See the Reviewer's findings, Planner's recommendation, and optionally draft from the review

### Task 2: Draft Issue or PR

Two ways:
- **From Review**: After running a review, click "Draft Issue/PR from Review"
- **From Instruction**: Switch to the Draft tab, type an instruction, click "Create Draft"

The draft goes through:
1. Planner → scope validation
2. Writer → content generation
3. Gatekeeper → reflection checks

You must **Approve** or **Reject** before anything is created on GitHub.

### Task 3: Improve Existing Issue or PR

1. Switch to the Improve tab
2. Select type (Issue or PR) and enter the number
3. Click **Analyze & Improve**
4. See the critique, improved version, and reflection
5. Approve to update on GitHub, or reject to abort

## Project Structure

```
github-agent/
├── backend/
│   ├── server.js              # Express entry point
│   ├── agents/
│   │   ├── reviewer.js        # Code review agent
│   │   ├── planner.js         # Action planning agent
│   │   ├── writer.js          # Content drafting agent
│   │   └── gatekeeper.js      # Reflection & approval agent
│   ├── tools/
│   │   ├── git.js             # Local git operations
│   │   └── github.js          # GitHub REST API
│   ├── routes/
│   │   └── api.js             # API endpoints
│   └── utils/
│       └── llm.js             # LLM wrapper (OpenAI)
├── frontend/
│   ├── index.html             # Single page UI
│   ├── css/style.css          # Minimal plain styling
│   └── js/app.js              # Client-side logic
├── .env.example               # Environment template
├── package.json
└── README.md
```

## Reflection Report

### Architectural Decisions

The system uses four agents because each maps to a distinct reasoning mode:

- **Reviewer** needs analytical reasoning over diffs — a different prompt structure than content generation.
- **Planner** needs decision-making with constraints — it validates scope and decides actions.
- **Writer** needs structured creative output following templates.
- **Gatekeeper** needs critical/adversarial reasoning — checking the other agents' work.

Separating them means each LLM call has a focused system prompt, which produces better results than a monolithic "do everything" prompt. The trade-off is more API calls and latency.

### Planning Pattern Analysis

Adding the Planner between Review and Draft made a measurable difference:
- Without planning, the Writer sometimes drafted PRs for changes that didn't warrant one.
- The Planner's scope validation catches cases where the diff is too incomplete to act on.
- Planning was insufficient when the instruction was ambiguous — the Planner would pick a direction but might guess wrong. This is mitigated by showing the plan to the user before proceeding.

### Tool Use and Grounding

Every agent output is grounded in real tool output:
- `git diff` provides the actual changes
- `git log` and `git status` provide context
- GitHub API fetches real issue/PR content for improvement
- No content is fabricated — the Writer uses evidence from the Reviewer, which uses evidence from git.

### Multi-Agent Trade-offs

Pros: Focused prompts, clearer audit trail, the Gatekeeper can catch Writer mistakes.
Cons: More latency (4 sequential LLM calls for a full pipeline), more complex error handling, harder to debug when agents disagree.

A key design choice: agents communicate through structured JSON, not free text. This makes the pipeline reliable but means agents can't have nuanced "conversations" with each other.
