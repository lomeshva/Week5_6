const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

class GitTool {
  constructor(repoPath) {
    this.repoPath = repoPath;
  }

  _exec(cmd) {
    try {
      return execSync(cmd, {
        cwd: this.repoPath,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      }).trim();
    } catch (err) {
      return err.stdout ? err.stdout.trim() : `Error: ${err.message}`;
    }
  }

  getDiff(base) {
    if (base) {
      return this._exec(`git diff ${base}`);
    }
    const staged = this._exec("git diff --cached");
    const unstaged = this._exec("git diff");
    return [staged, unstaged].filter(Boolean).join("\n");
  }

  getDiffRange(range) {
    return this._exec(`git diff ${range}`);
  }

  getLog(count = 10) {
    return this._exec(
      `git log --oneline --no-decorate -${count}`
    );
  }

  getCurrentBranch() {
    return this._exec("git rev-parse --abbrev-ref HEAD");
  }

  getStatus() {
    return this._exec("git status --short");
  }

  getFileContent(filePath) {
    const full = path.join(this.repoPath, filePath);
    if (!fs.existsSync(full)) return `File not found: ${filePath}`;
    return fs.readFileSync(full, "utf-8");
  }

  getChangedFiles(base) {
    if (base) {
      return this._exec(`git diff --name-status ${base}`);
    }
    return this._exec("git diff --name-status HEAD");
  }

  getRepoInfo() {
    const remote = this._exec("git remote get-url origin");
    const branch = this.getCurrentBranch();
    const status = this.getStatus();
    const log = this.getLog(5);
    return { remote, branch, status, recentCommits: log };
  }
}

module.exports = GitTool;
