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
  Trash2,
  X,
} from "lucide-react";
import Image from "next/image";
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

const contactCardTone = (institutionKey: string) => {
  if (institutionKey === "bohemika") {
    return {
      border: "border-sky-200/90",
      bar: "bg-[linear-gradient(90deg,#0ea5e9_0%,#7c3aed_100%)]",
      badge: "border-sky-200 bg-sky-50 text-sky-800",
      icon: "bg-sky-100 text-sky-700",
    };
  }
  if (["allianz", "csob", "cpp", "axa", "conseq"].includes(institutionKey)) {
    return {
      border: "border-blue-200/90",
      bar: "bg-[linear-gradient(90deg,#2563eb_0%,#38bdf8_100%)]",
      badge: "border-blue-200 bg-blue-50 text-blue-800",
      icon: "bg-blue-100 text-blue-700",
    };
  }
  if (["kooperativa", "pillow"].includes(institutionKey)) {
    return {
      border: "border-emerald-200/90",
      bar: "bg-[linear-gradient(90deg,#059669_0%,#4ade80_100%)]",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
      icon: "bg-emerald-100 text-emerald-700",
    };
  }
  if (["investika", "slavia"].includes(institutionKey)) {
    return {
      border: "border-amber-200/90",
      bar: "bg-[linear-gradient(90deg,#d97706_0%,#fbbf24_100%)]",
      badge: "border-amber-200 bg-amber-50 text-amber-800",
      icon: "bg-amber-100 text-amber-700",
    };
  }
  if (["comfort-commodity", "maxima"].includes(institutionKey)) {
    return {
      border: "border-rose-200/90",
      bar: "bg-[linear-gradient(90deg,#e11d48_0%,#fb7185_100%)]",
      badge: "border-rose-200 bg-rose-50 text-rose-800",
      icon: "bg-rose-100 text-rose-700",
    };
  }
  return {
    border: "border-violet-200/90",
    bar: "bg-[linear-gradient(90deg,#7c3aed_0%,#c084fc_100%)]",
    badge: "border-violet-200 bg-violet-50 text-violet-800",
    icon: "bg-violet-100 text-violet-700",
  };
};

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

  const visibleContacts = selectedInstitution
    ? contacts.filter(
        (contact) => contact.institutionKey === selectedInstitution,
      )
    : contacts;

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
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

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
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contacts-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Zavřít kontakty"
      />

      <section className="relative z-10 my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[30px] border border-white/75 bg-[linear-gradient(155deg,#ffffff_0%,#f8fafc_55%,#f5f3ff_100%)] shadow-[0_34px_100px_rgba(2,6,23,0.42)] sm:max-h-[calc(100dvh-3rem)]">
        <header className="relative border-b border-slate-200/90 px-5 py-5 pr-16 sm:px-7 sm:py-6 sm:pr-20">
          <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-violet-200/45 blur-3xl" />
          <div className="relative">
            {showBackButton ? (
              <button
                type="button"
                onClick={returnFromCurrentView}
                className="group inline-flex items-center gap-2 text-sm font-extrabold text-violet-700 transition hover:text-violet-950"
              >
                <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-0.5" />
                Zpět na kontakty
              </button>
            ) : (
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-700">
                Obecné
              </p>
            )}
            <h2
              id="contacts-modal-title"
              className="mt-1.5 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-4xl"
            >
              {title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
              {subtitle}
            </p>
          </div>

          {view === "contacts" && canManage ? (
            <button
              type="button"
              onClick={() => {
                setEditingMode((current) => !current);
                setStatus(null);
              }}
              className={`absolute right-[4.4rem] top-4 inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-extrabold shadow-sm transition sm:right-[5.1rem] sm:top-6 ${
                editingMode
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  : "border-violet-200 bg-white text-violet-700 hover:border-violet-300 hover:bg-violet-50"
              }`}
            >
              {editingMode ? (
                <Check className="h-4 w-4" />
              ) : (
                <Pencil className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {editingMode ? "Hotovo" : "Editovat"}
              </span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 sm:right-6 sm:top-6"
            aria-label="Zavřít"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {view === "contacts" ? (
          <>
            <nav
              className="border-b border-slate-200/80 bg-white/70 px-4 py-3 backdrop-blur-sm sm:px-6"
              aria-label="Filtrovat kontakty podle instituce"
            >
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedInstitution(null)}
                  aria-pressed={selectedInstitution === null}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-extrabold transition ${
                    selectedInstitution === null
                      ? "border-violet-700 bg-violet-700 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800"
                  }`}
                >
                  Všechny
                  <span
                    className={`text-[10px] ${
                      selectedInstitution === null
                        ? "text-violet-100"
                        : "text-slate-400"
                    }`}
                  >
                    {contacts.length}
                  </span>
                </button>
                {institutionsWithContacts.map((institution) => {
                  const isActive = selectedInstitution === institution.key;
                  const count = contacts.filter(
                    (contact) =>
                      contact.institutionKey === institution.key,
                  ).length;

                  return (
                    <button
                      key={institution.key}
                      type="button"
                      onClick={() => setSelectedInstitution(institution.key)}
                      aria-pressed={isActive}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-extrabold transition ${
                        isActive
                          ? "border-violet-700 bg-violet-700 text-white shadow-sm"
                          : "border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800"
                      }`}
                    >
                      {institution.label}
                      <span
                        className={`text-[10px] ${
                          isActive ? "text-violet-100" : "text-slate-400"
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
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

            <div className="grid min-h-0 grid-cols-1 auto-rows-max items-start gap-4 overflow-y-auto p-4 sm:grid-cols-2 sm:p-6">
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
                const cardTone = contactCardTone(contact.institutionKey);

                return (
                  <article
                    key={contact.id}
                    ref={
                      contact.id === initialContactId
                        ? highlightedContactRef
                        : undefined
                    }
                    className={`group/contact relative isolate h-auto min-w-0 scroll-m-6 overflow-hidden rounded-[22px] border bg-white/95 p-4 pt-5 ring-1 ring-slate-950/[0.035] transition duration-200 hover:-translate-y-1 hover:ring-slate-950/[0.07] sm:p-5 sm:pt-6 ${
                      contact.id === initialContactId
                        ? "border-violet-400 shadow-[0_22px_48px_rgba(124,58,237,0.24)] ring-2 ring-violet-300/80"
                        : `${cardTone.border} shadow-[0_16px_34px_rgba(15,23,42,0.11)] hover:shadow-[0_24px_48px_rgba(15,23,42,0.16)]`
                    }`}
                  >
                    <div
                      className={`pointer-events-none absolute inset-x-0 top-0 h-1 ${cardTone.bar}`}
                      aria-hidden="true"
                    />
                    <div
                      className={`pointer-events-none absolute inset-0 ${institution.accentClass}`}
                    />
                    <div className="pointer-events-none absolute -right-8 -top-8 h-48 w-72 opacity-[0.13] mix-blend-multiply transition-opacity duration-200 group-hover/contact:opacity-[0.18] sm:-right-5 sm:h-56 sm:w-80">
                      <Image
                        src={institution.logoPath}
                        alt=""
                        fill
                        sizes="320px"
                        className="object-contain"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="relative">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 pr-2">
                          {!institutionIsTitle ? (
                            <p className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${cardTone.badge}`}>
                              <Building2 className="h-3 w-3" aria-hidden="true" />
                              {institution.label}
                            </p>
                          ) : null}
                          <h3
                            className={`${institutionIsTitle ? "" : "mt-2"} text-xl font-black leading-6 tracking-[-0.03em] text-slate-950 sm:text-[1.35rem]`}
                          >
                            {contactTitle}
                          </h3>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {showRoleBadge ? (
                            <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-violet-700">
                              {contact.role}
                            </span>
                          ) : null}
                          {editingMode ? (
                            <button
                              type="button"
                              onClick={() => openExistingContact(contact)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-500 shadow-sm transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                              aria-label={`Upravit kontakt ${contactTitle}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {showDescription ? (
                        <p className="mt-2.5 border-l-2 border-slate-300 pl-3 text-xs font-semibold leading-5 text-slate-600">
                          {contact.description}
                        </p>
                      ) : null}

                      <div className="mt-4 space-y-2">
                        {contact.phone ? (
                          <a
                            href={`tel:${contact.phone.href}`}
                            className="group flex min-h-11 items-center gap-2.5 rounded-xl border border-slate-200/90 bg-white/85 px-2.5 py-1.5 text-sm font-extrabold text-slate-800 shadow-[0_5px_14px_rgba(15,23,42,0.05)] transition hover:border-violet-300 hover:bg-violet-50/80 hover:text-violet-900 hover:shadow-[0_8px_18px_rgba(109,40,217,0.10)]"
                          >
                            <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition group-hover:bg-violet-100 group-hover:text-violet-700 ${cardTone.icon}`}>
                              <Phone className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              {contact.phone.display}
                            </span>
                            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400 transition group-hover:bg-white group-hover:text-violet-600">
                              <ArrowUpRight className="h-4 w-4" />
                            </span>
                          </a>
                        ) : null}

                        {contact.emails?.map((email) => (
                          <a
                            key={`${email.value}-${email.label ?? ""}`}
                            href={mailtoHref(email)}
                            className="group flex min-h-11 items-center gap-2.5 rounded-xl border border-slate-200/90 bg-white/85 px-2.5 py-1.5 text-slate-800 shadow-[0_5px_14px_rgba(15,23,42,0.05)] transition hover:border-violet-300 hover:bg-violet-50/80 hover:text-violet-900 hover:shadow-[0_8px_18px_rgba(109,40,217,0.10)]"
                          >
                            <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition group-hover:bg-violet-100 group-hover:text-violet-700 ${cardTone.icon}`}>
                              <Mail className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              {email.label ? (
                                <span className="block text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                                  {email.label}
                                </span>
                              ) : null}
                              <span className="block break-all text-xs font-extrabold sm:text-[13px]">
                                {email.value}
                              </span>
                            </span>
                            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400 transition group-hover:bg-white group-hover:text-violet-600">
                              <ArrowUpRight className="h-4 w-4" />
                            </span>
                          </a>
                        ))}
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
            </div>
          </>
        ) : null}

        {view === "csob-alternatives" ? (
          <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
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
          <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
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
          <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
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
