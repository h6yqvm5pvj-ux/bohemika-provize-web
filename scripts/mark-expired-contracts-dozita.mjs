#!/usr/bin/env node

import nextEnv from "@next/env";
import { createJiti } from "jiti";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const jiti = createJiti(import.meta.url);
const { markExpiredPolicyEndContractsDozita } = jiti(
  "../src/lib/server/contractLifecycleMaintenance.ts"
);

const hasArg = (name) => process.argv.includes(name);

const parseArgValue = (key, fallback = null) => {
  const prefix = `${key}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(key);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const parseOptionalDate = (value) => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid --now value: ${value}`);
  }
  return date;
};

const main = async () => {
  const write = hasArg("--write") || hasArg("--apply");
  const limitRaw = parseArgValue("--limit");
  const limit = limitRaw ? Math.max(0, Number.parseInt(limitRaw, 10) || 0) : 0;
  const ownerEmail = parseArgValue("--owner");
  const now = parseOptionalDate(parseArgValue("--now"));

  const result = await markExpiredPolicyEndContractsDozita({
    write,
    limit,
    ownerEmail,
    now,
  });
  console.log(JSON.stringify(result, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
