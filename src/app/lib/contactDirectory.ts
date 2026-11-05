export type ContactEmail = {
  value: string;
  label?: string;
  cc?: string;
};

export type ContactAudience =
  | { type: "everyone" }
  | { type: "specialists" }
  | { type: "group"; groupId: string };

export type ContactGroupMember = { uid: string; name: string; email: string };
export type ContactDirectoryGroup = {
  id: string;
  name: string;
  memberCount: number;
  members?: ContactGroupMember[];
};

export type DirectoryContact = {
  id: string;
  institutionKey: string;
  audience?: ContactAudience;
  person?: string;
  role?: string;
  description?: string;
  phone?: {
    display: string;
    href: string;
  };
  emails?: ContactEmail[];
  notice?: string;
};

export type ContactInstitution = {
  key: string;
  label: string;
  logoPath: string;
  accentClass: string;
};

export const OPEN_CONTACT_DIRECTORY_EVENT = "bohemika:open-contact-directory";
export const CONTACT_DIRECTORY_CHANGED_EVENT = "bohemika:contact-directory-changed";

export function normalizeContactAudience(value: unknown): ContactAudience | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if ((row.type === "everyone" || row.type === "specialists") && row.groupId === undefined) {
    return { type: row.type };
  }
  if (row.type === "group" && typeof row.groupId === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(row.groupId)) {
    return { type: "group", groupId: row.groupId };
  }
  return null;
}

export const CONTACT_INSTITUTIONS: ContactInstitution[] = [
  {
    key: "bohemika",
    label: "Bohemika",
    logoPath: "/icons/bohemika_logo.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(56,189,248,0.16),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(14,165,233,0.08),transparent_42%)]",
  },
  {
    key: "cpp",
    label: "ČPP",
    logoPath: "/icons/cpp.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(37,99,235,0.13),transparent_44%),radial-gradient(circle_at_8%_92%,rgba(239,68,68,0.09),transparent_42%)]",
  },
  {
    key: "allianz",
    label: "Allianz",
    logoPath: "/icons/allianz.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(0,102,178,0.15),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(0,70,140,0.07),transparent_42%)]",
  },
  {
    key: "uniqa",
    label: "UNIQA",
    logoPath: "/icons/uniqa.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(168,85,247,0.15),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(236,72,153,0.08),transparent_42%)]",
  },
  {
    key: "kooperativa",
    label: "Kooperativa",
    logoPath: "/icons/koop-v2.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(22,163,74,0.14),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(34,197,94,0.08),transparent_42%)]",
  },
  {
    key: "investika",
    label: "iNVESTiKA",
    logoPath: "/icons/invstk.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(250,204,21,0.17),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(71,85,105,0.08),transparent_42%)]",
  },
  {
    key: "csob",
    label: "ČSOB Pojišťovna",
    logoPath: "/icons/csb.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(2,132,199,0.15),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(30,64,175,0.08),transparent_42%)]",
  },
  {
    key: "maxima",
    label: "MAXIMA pojišťovna",
    logoPath: "/icons/maxima.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(225,29,72,0.14),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(244,63,94,0.08),transparent_42%)]",
  },
  {
    key: "slavia",
    label: "Slavia pojišťovna",
    logoPath: "/icons/slavialogo.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(234,88,12,0.15),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(251,146,60,0.08),transparent_42%)]",
  },
  {
    key: "pillow",
    label: "Pillow",
    logoPath: "/icons/pillow.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(34,197,94,0.16),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(20,184,166,0.09),transparent_42%)]",
  },
  {
    key: "axa",
    label: "AXA",
    logoPath: "/icons/axalogo.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(37,99,235,0.15),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(220,38,38,0.08),transparent_42%)]",
  },
  {
    key: "conseq",
    label: "Conseq",
    logoPath: "/icons/conseq.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(30,64,175,0.14),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(239,68,68,0.07),transparent_42%)]",
  },
  {
    key: "investona",
    label: "Investona",
    logoPath: "/icons/investona.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(14,116,144,0.15),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(15,118,110,0.08),transparent_42%)]",
  },
];

export const CONTACT_INSTITUTION_BY_KEY = new Map(
  CONTACT_INSTITUTIONS.map((institution) => [institution.key, institution]),
);


export type ContactDirectoryChangeSummary = {
  kind: "added" | "updated" | "removed" | "multiple";
  title: string;
  message: string;
  changedCount: number;
  institutionKey: string | null;
  contactId: string | null;
};

const contactDisplayLabel = (contact: DirectoryContact): string =>
  contact.person ??
  contact.description ??
  contact.role ??
  contact.emails?.[0]?.value ??
  contact.phone?.display ??
  "kontakt";

const contactInstitutionLabel = (contact: DirectoryContact): string =>
  CONTACT_INSTITUTION_BY_KEY.get(contact.institutionKey)?.label ??
  contact.institutionKey;

export function describeContactDirectoryChange(
  previousContacts: DirectoryContact[],
  nextContacts: DirectoryContact[],
): ContactDirectoryChangeSummary | null {
  const previousById = new Map(
    previousContacts.map((contact) => [contact.id, contact]),
  );
  const nextById = new Map(nextContacts.map((contact) => [contact.id, contact]));
  const added = nextContacts.filter(
    (contact) => !previousById.has(contact.id),
  );
  const removed = previousContacts.filter(
    (contact) => !nextById.has(contact.id),
  );
  const updated = nextContacts.filter((contact) => {
    const previous = previousById.get(contact.id);
    return previous != null && JSON.stringify(previous) !== JSON.stringify(contact);
  });
  const changedCount = added.length + removed.length + updated.length;
  if (changedCount === 0) return null;

  if (changedCount === 1) {
    const contact = added[0] ?? updated[0] ?? removed[0];
    const kind = added.length > 0 ? "added" : updated.length > 0 ? "updated" : "removed";
    const action =
      kind === "added"
        ? "Byl přidán nový kontakt"
        : kind === "updated"
          ? "Kontakt byl upraven"
          : "Kontakt byl odstraněn";
    return {
      kind,
      title: "Změna v kontaktech",
      message: `${action}: ${contactInstitutionLabel(contact)} – ${contactDisplayLabel(contact)}.`,
      changedCount,
      institutionKey: contact.institutionKey,
      contactId: contact.id,
    };
  }

  const parts = [
    added.length > 0 ? `${added.length} přidáno` : "",
    updated.length > 0 ? `${updated.length} upraveno` : "",
    removed.length > 0 ? `${removed.length} odstraněno` : "",
  ].filter(Boolean);
  return {
    kind: "multiple",
    title: "Změna v kontaktech",
    message: `Adresář kontaktů byl aktualizován (${parts.join(", ")}).`,
    changedCount,
    institutionKey: null,
    contactId: null,
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;

const normalizeText = (value: unknown, maxLength: number): string =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

export function normalizeDirectoryContacts(
  value: unknown,
): DirectoryContact[] | null {
  if (!Array.isArray(value) || value.length > 200) return null;

  const contacts: DirectoryContact[] = [];
  const ids = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    // Only genuinely legacy records default to everyone. Invalid restrictions fail closed.
    const audience = Object.prototype.hasOwnProperty.call(row, "audience")
      ? normalizeContactAudience(row.audience)
      : { type: "everyone" as const };
    if (!audience) return null;
    const id = normalizeText(row.id, 80);
    const institutionKey = normalizeText(row.institutionKey, 80);
    if (
      !ID_RE.test(id) ||
      ids.has(id) ||
      !CONTACT_INSTITUTION_BY_KEY.has(institutionKey)
    ) {
      return null;
    }

    const person = normalizeText(row.person, 120);
    const role = normalizeText(row.role, 80);
    const description = normalizeText(row.description, 500);
    const notice = normalizeText(row.notice, 500);
    const rawPhone = row.phone;
    let phone: DirectoryContact["phone"];
    if (rawPhone != null) {
      if (
        typeof rawPhone !== "object" ||
        Array.isArray(rawPhone)
      ) {
        return null;
      }
      const phoneRow = rawPhone as Record<string, unknown>;
      const display = normalizeText(phoneRow.display, 40);
      const href = normalizeText(phoneRow.href, 40);
      if (!display || !href || !/^\+?[0-9]+$/.test(href)) return null;
      phone = { display, href };
    }

    let emails: ContactEmail[] | undefined;
    if (row.emails != null) {
      if (!Array.isArray(row.emails) || row.emails.length > 4) return null;
      emails = [];
      for (const rawEmail of row.emails) {
        if (!rawEmail || typeof rawEmail !== "object" || Array.isArray(rawEmail)) {
          return null;
        }
        const emailRow = rawEmail as Record<string, unknown>;
        const emailValue = normalizeText(emailRow.value, 180);
        const label = normalizeText(emailRow.label, 80);
        const cc = normalizeText(emailRow.cc, 180);
        if (!EMAIL_RE.test(emailValue) || (cc && !EMAIL_RE.test(cc))) return null;
        emails.push({
          value: emailValue,
          ...(label ? { label } : {}),
          ...(cc ? { cc } : {}),
        });
      }
    }

    if (!phone && (!emails || emails.length === 0)) return null;

    ids.add(id);
    contacts.push({
      id,
      institutionKey,
      audience,
      ...(person ? { person } : {}),
      ...(role ? { role } : {}),
      ...(description ? { description } : {}),
      ...(phone ? { phone } : {}),
      ...(emails && emails.length > 0 ? { emails } : {}),
      ...(notice ? { notice } : {}),
    });
  }

  return contacts;
}
