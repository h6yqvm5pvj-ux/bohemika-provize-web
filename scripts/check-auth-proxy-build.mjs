import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

// A compiled proxy module is insufficient: Next must also register it for requests.
const manifest = JSON.parse(
  await readFile(".next/server/functions-config-manifest.json", "utf8"),
);
const proxy = manifest.functions?.["/_middleware"];
assert.equal(
  proxy?.runtime,
  "nodejs",
  "Authentication proxy is missing from the production function manifest.",
);
await access(".next/server/middleware.js");

const matchers = (proxy.matchers ?? []).map(({ regexp }) => new RegExp(regexp));
for (const path of ["/", "/pomucky", "/nastaveni", "/admin/zadosti", "/smlouvy", "/klienti"]) {
  assert.ok(
    matchers.some((matcher) => matcher.test(path)),
    `Authentication proxy does not cover ${path}.`,
  );
}
console.log("Production authentication proxy: registered and protected routes covered.");
