export type ContactEmail = {
  value: string;
  label?: string;
  cc?: string;
};

export type DirectoryContact = {
  id: string;
  institutionKey: string;
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
    key: "comfort-commodity",
    label: "Comfort Commodity",
    logoPath: "/icons/cclogo.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(159,18,57,0.14),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(202,138,4,0.1),transparent_42%)]",
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

export const DEFAULT_DIRECTORY_CONTACTS: DirectoryContact[] = [
  {
    id: "bohemika-pavlina-bartkova",
    institutionKey: "bohemika",
    person: "Bc. Pavlína Bártková",
    description:
      "Správa sjednatelů, registrace, pohledávky a požadavky sjednatelů",
    phone: { display: "+420 603 458 845", href: "+420603458845" },
    emails: [
      { value: "pavlina.bartkova@bohemika.eu", label: "Pavlína Bártková" },
      { value: "pohledavky@bohemika.eu", label: "Pohledávky" },
    ],
  },
  {
    id: "bohemika-bela-kulhankova",
    institutionKey: "bohemika",
    person: "Běla Kulhánková",
    description:
      "Reklamace provizí vůči sjednatelům, zpracování žádostí, elektronizace smluv, bonusové akce a soutěže",
    phone: { display: "+420 734 353 363", href: "+420734353363" },
    emails: [{ value: "bela.kulhankova@bohemika.eu" }],
  },
  {
    id: "cpp",
    institutionKey: "cpp",
    person: "Vojtěch Vodička",
    role: "KAM",
    phone: { display: "+420 734 522 927", href: "+420734522927" },
    emails: [{ value: "vojtech.vodicka@cpp.cz" }],
  },
  {
    id: "allianz-storno",
    institutionKey: "allianz",
    description: "Storno smluv",
    emails: [{ value: "BO_storno_auta@allianz.cz", label: "Storno smluv" }],
    notice: "Nesdělovat e-mail klientům, pouze pro interní účely!",
  },
  {
    id: "allianz-metodicka-podpora",
    institutionKey: "allianz",
    description: "Metodická podpora a informace o smlouvách",
    phone: { display: "+420 241 170 000", href: "+420241170000" },
    emails: [{ value: "info@allianz.cz" }],
  },
  {
    id: "allianz-eliska-stastna",
    institutionKey: "allianz",
    person: "Eliška Šťastná",
    role: "KAM",
    phone: { display: "+420 731 922 909", href: "+420731922909" },
    emails: [{ value: "eliska.stastna@allianz.cz" }],
  },
  {
    id: "uniqa",
    institutionKey: "uniqa",
    person: "Luboš Meruňka",
    role: "KAM",
    phone: { display: "+420 734 163 979", href: "+420734163979" },
    emails: [{ value: "lubos.merunka@uniqa.cz" }],
  },
  {
    id: "kooperativa",
    institutionKey: "kooperativa",
    person: "Jiří Kratochvíl",
    emails: [
      { value: "jkratochvil@koop.cz", label: "Jiří Kratochvíl" },
      {
        value: "podporasever@koop.cz",
        label: "Podpora Sever",
        cc: "jkratochvil@koop.cz",
      },
    ],
    notice:
      "Při e-mailu na Podporu Sever musí být v kopii také Jiří Kratochvíl. Kliknutím na adresu se kopie doplní automaticky.",
  },
  {
    id: "investika",
    institutionKey: "investika",
    person: "Tereza Bartůňková",
    phone: { display: "+420 702 218 819", href: "+420702218819" },
    emails: [
      { value: "terezabartunkova@investika.cz", label: "Tereza Bartůňková" },
      { value: "administrace@investika.cz", label: "Administrace" },
    ],
  },
  {
    id: "comfort-commodity",
    institutionKey: "comfort-commodity",
    person: "Tereza Mičková",
    phone: { display: "+420 734 232 022", href: "+420734232022" },
    emails: [{ value: "info@comfort-commodity.cz" }],
  },
  {
    id: "csob",
    institutionKey: "csob",
    person: "Daniel Vlk",
    role: "KAM",
    phone: { display: "+420 604 293 177", href: "+420604293177" },
    emails: [{ value: "dvlk@csob.cz" }],
  },
  {
    id: "maxima",
    institutionKey: "maxima",
    person: "Alena Zikmundová",
    phone: { display: "+420 736 777 434", href: "+420736777434" },
    emails: [{ value: "zikmundova@maxima-as.cz" }],
  },
  {
    id: "slavia",
    institutionKey: "slavia",
    phone: { display: "+420 731 011 598", href: "+420731011598" },
    emails: [{ value: "Katerina.Kubatova@slavia-pojistovna.cz" }],
  },
];

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
