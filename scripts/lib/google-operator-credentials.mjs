import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

// Project configuration belongs to the deployment operator, not the web runtime.
// Reuse an explicit operator token or the identity selected by `firebase login`.
// Never fall back to the application's long-lived service-account key.
export function operatorCredential() {
  return {
    async getAccessToken() {
      if (process.env.GOOGLE_OPERATOR_ACCESS_TOKEN) {
        return { access_token: process.env.GOOGLE_OPERATOR_ACCESS_TOKEN, expires_in: 300 };
      }
      try {
        const require = createRequire(import.meta.url);
        let api;
        try {
          api = require("firebase-tools/lib/api.js");
        } catch {
          const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
          api = require(join(globalRoot, "firebase-tools/lib/api.js"));
        }
        const configRoot = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
        const config = JSON.parse(await readFile(join(configRoot, "configstore", "firebase-tools.json"), "utf8"));
        if (!config.tokens?.refresh_token) throw new Error("No operator login");
        const response = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000),
          body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: config.tokens.refresh_token,
            client_id: api.clientId(), client_secret: api.clientSecret() }),
        });
        if (!response.ok) throw new Error("Operator token refresh failed");
        const token = await response.json();
        if (!token.access_token || !Number.isFinite(token.expires_in)) throw new Error("Invalid operator token");
        return { access_token: token.access_token, expires_in: token.expires_in };
      } catch {
        throw new Error("Operator authentication unavailable. Run firebase login with an authorized account, or supply GOOGLE_OPERATOR_ACCESS_TOKEN.");
      }
    },
  };
}

export function operatorProjectId() {
  let credentials = {};
  if (process.env.FIREBASE_ADMIN_CREDENTIALS) {
    try { credentials = JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS); }
    catch { throw new Error("Invalid Firebase project configuration."); }
  }
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || credentials.projectId || credentials.project_id;
  if (!projectId || !/^[a-z][a-z0-9-]+$/.test(projectId)) throw new Error("Missing or invalid Firebase project ID.");
  return projectId;
}
