#!/usr/bin/env node

import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function loadCredentials() {
  const rawJson = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key,
        };
      }
    } catch {
      // fallback to split env vars below
    }
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (projectId && clientEmail && privateKeyRaw) {
    return {
      projectId,
      clientEmail,
      privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
    };
  }

  return null;
}

async function main() {
  const credentials = loadCredentials();
  if (!credentials) {
    throw new Error(
      "Chybí FIREBASE_ADMIN_* credentials. Zkontrolujte .env.local."
    );
  }

  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert(credentials),
    });

  const auth = getAuth(app);
  const manager = auth.projectConfigManager();
  const currentConfig = await manager.getProjectConfig();
  const currentMfa = currentConfig.multiFactorConfig ?? {};
  const existingProviders = currentMfa.providerConfigs ?? [];

  const providerConfigsWithoutTotp = existingProviders.filter(
    (provider) => !provider.totpProviderConfig
  );

  const nextMfaConfig = {
    state: "ENABLED",
    factorIds: currentMfa.factorIds,
    providerConfigs: [
      ...providerConfigsWithoutTotp,
      {
        state: "ENABLED",
        totpProviderConfig: {
          adjacentIntervals: 5,
        },
      },
    ],
  };

  await manager.updateProjectConfig({
    multiFactorConfig: nextMfaConfig,
  });

  const updatedConfig = await manager.getProjectConfig();
  console.log("TOTP MFA je zapnuto.");
  console.log(
    "Aktualni MFA config:",
    JSON.stringify(updatedConfig.multiFactorConfig ?? {}, null, 2)
  );
}

main().catch((error) => {
  console.error("Nepodarilo se zapnout TOTP MFA:", error?.message ?? error);
  process.exit(1);
});
