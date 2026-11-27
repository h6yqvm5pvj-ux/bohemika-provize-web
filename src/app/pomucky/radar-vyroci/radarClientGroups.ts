import { clientEmailKey, clientPhoneKey } from "@/app/_klienti/clientContactKeys";
import { clientIdentityKey } from "@/app/_klienti/clientIdentity";

type ClientContract = {
  key: string; ownerEmail: string; clientName: string;
  clientPhone: string | null; clientEmail: string | null;
};

export function groupByRadarClient<T extends ClientContract>(items: T[]) {
  type Group = { key: string; label: string; items: T[]; phone: string; email: string };
  const groups: Group[] = [];
  const byName = new Map<string, Group[]>();
  for (const item of items) {
    const name = clientIdentityKey(item.clientName);
    const nameKey = JSON.stringify([item.ownerEmail, name]);
    const phone = clientPhoneKey(item.clientPhone);
    const email = clientEmailKey(item.clientEmail);
    const candidates = byName.get(nameKey) ?? [];
    const matches = candidates.filter(group => (phone && phone === group.phone) || (email && email === group.email));
    if (matches.length === 1) {
      const group = matches[0];
      group.items.push(item);
      // Every contract in a group must continue to share at least one contact.
      if (group.phone !== phone) group.phone = "";
      if (group.email !== email) group.email = "";
    } else {
      const group = { key: item.key, label: item.clientName, items: [item], phone, email };
      groups.push(group);
      if (name && name !== "bez jména" && (phone || email) && matches.length === 0) {
        candidates.push(group);
        byName.set(nameKey, candidates);
      }
    }
  }
  return groups;
}
