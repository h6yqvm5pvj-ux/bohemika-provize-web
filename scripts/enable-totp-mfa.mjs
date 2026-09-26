#!/usr/bin/env node

import nextEnv from "@next/env";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { operatorCredential, operatorProjectId } from "./lib/google-operator-credentials.mjs";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

async function main() {
  const app =
    getApps()[0] ??
    initializeApp({
      projectId: operatorProjectId(),
      credential: operatorCredential(),
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

main().catch(() => {
  console.error("Nepodarilo se zapnout TOTP MFA. Overte projekt a prihlaseni opravnenym operatorem (firebase login).");
  process.exit(1);
});
