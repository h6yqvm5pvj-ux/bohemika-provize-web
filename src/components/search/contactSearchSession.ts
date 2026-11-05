import type { DirectoryContact } from "@/app/lib/contactDirectory";

type ContactSession = {
  uid: string;
  contacts: DirectoryContact[] | null;
  pending: Promise<DirectoryContact[]> | null;
};

// A directory is authorized for one account and one open search session only.
// Invalidation also prevents an older request from repopulating the cache.
export function createContactSearchSession() {
  let active: ContactSession | null = null;

  return {
    invalidate() {
      active = null;
    },
    async load(uid: string, fetchContacts: () => Promise<DirectoryContact[]>): Promise<DirectoryContact[]> {
      if (!active || active.uid !== uid) active = { uid, contacts: null, pending: null };
      const session = active;
      if (session.contacts) return session.contacts;
      if (!session.pending) {
        session.pending = fetchContacts().then((contacts) => {
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
