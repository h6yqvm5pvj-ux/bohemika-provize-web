"use client";

import type { User as FirebaseUser } from "firebase/auth";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Check,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Save,
  Search,
  ContactRound,
  Trash2,
  X,
} from "lucide-react";
import Image from "next/image";
import ui from "./directoryModal.module.css";
import styles from "./contactsModal.module.css";
import { useDirectoryDialog } from "./useDirectoryDialog";
import { useEffect, useMemo, useRef, useState } from "react";

import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import {
  CONTACT_INSTITUTION_BY_KEY,
  CONTACT_INSTITUTIONS,
  DEFAULT_DIRECTORY_CONTACTS,
  type ContactEmail,
  type DirectoryContact,
} from "@/app/lib/contactDirectory";

type CsobAlternative = {
  name: string;
  region: string;
  phone: {
    display: string;
    href: string;
  };
  email: string;
};

type ContactDirectoryResponse = {
  ok?: boolean;
  contacts?: DirectoryContact[];
  canManage?: boolean;
  error?: string;
};

type ModalView =
  | "contacts"
  | "csob-alternatives"
  | "institution-picker"
  | "contact-form";

type ContactDraft = {
  institutionKey: string;
  person: string;
  role: string;
  description: string;
  phone: string;
  email1: string;
  email1Label: string;
  email2: string;
  email2Label: string;
  email2Cc: string;
  notice: string;
};

const CSOB_ALTERNATIVES: CsobAlternative[] = [
  {
    name: "Milan Němec",
    region: "Praha a Středočeský kraj",
    phone: { display: "+420 731 143 499", href: "+420731143499" },
    email: "milan.nemec@csobpoj.cz",
  },
  {
    name: "Michaela Kitnerová",
    region: "Praha a Středočeský kraj",
    phone: { display: "+420 725 391 119", href: "+420725391119" },
    email: "mkitnerova@csob.cz",
  },
  {
    name: "Kateřina Hudec",
    region: "Praha a Středočeský kraj",
    phone: { display: "+420 724 413 674", href: "+420724413674" },
    email: "khudec@csob.cz",
  },
  {
    name: "Martin Jor",
    region: "Pardubický kraj",
    phone: { display: "+420 705 830 837", href: "+420705830837" },
    email: "martin.jor@csobpoj.cz",
  },
  {
    name: "Zuzana Horáčková",
    region: "Královéhradecký kraj",
    phone: { display: "+420 604 294 729", href: "+420604294729" },
    email: "zhorackova@csob.cz",
  },
  {
    name: "Kateřina Kolková",
    region: "Moravskoslezský kraj",
    phone: { display: "+420 704 648 368", href: "+420704648368" },
    email: "katerina.kolkova@csobpoj.cz",
  },
  {
    name: "Petra Smoluchová",
    region: "Severní Morava",
    phone: { display: "+420 733 143 466", href: "+420733143466" },
    email: "pesmoluchova@csob.cz",
  },
  {
    name: "Josef Sklenář",
    region: "Olomoucký a Zlínský kraj",
    phone: { display: "+420 604 293 101", href: "+420604293101" },
    email: "jsklenar@csob.cz",
  },
  {
    name: "Irena Zachová",
    region: "Jihomoravský kraj",
    phone: { display: "+420 703 484 350", href: "+420703484350" },
    email: "irena.zachova@csobpoj.cz",
  },
  {
    name: "Martina Růžičková",
    region: "Jihočeský kraj",
    phone: { display: "+420 705 830 838", href: "+420705830838" },
    email: "martina.ruzickova@csobpoj.cz",
  },
  {
    name: "Simona Pešková Benešová",
    region: "Kraj Vysočina",
    phone: { display: "+420 603 144 506", href: "+420603144506" },
    email: "speskovabenesova@csob.cz",
  },
  {
    name: "Jakub Velíšek",
    region: "Plzeňský a Karlovarský kraj",
    phone: { display: "+420 725 358 436", href: "+420725358436" },
    email: "jvelisek@csob.cz",
  },
  {
    name: "Richard Vronský",
    region: "Webové služby a srovnávače",
    phone: { display: "+420 724 635 908", href: "+420724635908" },
    email: "richard.vronsky@csobpoj.cz",
  },
];

const mailtoHref = ({ value, cc }: ContactEmail): string =>
  cc
    ? `mailto:${value}?cc=${encodeURIComponent(cc)}`
    : `mailto:${value}`;

const emptyDraft = (institutionKey: string): ContactDraft => ({
  institutionKey,
  person: "",
  role: "",
  description: "",
  phone: "",
  email1: "",
  email1Label: "",
  email2: "",
  email2Label: "",
  email2Cc: "",
  notice: "",
});

const draftFromContact = (contact: DirectoryContact): ContactDraft => ({
  institutionKey: contact.institutionKey,
  person: contact.person ?? "",
  role: contact.role ?? "",
  description: contact.description ?? "",
  phone: contact.phone?.display ?? "",
  email1: contact.emails?.[0]?.value ?? "",
  email1Label: contact.emails?.[0]?.label ?? "",
  email2: contact.emails?.[1]?.value ?? "",
  email2Label: contact.emails?.[1]?.label ?? "",
  email2Cc: contact.emails?.[1]?.cc ?? "",
  notice: contact.notice ?? "",
});

const phoneHref = (value: string): string => {
  const normalized = value.replace(/[^+\d]/g, "");
  if (/^\d{9}$/.test(normalized)) return `+420${normalized}`;
  return normalized;
};

const newContactId = (institutionKey: string): string =>
  `${institutionKey}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

type ContactsModalProps = {
  onClose: () => void;
  user: FirebaseUser | null;
  initialContactId?: string | null;
};

export function ContactsModal({
  initialContactId = null,
  onClose,
  user,
}: ContactsModalProps) {
  const [contacts, setContacts] = useState<DirectoryContact[]>(
    DEFAULT_DIRECTORY_CONTACTS,
  );
  const [view, setView] = useState<ModalView>("contacts");
  const [formReturnView, setFormReturnView] = useState<ModalView>("contacts");
  const [selectedInstitution, setSelectedInstitution] = useState<string | null>(
    null,
  );
  const [canManage, setCanManage] = useState(false);
  const [editingMode, setEditingMode] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ContactDraft>(() => emptyDraft("pillow"));
  const [loading, setLoading] = useState(Boolean(user));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [search, setSearch] = useState("");
  useDirectoryDialog(panelRef, onClose);
  const highlightedContactRef = useRef<HTMLElement | null>(null);

  const institutionsWithContacts = useMemo(
    () =>
      CONTACT_INSTITUTIONS.filter((institution) =>
        contacts.some(
          (contact) => contact.institutionKey === institution.key,
        ),
      ),
    [contacts],
  );

  const availableInstitutions = useMemo(
    () =>
      CONTACT_INSTITUTIONS.filter(
        (institution) =>
          !contacts.some(
            (contact) => contact.institutionKey === institution.key,
          ),
      ),
    [contacts],
  );

  const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const query = normalizeSearch(search.trim());
  const visibleContacts = contacts.filter((contact) => {
    if (selectedInstitution && contact.institutionKey !== selectedInstitution) return false;
    const text = [contact.person, contact.role, contact.description,
      CONTACT_INSTITUTION_BY_KEY.get(contact.institutionKey)?.label,
      contact.phone?.display, contact.phone?.href, ...(contact.emails ?? []).flatMap((email) => [email.value, email.label])
    ].filter(Boolean).join(" ");
    return !query || normalizeSearch(text).includes(query) ||
      (/^[+\d\s]+$/.test(query) && Boolean(contact.phone?.href.replace(/\s/g, "").includes(query.replace(/\s/g, ""))));
  });

  useEffect(() => {
    if (!initialContactId) return;
    const contact = contacts.find((item) => item.id === initialContactId);
    if (!contact) return;

    setView("contacts");
    setSelectedInstitution(contact.institutionKey);
    const scrollTimer = window.setTimeout(() => {
      highlightedContactRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 120);
    return () => window.clearTimeout(scrollTimer);
  }, [contacts, initialContactId]);


  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void fetchAuthedJsonOrThrow<ContactDirectoryResponse>(
      user,
      "/api/contacts",
      { method: "GET" },
    )
      .then((payload) => {
        if (cancelled) return;
        if (Array.isArray(payload.contacts)) setContacts(payload.contacts);
        setCanManage(payload.canManage === true);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("Načtení adresáře kontaktů selhalo:", error);
        setStatus({
          tone: "error",
          text: "Nepodařilo se načíst aktuální změny. Zobrazují se výchozí kontakty.",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const persistContacts = async (nextContacts: DirectoryContact[]) => {
    if (!user || !canManage || saving) return false;
    setSaving(true);
    setStatus(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<ContactDirectoryResponse>(
        user,
        "/api/contacts",
        {
          method: "PUT",
          body: JSON.stringify({ contacts: nextContacts }),
        },
      );
      setContacts(
        Array.isArray(payload.contacts) ? payload.contacts : nextContacts,
      );
      setStatus({ tone: "success", text: "Kontakty byly uloženy." });
      return true;
    } catch (error) {
      setStatus({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Změny kontaktů se nepodařilo uložit.",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openNewContact = (
    institutionKey: string,
    returnView: ModalView = "contacts",
  ) => {
    setEditingContactId(null);
    setDraft(emptyDraft(institutionKey));
    setFormReturnView(returnView);
    setStatus(null);
    setView("contact-form");
  };

  const openExistingContact = (contact: DirectoryContact) => {
    setEditingContactId(contact.id);
    setDraft(draftFromContact(contact));
    setFormReturnView("contacts");
    setStatus(null);
    setView("contact-form");
  };

  const saveDraft = async () => {
    const person = draft.person.trim();
    const role = draft.role.trim();
    const description = draft.description.trim();
    const phone = draft.phone.trim();
    const email1 = draft.email1.trim();
    const email2 = draft.email2.trim();
    if (!person && !role && !description) {
      setStatus({
        tone: "error",
        text: "Vyplňte jméno, roli nebo popis kontaktu.",
      });
      return;
    }
    if (!phone && !email1 && !email2) {
      setStatus({
        tone: "error",
        text: "Vyplňte alespoň telefon nebo e-mail.",
      });
      return;
    }

    const previous = editingContactId
      ? contacts.find((contact) => contact.id === editingContactId)
      : null;
    const emails: ContactEmail[] = [];
    if (email1) {
      emails.push({
        value: email1,
        ...(draft.email1Label.trim()
          ? { label: draft.email1Label.trim() }
          : {}),
        ...(previous?.emails?.[0]?.value === email1 &&
        previous.emails[0].cc
          ? { cc: previous.emails[0].cc }
          : {}),
      });
    }
    if (email2) {
      emails.push({
        value: email2,
        ...(draft.email2Label.trim()
          ? { label: draft.email2Label.trim() }
          : {}),
        ...(draft.email2Cc.trim() ? { cc: draft.email2Cc.trim() } : {}),
      });
    }

    const nextContact: DirectoryContact = {
      id: editingContactId ?? newContactId(draft.institutionKey),
      institutionKey: draft.institutionKey,
      ...(person ? { person } : {}),
      ...(role ? { role } : {}),
      ...(description ? { description } : {}),
      ...(phone
        ? { phone: { display: phone, href: phoneHref(phone) } }
        : {}),
      ...(emails.length > 0 ? { emails } : {}),
      ...(draft.notice.trim() ? { notice: draft.notice.trim() } : {}),
    };

    const nextContacts = editingContactId
      ? contacts.map((contact) =>
          contact.id === editingContactId ? nextContact : contact,
        )
      : [...contacts, nextContact];
    if (!(await persistContacts(nextContacts))) return;

    setSelectedInstitution(draft.institutionKey);
    setView("contacts");
    setEditingContactId(null);
  };

  const deleteCurrentContact = async () => {
    if (!editingContactId || saving) return;
    const contact = contacts.find((item) => item.id === editingContactId);
    const institution = contact
      ? CONTACT_INSTITUTION_BY_KEY.get(contact.institutionKey)
      : null;
    if (
      !window.confirm(
        `Opravdu chcete odstranit tento kontakt${
          institution ? ` z instituce ${institution.label}` : ""
        }?`,
      )
    ) {
      return;
    }

    const nextContacts = contacts.filter(
      (item) => item.id !== editingContactId,
    );
    if (!(await persistContacts(nextContacts))) return;

    const institutionStillExists = nextContacts.some(
      (item) => item.institutionKey === contact?.institutionKey,
    );
    if (!institutionStillExists) setSelectedInstitution(null);
    setEditingContactId(null);
    setView("contacts");
  };

  const showBackButton = view !== "contacts";
  const title =
    view === "csob-alternatives"
      ? "Alternativní kontakty ČSOB"
      : view === "institution-picker"
        ? "Přidat instituci"
        : view === "contact-form"
          ? editingContactId
            ? "Upravit kontakt"
            : "Nový kontakt"
          : "Kontakty";
  const subtitle =
    view === "csob-alternatives"
      ? "Regionální manažeři a další kontakty, na které se můžete obrátit, pokud Daniel Vlk není dostupný."
      : view === "institution-picker"
        ? "Vyberte spolupracující instituci, která zatím v kontaktech není. Logo i vzhled karty se doplní automaticky."
        : view === "contact-form"
          ? "Vyplňte obsah kontaktní karty. Povinný je alespoň telefon nebo e-mail."
          : "Přímé kontakty na obchodní a administrativní podporu partnerských institucí.";

  const returnFromCurrentView = () => {
    if (view === "contact-form") {
      setView(formReturnView);
      setStatus(null);
      return;
    }
    setView("contacts");
    setStatus(null);
  };

  return (
    <div className={ui.overlay}>
      <button type="button" className={ui.backdrop} onClick={onClose} aria-label="Zavřít kontakty" tabIndex={-1} />
      <section ref={panelRef} tabIndex={-1} className={ui.panel} role="dialog" aria-modal="true" aria-labelledby="contacts-modal-title">
        <header className={ui.header}>
          <span className={ui.headerIcon}><ContactRound size={22} strokeWidth={1.7} aria-hidden="true" /></span>
          <div className={ui.heading}>
            {showBackButton ? <button type="button" onClick={returnFromCurrentView} className={ui.back}><ArrowLeft size={13} />Zpět na kontakty</button> : <p className={ui.eyebrow}>Adresář podpory</p>}
            <h2 id="contacts-modal-title" className={ui.title}>{title}</h2>
            <p className={ui.subtitle}>{subtitle}</p>
          </div>
          <div className={ui.headerActions}>
            {view === "contacts" && canManage && <button type="button" onClick={() => { setEditingMode((current) => !current); setStatus(null); }} className={ui.edit} aria-pressed={editingMode} aria-label={editingMode ? "Dokončit úpravy" : "Editovat kontakty"}>
              {editingMode ? <Check size={16} /> : <Pencil size={16} />}<span>{editingMode ? "Hotovo" : "Editovat"}</span>
            </button>}
            <button type="button" onClick={onClose} className={ui.close} aria-label="Zavřít"><X size={18} /></button>
          </div>
        </header>

        {view === "contacts" ? (
          <>
            <nav className={ui.toolbar} aria-label="Filtrovat kontakty podle instituce">
              <div className={ui.searchRow}>
                <div className={ui.search}><Search size={17} aria-hidden="true" />
                  <input aria-label="Hledat kontakt" placeholder="Jméno, instituce, telefon nebo e-mail…" value={search} onChange={(event) => setSearch(event.target.value)} />
                  {search && <button type="button" onClick={() => setSearch("")} aria-label="Vymazat hledání"><X size={15} /></button>}
                </div>
                <span className={ui.count}>Kontakty · {visibleContacts.length} / {contacts.length}</span>
              </div>
              <div className={ui.filters}>
                <button type="button" onClick={() => setSelectedInstitution(null)} aria-pressed={selectedInstitution === null} className={ui.filter}>Všechny <span>{contacts.length}</span></button>
                {institutionsWithContacts.map((institution) => (
                  <button key={institution.key} type="button" onClick={() => setSelectedInstitution(institution.key)} aria-pressed={selectedInstitution === institution.key} className={ui.filter}>
                    {institution.label}<span>{contacts.filter((contact) => contact.institutionKey === institution.key).length}</span>
                  </button>
                ))}
              </div>

              {editingMode ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/80 pt-3">
                  <p className="mr-auto text-xs font-semibold text-slate-500">
                    Režim úprav je aktivní. Kliknutím na tužku upravíte kartu.
                  </p>
                  {selectedInstitution ? (
                    <button
                      type="button"
                      onClick={() => openNewContact(selectedInstitution)}
                      className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-700 transition hover:border-violet-300 hover:bg-violet-50"
                    >
                      <Plus className="h-4 w-4" />
                      Přidat kontakt
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setStatus(null);
                      setView("institution-picker");
                    }}
                    disabled={availableInstitutions.length === 0}
                    className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-3.5 py-2 text-xs font-black text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Building2 className="h-4 w-4" />
                    Přidat instituci
                  </button>
                </div>
              ) : null}

              {loading ? (
                <p className="mt-2 text-xs font-semibold text-slate-400">
                  Načítám aktuální kontakty…
                </p>
              ) : null}
              {status ? (
                <p
                  className={`mt-2 text-xs font-bold ${
                    status.tone === "error"
                      ? "text-rose-700"
                      : "text-emerald-700"
                  }`}
                  role="status"
                >
                  {status.text}
                </p>
              ) : null}
            </nav>

            <div className={`${ui.content} ${styles.grid}`}>
              {visibleContacts.map((contact) => {
                const institution = CONTACT_INSTITUTION_BY_KEY.get(
                  contact.institutionKey,
                );
                if (!institution) return null;
                const contactTitle =
                  contact.person ??
                  contact.description ??
                  contact.role ??
                  institution.label;
                const institutionIsTitle = contactTitle === institution.label;
                const showRoleBadge =
                  Boolean(contact.role) && contactTitle !== contact.role;
                const showDescription = Boolean(
                  contact.person && contact.description,
                );

                return (
                  <article
                    key={contact.id}
                    ref={
                      contact.id === initialContactId
                        ? highlightedContactRef
                        : undefined
                    }
                    className={styles.card}
                    data-highlighted={contact.id === initialContactId || undefined}
                  >
                    <div>
                      <div className={styles.cardHeader}>
                        <span className={styles.logo}><Image src={institution.logoPath} alt="" width={64} height={44} /></span>
                        <div className={styles.identity}>
                          {!institutionIsTitle && <p className={styles.institution}>{institution.label}</p>}
                          <h3 className={styles.name}>{contactTitle}</h3>
                          {showRoleBadge && <span className={styles.role}>{contact.role}</span>}
                        </div>
                        {editingMode && <button type="button" onClick={() => openExistingContact(contact)} className={styles.editCard} aria-label={`Upravit kontakt ${contactTitle}`}><Pencil size={15} /></button>}
                      </div>

                      {showDescription ? (
                        <p className={styles.description}>
                          {contact.description}
                        </p>
                      ) : null}

                      <div className={styles.methods}>
                        {contact.phone && <a href={`tel:${contact.phone.href}`} className={styles.method}>
                          <span className={styles.methodIcon}><Phone size={16} aria-hidden="true" /></span>
                          <span className={styles.methodText}>{contact.phone.display}</span>
                          <ArrowUpRight size={15} className={styles.methodArrow} aria-hidden="true" />
                        </a>}
                        {contact.emails?.map((email) => <a key={`${email.value}-${email.label ?? ""}`} href={mailtoHref(email)} className={styles.method}>
                          <span className={styles.methodIcon}><Mail size={16} aria-hidden="true" /></span>
                          <span className={styles.methodText}>{email.label && <small>{email.label}</small>}{email.value}</span>
                          <ArrowUpRight size={15} className={styles.methodArrow} aria-hidden="true" />
                        </a>)}
                      </div>

                      {contact.id === "csob" ? (
                        <div className="mt-3 border-t border-sky-200/80 pt-3">
                          <p className="text-xs font-bold leading-5 text-slate-600">
                            V případě, že se nemůžete dovolat Vlkovi
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setStatus(null);
                              setView("csob-alternatives");
                            }}
                            className="group mt-2 inline-flex items-center gap-2 rounded-xl bg-sky-700 px-3.5 py-2 text-xs font-black text-white shadow-sm transition hover:bg-sky-800 hover:shadow-md"
                          >
                            Zobrazit alternativy
                            <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                          </button>
                        </div>
                      ) : null}

                      {contact.notice ? (
                        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold leading-5 text-amber-950">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                          <p>{contact.notice}</p>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
              {visibleContacts.length === 0 && <div className={ui.empty}><Search size={28} /><p>Žádný kontakt neodpovídá hledání.</p><button type="button" onClick={() => { setSearch(""); setSelectedInstitution(null); }}>Zobrazit všechny kontakty</button></div>}
            </div>
          </>
        ) : null}

        {view === "csob-alternatives" ? (
          <div className={ui.content}>
            <div className="relative isolate overflow-hidden rounded-[24px] border border-sky-200 bg-white p-4 shadow-[0_16px_40px_rgba(3,105,161,0.1)] sm:p-5">
              <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-80 opacity-[0.07] mix-blend-multiply">
                <Image
                  src="/icons/csb.png"
                  alt=""
                  fill
                  sizes="320px"
                  className="object-contain"
                  aria-hidden="true"
                />
              </div>
              <div className="relative grid grid-cols-1 gap-x-8 gap-y-0 md:grid-cols-2">
                {CSOB_ALTERNATIVES.map((contact) => (
                  <article
                    key={contact.email}
                    className="min-w-0 border-b border-slate-200/90 py-4 first:pt-0 md:[&:nth-child(2)]:pt-0"
                  >
                    <h3 className="text-base font-black tracking-[-0.015em] text-slate-950">
                      {contact.name}
                    </h3>
                    <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-sky-800">
                      <MapPin className="h-4 w-4 shrink-0 text-sky-600" />
                      {contact.region}
                    </p>
                    <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-5">
                      <a
                        href={`tel:${contact.phone.href}`}
                        className="group inline-flex min-w-0 items-center gap-2 py-1 text-sm font-bold text-slate-700 transition hover:text-sky-800"
                      >
                        <Phone className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-sky-600" />
                        {contact.phone.display}
                      </a>
                      <a
                        href={`mailto:${contact.email}`}
                        className="group inline-flex min-w-0 items-center gap-2 py-1 text-sm font-bold text-slate-700 transition hover:text-sky-800"
                      >
                        <Mail className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-sky-600" />
                        <span className="break-all">{contact.email}</span>
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {view === "institution-picker" ? (
          <div className={ui.content}>
            {availableInstitutions.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {availableInstitutions.map((institution) => (
                  <button
                    key={institution.key}
                    type="button"
                    onClick={() =>
                      openNewContact(institution.key, "institution-picker")
                    }
                    className="group relative isolate min-h-36 overflow-hidden rounded-[22px] border border-slate-200 bg-white p-5 text-left shadow-[0_12px_28px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-[0_18px_36px_rgba(15,23,42,0.13)]"
                  >
                    <div
                      className={`pointer-events-none absolute inset-0 ${institution.accentClass}`}
                    />
                    <div className="pointer-events-none absolute -right-8 -top-8 h-44 w-64 opacity-[0.13] mix-blend-multiply transition group-hover:scale-105 group-hover:opacity-[0.18]">
                      <Image
                        src={institution.logoPath}
                        alt=""
                        fill
                        sizes="256px"
                        className="object-contain"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="relative flex h-full flex-col justify-between gap-8">
                      <h3 className="max-w-[75%] text-xl font-black tracking-[-0.02em] text-slate-950">
                        {institution.label}
                      </h3>
                      <span className="inline-flex w-fit items-center gap-2 rounded-xl bg-violet-700 px-3 py-2 text-xs font-black text-white shadow-sm">
                        <Plus className="h-4 w-4" />
                        Vybrat instituci
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-[22px] border border-slate-200 bg-white p-8 text-center shadow-sm">
                <Check className="mx-auto h-10 w-10 text-emerald-600" />
                <h3 className="mt-3 text-lg font-black text-slate-950">
                  Všechny instituce už jsou přidané
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Další kartu přidáte po výběru instituce ve filtrech.
                </p>
              </div>
            )}
          </div>
        ) : null}

        {view === "contact-form" ? (
          <div className={ui.content}>
            {(() => {
              const institution = CONTACT_INSTITUTION_BY_KEY.get(
                draft.institutionKey,
              );
              if (!institution) return null;

              const inputClass =
                "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-violet-400 focus:ring-4 focus:ring-violet-100";

              return (
                <div className="relative isolate overflow-hidden rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.09)] sm:p-6">
                  <div
                    className={`pointer-events-none absolute inset-0 ${institution.accentClass}`}
                  />
                  <div className="pointer-events-none absolute -right-8 -top-10 h-52 w-80 opacity-[0.08] mix-blend-multiply">
                    <Image
                      src={institution.logoPath}
                      alt=""
                      fill
                      sizes="320px"
                      className="object-contain"
                      aria-hidden="true"
                    />
                  </div>

                  <form
                    className="relative"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveDraft();
                    }}
                  >
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">
                          Instituce
                        </p>
                        <h3 className="mt-1 text-2xl font-black tracking-[-0.025em] text-slate-950">
                          {institution.label}
                        </h3>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-bold text-slate-500">
                        {editingContactId ? "Úprava karty" : "Nová karta"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <label className="text-xs font-black text-slate-600">
                        Jméno / kontaktní osoba
                        <input
                          value={draft.person}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              person: event.target.value,
                            }))
                          }
                          maxLength={120}
                          placeholder="např. Jana Nováková"
                          className={inputClass}
                        />
                      </label>
                      <label className="text-xs font-black text-slate-600">
                        Role / štítek
                        <input
                          value={draft.role}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              role: event.target.value,
                            }))
                          }
                          maxLength={80}
                          placeholder="např. KAM"
                          className={inputClass}
                        />
                      </label>
                      <label className="text-xs font-black text-slate-600 sm:col-span-2">
                        Agenda / popis
                        <textarea
                          value={draft.description}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                          maxLength={500}
                          rows={2}
                          placeholder="Co tento kontakt řeší"
                          className={`${inputClass} resize-y`}
                        />
                      </label>
                      <label className="text-xs font-black text-slate-600">
                        Telefon
                        <input
                          value={draft.phone}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              phone: event.target.value,
                            }))
                          }
                          maxLength={40}
                          inputMode="tel"
                          placeholder="+420 123 456 789"
                          className={inputClass}
                        />
                      </label>
                      <div className="hidden sm:block" />
                      <label className="text-xs font-black text-slate-600">
                        První e-mail
                        <input
                          type="email"
                          value={draft.email1}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              email1: event.target.value,
                            }))
                          }
                          maxLength={180}
                          placeholder="kontakt@instituce.cz"
                          className={inputClass}
                        />
                      </label>
                      <label className="text-xs font-black text-slate-600">
                        Popisek prvního e-mailu
                        <input
                          value={draft.email1Label}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              email1Label: event.target.value,
                            }))
                          }
                          maxLength={80}
                          placeholder="např. Administrace"
                          className={inputClass}
                        />
                      </label>
                      <label className="text-xs font-black text-slate-600">
                        Druhý e-mail
                        <input
                          type="email"
                          value={draft.email2}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              email2: event.target.value,
                            }))
                          }
                          maxLength={180}
                          placeholder="podpora@instituce.cz"
                          className={inputClass}
                        />
                      </label>
                      <label className="text-xs font-black text-slate-600">
                        Popisek druhého e-mailu
                        <input
                          value={draft.email2Label}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              email2Label: event.target.value,
                            }))
                          }
                          maxLength={80}
                          placeholder="např. Podpora"
                          className={inputClass}
                        />
                      </label>
                      <label className="text-xs font-black text-slate-600 sm:col-span-2">
                        Automaticky přidat do kopie (CC)
                        <input
                          type="email"
                          value={draft.email2Cc}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              email2Cc: event.target.value,
                            }))
                          }
                          maxLength={180}
                          placeholder="volitelné — vztahuje se ke druhému e-mailu"
                          className={inputClass}
                        />
                      </label>
                      <label className="text-xs font-black text-slate-600 sm:col-span-2">
                        Důležité upozornění
                        <textarea
                          value={draft.notice}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              notice: event.target.value,
                            }))
                          }
                          maxLength={500}
                          rows={2}
                          placeholder="Volitelné upozornění zobrazené ve žlutém boxu"
                          className={`${inputClass} resize-y`}
                        />
                      </label>
                    </div>

                    {status ? (
                      <p
                        className={`mt-4 text-sm font-bold ${
                          status.tone === "error"
                            ? "text-rose-700"
                            : "text-emerald-700"
                        }`}
                        role="status"
                      >
                        {status.text}
                      </p>
                    ) : null}

                    <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5">
                      <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-wait disabled:opacity-60"
                      >
                        <Save className="h-4 w-4" />
                        {saving ? "Ukládám…" : "Uložit kontakt"}
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={returnFromCurrentView}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                      >
                        Zrušit
                      </button>
                      {editingContactId ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void deleteCurrentContact()}
                          className="ml-auto inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          Odstranit kartu
                        </button>
                      ) : null}
                    </div>
                  </form>
                </div>
              );
            })()}
          </div>
        ) : null}
      </section>
    </div>
  );
}
