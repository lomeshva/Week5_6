const https = require("https");

class GitHubTool {
  constructor(token) {
    this.token = token;
  }

  _parseRepo(remoteUrl) {
    // Handle both HTTPS and SSH URLs
    let match = remoteUrl.match(/github\.com[:/](.+?)(?:\.git)?$/);
    if (match) return match[1];
    return null;
  }

  async _request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "api.github.com",
        path,
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          "User-Agent": "github-repo-agent",
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
      };
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        });
      });
      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async createIssue(repoFullName, title, body, labels = []) {
    const resp = await this._request(
      "POST",
      `/repos/${repoFullName}/issues`,
      { title, body, labels }
    );
    return resp;
  }

  async createPR(repoFullName, title, body, head, base = "main") {
    const resp = await this._request(
      "POST",
      `/repos/${repoFullName}/pulls`,
      { title, body, head, base }
    );
    return resp;
  }

  async getIssue(repoFullName, number) {
    return this._request("GET", `/repos/${repoFullName}/issues/${number}`);
  }

  async getPR(repoFullName, number) {
    return this._request("GET", `/repos/${repoFullName}/pulls/${number}`);
  }

  async updateIssue(repoFullName, number, title, body) {
    return this._request("PATCH", `/repos/${repoFullName}/issues/${number}`, {
      title,
      body,
    });
  }

  async updatePR(repoFullName, number, title, body) {
    return this._request("PATCH", `/repos/${repoFullName}/pulls/${number}`, {
      title,
      body,
    });
  }

  async addComment(repoFullName, number, body) {
    return this._request(
      "POST",
      `/repos/${repoFullName}/issues/${number}/comments`,
      { body }
    );
  }
}

module.exports = GitHubTool;
