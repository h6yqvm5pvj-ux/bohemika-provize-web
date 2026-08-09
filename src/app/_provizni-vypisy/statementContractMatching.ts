import type { User as FirebaseUser } from "firebase/auth";

import { normalizeContractNumberForMatch } from "./statementParsing";
import type {
  ContractMatchRequest,
  ContractMatchScope,
  ContractMatchState,
  MatchedSystemContract,
} from "./statementTypes";

const CONTRACT_MATCH_BATCH_SIZE = 50;

type SystemContractFindBulkResult =
  | {
      ok?: true;
      key?: string;
      scope?: ContractMatchScope;
      query?: string;
      contracts?: MatchedSystemContract[];
    }
  | {
      ok: false;
      key?: string;
      scope?: ContractMatchScope;
      query?: string;
      error?: string;
    };

type DedupeContracts = (contracts: MatchedSystemContract[]) => MatchedSystemContract[];

export const contractMatchKey = (
  scope: ContractMatchScope,
  contractNumber: string | null | undefined
): string | null => {
  const normalized = normalizeContractNumberForMatch(contractNumber);
  return normalized ? `${scope}:${normalized}` : null;
};

const systemContractMatchStateFromContracts = (
  contractsRaw: MatchedSystemContract[] | undefined,
  dedupeContracts: DedupeContracts
): ContractMatchState => {
  const contracts = dedupeContracts(Array.isArray(contractsRaw) ? contractsRaw : []);
  if (contracts.length === 0) return { status: "not_found", contracts: [] };
  return { status: "matched", contracts };
};

export const systemContractMatchError = (error: string): ContractMatchState => ({
  status: "error",
  contracts: [],
  error,
});

export const fetchSystemContractMatchBatch = async (
  user: FirebaseUser,
  requests: ContractMatchRequest[],
  dedupeContracts: DedupeContracts
): Promise<Map<string, ContractMatchState>> => {
  const payloadRequests = requests.map((request, index) => ({
    key: contractMatchKey(request.scope, request.contractNumber) ?? `${request.scope}:${index}`,
    scope: request.scope,
    q: request.contractNumber,
  }));

  const sendRequest = async (token: string) =>
    fetch("/api/contracts/find", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests: payloadRequests }),
    });

  let token = await user.getIdToken();
  let response = await sendRequest(token);
  if (response.status === 401) {
    token = await user.getIdToken(true);
    response = await sendRequest(token);
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        ok?: boolean;
        error?: string;
        results?: SystemContractFindBulkResult[];
      }
    | null;

  if (!response.ok || payload?.ok === false) {
    const message =
      payload?.error ?? `Nepodařilo se dohledat smlouvy (HTTP ${response.status}).`;
    return new Map(
      payloadRequests.map((request) => [request.key, systemContractMatchError(message)])
    );
  }

  if (!Array.isArray(payload?.results)) {
    return new Map(
      payloadRequests.map((request) => [
        request.key,
        systemContractMatchError("Párování vrátilo neočekávanou odpověď."),
      ])
    );
  }

  const matches = new Map<string, ContractMatchState>();
  for (const result of payload.results) {
    const key = typeof result.key === "string" ? result.key : null;
    if (!key) continue;
    if (result.ok === false) {
      matches.set(
        key,
        systemContractMatchError(result.error || "Nepodařilo se dohledat smlouvu v systému.")
      );
    } else {
      matches.set(key, systemContractMatchStateFromContracts(result.contracts, dedupeContracts));
    }
  }
  return matches;
};

export const fetchSystemContractMatches = async (
  user: FirebaseUser,
  requests: ContractMatchRequest[],
  onMatch: (request: ContractMatchRequest, match: ContractMatchState) => void,
  dedupeContracts: DedupeContracts
) => {
  for (let index = 0; index < requests.length; index += CONTRACT_MATCH_BATCH_SIZE) {
    const batch = requests.slice(index, index + CONTRACT_MATCH_BATCH_SIZE);
    const matches = await fetchSystemContractMatchBatch(user, batch, dedupeContracts).catch(
      (err) => {
        const message =
          err instanceof Error ? err.message : "Nepodařilo se dohledat smlouvy v systému.";
        return new Map(
          batch.map((request) => [
            contractMatchKey(request.scope, request.contractNumber) ?? request.contractNumber,
            systemContractMatchError(message),
          ])
        );
      }
    );

    for (const request of batch) {
      const key = contractMatchKey(request.scope, request.contractNumber);
      if (!key) continue;
      onMatch(
        request,
        matches.get(key) ??
          systemContractMatchError("Párování nevrátilo výsledek pro tuto smlouvu.")
      );
    }
  }
};
