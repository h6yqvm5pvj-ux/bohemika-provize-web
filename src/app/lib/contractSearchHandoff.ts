import { privateMemory } from "./privateMemory";

const keyFor = (uid: string) => `contract-search-handoff:${uid}`;

export function setContractSearchHandoff(uid: string, query: string): void {
  privateMemory.setItem(keyFor(uid), query.slice(0, 120));
}

export function takeContractSearchHandoff(uid: string): string | null {
  const key = keyFor(uid);
  const query = privateMemory.getItem(key);
  privateMemory.removeItem(key);
  return query;
}
