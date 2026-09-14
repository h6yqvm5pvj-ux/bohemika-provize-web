import { contractConcludingAdviserEmail, type ClientAdviser, type ClientContractItem } from "./clientCardHelpers";

export type ClientScope = "my" | "team";
export type ClientScopeSelection = { scope: ClientScope; advisers: string[] };
const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function readClientScope(params: Pick<URLSearchParams, "get">): ClientScopeSelection {
  const scope = params.get("scope") === "team" ? "team" : "my";
  const advisers = scope === "team" ? [...new Set((params.get("advisers") ?? "").split(",").map(normalizeEmail).filter(Boolean))] : [];
  return { scope, advisers };
}

export function clientScopeQuery(selection: ClientScopeSelection): string {
  const params = new URLSearchParams({ scope: selection.scope });
  if (selection.scope === "team" && selection.advisers.length) params.set("advisers", selection.advisers.join(","));
  return params.toString();
}

export function selectClientContracts(contracts: ClientContractItem[], viewerEmail: string, selection: ClientScopeSelection, teamAdvisers: ClientAdviser[]): ClientContractItem[] {
  const viewer = normalizeEmail(viewerEmail);
  const selected = new Set(selection.advisers.map(normalizeEmail));
  const allowedTeam = new Set(teamAdvisers.map((adviser) => normalizeEmail(adviser.email)).filter((email) => email && email !== viewer && (!selected.size || selected.has(email))));
  return contracts.filter((contract) => {
    const author = contractConcludingAdviserEmail(contract);
    return author && (selection.scope === "my" ? author === viewer : allowedTeam.has(author));
  });
}
