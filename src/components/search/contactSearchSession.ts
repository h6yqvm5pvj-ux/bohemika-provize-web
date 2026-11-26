import type { DirectoryContact } from "@/app/lib/contactDirectory";

type ContactSession = {
  uid: string;
  contacts: DirectoryContact[] | null;
  pending: Promise<DirectoryContact[]> | null;
  controller: AbortController;
};

// A directory is authorized for one account and one open search session only.
// Invalidation also prevents an older request from repopulating the cache.
export function createContactSearchSession() {
  let active: ContactSession | null = null;

  return {
    invalidate() {
      active?.controller.abort();
      active = null;
    },
    async load(uid: string, fetchContacts: (signal: AbortSignal) => Promise<DirectoryContact[]>): Promise<DirectoryContact[]> {
      if (!active || active.uid !== uid) {
        active?.controller.abort();
        active = { uid, contacts: null, pending: null, controller: new AbortController() };
      }
      const session = active;
      if (session.contacts) return session.contacts;
      if (!session.pending) {
        session.pending = fetchContacts(session.controller.signal).then((contacts) => {
          if (active !== session) return [];
          session.contacts = contacts;
          return contacts;
        }).finally(() => {
          if (active === session) session.pending = null;
        });
      }
      return session.pending;
    },
  };
}
