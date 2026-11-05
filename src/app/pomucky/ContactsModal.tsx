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
  UsersRound,
  ShieldCheck,
  UserRoundPlus,
  Settings2,
  ChevronDown,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import Image from "next/image";
import ui from "./directoryModal.module.css";
import styles from "./contactsModal.module.css";
import { useDirectoryDialog } from "./useDirectoryDialog";
import { useEffect, useRef, useState } from "react";

import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import {
  CONTACT_INSTITUTION_BY_KEY,
  CONTACT_INSTITUTIONS,
  CONTACT_DIRECTORY_CHANGED_EVENT,
  type ContactAudience,
  type ContactDirectoryGroup,
  type ContactGroupMember,
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
  groups?: ContactDirectoryGroup[];
  canManage?: boolean;
  revision?: number;
  publicVersion?: string;
  error?: string;
};

type ModalView =
  | "contacts"
  | "csob-alternatives"
  | "institution-picker"
  | "contact-form"
  | "groups";

type ContactDraft = {
  institutionKey: string;
  person: string;
  role: string;
  description: string;
  phone: string;
  emails: { value: string; label: string; cc: string }[];
  notice: string;
  audience: ContactAudience;
};

type ContactMutation =
  | { operation: "saveContact"; contact: DirectoryContact }
  | { operation: "deleteContact"; contactId: string }
  | {
      operation: "saveGroup";
      group: { id?: string; name: string; memberUids: string[] };
    }
  | { operation: "deleteGroup"; groupId: string };

type GroupDraft = { id?: string; name: string; members: ContactGroupMember[] };

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
  cc ? `mailto:${value}?cc=${encodeURIComponent(cc)}` : `mailto:${value}`;

const emptyDraft = (institutionKey: string): ContactDraft => ({
  institutionKey,
  person: "",
  role: "",
  description: "",
  phone: "",
  emails: [{ value: "", label: "", cc: "" }],
  notice: "",
  audience: { type: "everyone" },
});

const draftFromContact = (contact: DirectoryContact): ContactDraft => ({
  institutionKey: contact.institutionKey,
  person: contact.person ?? "",
  role: contact.role ?? "",
  description: contact.description ?? "",
  phone: contact.phone?.display ?? "",
  emails: contact.emails?.length
    ? contact.emails.map((email) => ({
        value: email.value,
        label: email.label ?? "",
        cc: email.cc ?? "",
      }))
    : [{ value: "", label: "", cc: "" }],
  notice: contact.notice ?? "",
  audience: contact.audience ?? { type: "everyone" },
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
  const identity = user ? `${user.uid}:${user.email ?? ""}` : "";
  const [contacts, setContacts] = useState<DirectoryContact[]>([]);
  const [groups, setGroups] = useState<ContactDirectoryGroup[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [publicVersion, setPublicVersion] = useState("");
  const [view, setView] = useState<ModalView>("contacts");
  const [formReturnView, setFormReturnView] = useState<ModalView>("contacts");
  const [groupReturnView, setGroupReturnView] = useState<
    "contacts" | "contact-form"
  >("contacts");
  const [selectedInstitution, setSelectedInstitution] = useState<string | null>(
    null,
  );
  const [audienceFilter, setAudienceFilter] = useState("all");
  const [canManage, setCanManage] = useState(false);
  const [editingMode, setEditingMode] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ContactDraft>(() =>
    emptyDraft("bohemika"),
  );
  const [groupDraft, setGroupDraft] = useState<GroupDraft>({
    name: "",
    members: [],
  });
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<ContactGroupMember[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);
  const [memberSearchError, setMemberSearchError] = useState("");
  const [loading, setLoading] = useState(Boolean(user));
  const [reloadVersion, setReloadVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [status, setStatus] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);
  const [search, setSearch] = useState("");
  const panelRef = useRef<HTMLElement>(null);
  const highlightedContactRef = useRef<HTMLElement | null>(null);
  const contactContentRef = useRef<HTMLDivElement>(null);
  const sessionEpoch = useRef(0);
  const highlightedInitial = useRef("");
  useDirectoryDialog(panelRef, onClose);

  // Hide the previous account's data immediately, before effects clear its state.
  const sessionReady = Boolean(user) && loadedFor === identity;
  const currentContacts = sessionReady ? contacts : [];
  const currentGroups = sessionReady ? groups : [];
  const canEdit = sessionReady && canManage && !loading;

  useEffect(() => {
    sessionEpoch.current += 1;
    highlightedInitial.current = "";
    setContacts([]);
    setGroups([]);
    setLoadedFor(null);
    setCanManage(false);
    setRevision(0);
    setPublicVersion("");
    setView("contacts");
    setEditingMode(false);
    setEditingContactId(null);
    setDraft(emptyDraft("bohemika"));
    setGroupDraft({ name: "", members: [] });
    setSearch("");
    setSelectedInstitution(null);
    setAudienceFilter("all");
    setMemberQuery("");
    setMemberResults([]);
    setMemberSearchError("");
    setStatus(null);
    setSaving(false);
    setNeedsRefresh(false);
    return () => {
      sessionEpoch.current += 1;
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const epoch = sessionEpoch.current;
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setLoadedFor(null);
    setContacts([]);
    setGroups([]);
    setCanManage(false);
    void fetchAuthedJsonOrThrow<ContactDirectoryResponse>(
      user,
      "/api/contacts",
      { method: "GET", signal: controller.signal },
    )
      .then((payload) => {
        if (cancelled || epoch !== sessionEpoch.current) return;
        if (
          !Array.isArray(payload.contacts) ||
          !Array.isArray(payload.groups) ||
          !Number.isSafeInteger(payload.revision) ||
          typeof payload.publicVersion !== "string" ||
          !payload.publicVersion
        ) {
          throw new Error("Adresář se nepodařilo načíst.");
        }
        setContacts(payload.contacts);
        setGroups(payload.groups);
        setRevision(payload.revision!);
        setPublicVersion(payload.publicVersion);
        setCanManage(payload.canManage === true);
        setLoadedFor(identity);
        setNeedsRefresh(false);
        setStatus(null);
        if (payload.canManage !== true) {
          setEditingMode(false);
          setView("contacts");
          setDraft(emptyDraft("bohemika"));
          setGroupDraft({ name: "", members: [] });
        }
      })
      .catch(() => {
        if (cancelled || epoch !== sessionEpoch.current) return;
        setStatus({
          tone: "error",
          text: "Kontakty se nepodařilo načíst. Zkuste to prosím znovu.",
        });
      })
      .finally(() => {
        if (!cancelled && epoch === sessionEpoch.current) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [user, identity, reloadVersion]);

  useEffect(() => {
    const query = memberQuery.trim();
    setMemberResults([]);
    setMemberSearchError("");
    if (view !== "groups" || !user || !canEdit || query.length < 2) {
      setMemberSearching(false);
      return;
    }
    const epoch = sessionEpoch.current;
    const controller = new AbortController();
    let cancelled = false;
    setMemberSearching(true);
    const timer = window.setTimeout(() => {
      void fetchAuthedJsonOrThrow<{ users?: ContactGroupMember[] }>(
        user,
        "/api/contacts/members",
        {
          method: "POST",
          body: JSON.stringify({ query }),
          signal: controller.signal,
        },
      )
        .then((payload) => {
          if (!cancelled && epoch === sessionEpoch.current)
            setMemberResults(Array.isArray(payload.users) ? payload.users : []);
        })
        .catch(() => {
          if (!cancelled && epoch === sessionEpoch.current)
            setMemberSearchError(
              "Uživatele se nepodařilo vyhledat. Zkuste to znovu.",
            );
        })
        .finally(() => {
          if (!cancelled && epoch === sessionEpoch.current)
            setMemberSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [memberQuery, user, canEdit, view]);

  useEffect(() => {
    if (contactContentRef.current) contactContentRef.current.scrollTop = 0;
  }, [search, selectedInstitution, audienceFilter]);
  useEffect(() => {
    if (
      !initialContactId ||
      !sessionReady ||
      highlightedInitial.current === `${identity}:${initialContactId}`
    )
      return;
    const contact = contacts.find((item) => item.id === initialContactId);
    if (!contact) return;
    highlightedInitial.current = `${identity}:${initialContactId}`;
    setView("contacts");
    setSelectedInstitution(contact.institutionKey);
    const timer = window.setTimeout(
      () =>
        highlightedContactRef.current?.scrollIntoView?.({
          behavior: "smooth",
          block: "center",
        }),
      120,
    );
    return () => window.clearTimeout(timer);
  }, [contacts, initialContactId, identity, sessionReady]);

  const institutionsWithContacts = CONTACT_INSTITUTIONS.filter((institution) =>
    currentContacts.some(
      (contact) => contact.institutionKey === institution.key,
    ),
  );
  const availableInstitutions = CONTACT_INSTITUTIONS.filter(
    (institution) =>
      !currentContacts.some(
        (contact) => contact.institutionKey === institution.key,
      ),
  );
  const normalizeSearch = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const query = normalizeSearch(search.trim());
  const audienceLabel = (audience: ContactAudience | undefined) => {
    if (audience?.type === "specialists") return "Specialisti";
    if (audience?.type === "group")
      return (
        currentGroups.find((group) => group.id === audience.groupId)?.name ??
        "Vlastní skupina"
      );
    return "Všichni";
  };
  const visibleContacts = currentContacts.filter((contact) => {
    if (selectedInstitution && contact.institutionKey !== selectedInstitution)
      return false;
    const audience = contact.audience ?? { type: "everyone" };
    if (audienceFilter === "everyone" && audience.type !== "everyone")
      return false;
    if (audienceFilter === "specialists" && audience.type !== "specialists")
      return false;
    if (
      audienceFilter.startsWith("group:") &&
      (audience.type !== "group" ||
        audience.groupId !== audienceFilter.slice(6))
    )
      return false;
    const text = [
      contact.person,
      contact.role,
      contact.description,
      CONTACT_INSTITUTION_BY_KEY.get(contact.institutionKey)?.label,
      contact.phone?.display,
      contact.phone?.href,
      ...(contact.emails ?? []).flatMap((email) => [email.value, email.label]),
    ]
      .filter(Boolean)
      .join(" ");
    return (
      !query ||
      normalizeSearch(text).includes(query) ||
      (/^[+\d\s]+$/.test(query) &&
        Boolean(contact.phone?.href.includes(query.replace(/\s/g, ""))))
    );
  });

  const persistMutation = async (
    mutation: ContactMutation,
  ): Promise<ContactDirectoryResponse | null> => {
    if (!user || !canEdit || saving) return null;
    const epoch = sessionEpoch.current;
    setSaving(true);
    setStatus(null);
    setNeedsRefresh(false);
    try {
      const payload = await fetchAuthedJsonOrThrow<ContactDirectoryResponse>(
        user,
        "/api/contacts",
        {
          method: "PUT",
          body: JSON.stringify({ ...mutation, revision, publicVersion }),
        },
      );
      if (epoch !== sessionEpoch.current) return null;
      if (
        !Array.isArray(payload.contacts) ||
        !Array.isArray(payload.groups) ||
        !Number.isSafeInteger(payload.revision) ||
        typeof payload.publicVersion !== "string" ||
        !payload.publicVersion
      )
        throw new Error(
          "Server nevrátil aktuální adresář. Načtěte jej prosím znovu.",
        );
      setContacts(payload.contacts);
      setGroups(payload.groups);
      setRevision(payload.revision!);
      setPublicVersion(payload.publicVersion);
      setCanManage(payload.canManage === true);
      if (payload.canManage !== true) {
        setEditingMode(false);
        setView("contacts");
      }
      window.dispatchEvent(new Event(CONTACT_DIRECTORY_CHANGED_EVENT));
      return payload;
    } catch (error) {
      if (epoch !== sessionEpoch.current) return null;
      const conflict = Boolean(
        error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "contact-directory/revision-conflict",
      );
      setNeedsRefresh(conflict);
      setStatus({
        tone: "error",
        text: conflict
          ? "Adresář se mezitím změnil. Načtěte aktuální verzi a potom zkuste změnu uložit znovu. Rozepsané údaje zůstanou zachované."
          : error instanceof Error
            ? error.message
            : "Změnu se nepodařilo uložit.",
      });
      return null;
    } finally {
      if (epoch === sessionEpoch.current) setSaving(false);
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
    setNeedsRefresh(false);
    setView("contact-form");
  };
  const openExistingContact = (contact: DirectoryContact) => {
    setEditingContactId(contact.id);
    setDraft(draftFromContact(contact));
    setFormReturnView("contacts");
    setStatus(null);
    setNeedsRefresh(false);
    setView("contact-form");
  };
  const openGroups = (
    returnView: "contacts" | "contact-form",
    create = false,
  ) => {
    setGroupReturnView(returnView);
    setMemberQuery("");
    setMemberResults([]);
    setStatus(null);
    setNeedsRefresh(false);
    const selectedGroupId =
      returnView === "contact-form" && draft.audience.type === "group"
        ? draft.audience.groupId
        : null;
    const existing = create
      ? null
      : (currentGroups.find((group) => group.id === selectedGroupId) ??
        currentGroups[0]);
    setGroupDraft(
      existing
        ? {
            id: existing.id,
            name: existing.name,
            members: existing.members ?? [],
          }
        : { name: "", members: [] },
    );
    setView("groups");
  };
  const returnFromCurrentView = () => {
    if (saving) return;
    setView(
      view === "contact-form"
        ? formReturnView
        : view === "groups"
          ? groupReturnView
          : "contacts",
    );
    setStatus(null);
    setNeedsRefresh(false);
  };
  const updateEmail = (
    index: number,
    key: "value" | "label" | "cc",
    value: string,
  ) =>
    setDraft((current) => ({
      ...current,
      emails: current.emails.map((email, position) =>
        position === index ? { ...email, [key]: value } : email,
      ),
    }));
  const saveDraft = async () => {
    if (!canEdit || saving) return;
    const person = draft.person.trim(),
      role = draft.role.trim(),
      description = draft.description.trim(),
      phone = draft.phone.trim();
    const fail = (text: string) => setStatus({ tone: "error", text });
    if (!person && !role && !description) {
      fail("Vyplňte jméno, roli nebo popis kontaktu.");
      return;
    }
    if (!phone && !draft.emails.some((email) => email.value.trim())) {
      fail("Vyplňte alespoň telefon nebo e-mail.");
      return;
    }
    if (phone && !/^\+?\d+$/.test(phoneHref(phone))) {
      fail("Zkontrolujte telefonní číslo.");
      return;
    }
    if (
      draft.emails.some(
        (email) =>
          !email.value.trim() && (email.label.trim() || email.cc.trim()),
      )
    ) {
      fail("Doplňte e-mailovou adresu k vyplněnému popisku nebo kopii.");
      return;
    }
    const audience = draft.audience;
    if (
      audience.type === "group" &&
      !currentGroups.some((group) => group.id === audience.groupId)
    ) {
      fail(
        "Vyberte skupinu, pro kterou je kontakt určen, nebo vytvořte novou.",
      );
      return;
    }
    const emails: ContactEmail[] = draft.emails
      .filter((email) => email.value.trim())
      .map((email) => ({
        value: email.value.trim(),
        ...(email.label.trim() ? { label: email.label.trim() } : {}),
        ...(email.cc.trim() ? { cc: email.cc.trim() } : {}),
      }));
    const contact: DirectoryContact = {
      id: editingContactId ?? newContactId(draft.institutionKey),
      institutionKey: draft.institutionKey,
      audience: draft.audience,
      ...(person ? { person } : {}),
      ...(role ? { role } : {}),
      ...(description ? { description } : {}),
      ...(phone ? { phone: { display: phone, href: phoneHref(phone) } } : {}),
      ...(emails.length ? { emails } : {}),
      ...(draft.notice.trim() ? { notice: draft.notice.trim() } : {}),
    };
    if (!(await persistMutation({ operation: "saveContact", contact }))) return;
    setSelectedInstitution(contact.institutionKey);
    setEditingContactId(null);
    setView("contacts");
    setStatus({ tone: "success", text: "Kontakt byl uložen." });
  };
  const deleteCurrentContact = async () => {
    if (
      !editingContactId ||
      saving ||
      !window.confirm("Opravdu chcete odstranit tento kontakt?")
    )
      return;
    if (
      !(await persistMutation({
        operation: "deleteContact",
        contactId: editingContactId,
      }))
    )
      return;
    setEditingContactId(null);
    setView("contacts");
    setStatus({ tone: "success", text: "Kontakt byl odstraněn." });
  };
  const saveGroup = async () => {
    if (!groupDraft.name.trim()) {
      setStatus({ tone: "error", text: "Vyplňte název skupiny." });
      return;
    }
    const previousIds = new Set(currentGroups.map((group) => group.id));
    const payload = await persistMutation({
      operation: "saveGroup",
      group: {
        ...(groupDraft.id ? { id: groupDraft.id } : {}),
        name: groupDraft.name.trim(),
        memberUids: groupDraft.members.map((member) => member.uid),
      },
    });
    if (!payload) return;
    const saved = payload.groups?.find((group) =>
      groupDraft.id ? group.id === groupDraft.id : !previousIds.has(group.id),
    );
    if (saved) {
      setGroupDraft({
        id: saved.id,
        name: saved.name,
        members: saved.members ?? groupDraft.members,
      });
      if (groupReturnView === "contact-form") {
        setDraft((current) => ({
          ...current,
          audience: { type: "group", groupId: saved.id },
        }));
        setView("contact-form");
      }
    }
    setStatus({ tone: "success", text: "Skupina byla uložena." });
  };
  const deleteGroup = async () => {
    if (
      !groupDraft.id ||
      saving ||
      !window.confirm(
        "Opravdu chcete odstranit tuto skupinu? Kontakty zůstanou zachované.",
      )
    )
      return;
    const payload = await persistMutation({
      operation: "deleteGroup",
      groupId: groupDraft.id,
    });
    if (!payload) return;
    const next = payload.groups?.[0];
    setGroupDraft(
      next
        ? { id: next.id, name: next.name, members: next.members ?? [] }
        : { name: "", members: [] },
    );
    setStatus({ tone: "success", text: "Skupina byla odstraněna." });
  };
  const toggleMember = (member: ContactGroupMember) =>
    setGroupDraft((current) => ({
      ...current,
      members: current.members.some((item) => item.uid === member.uid)
        ? current.members.filter((item) => item.uid !== member.uid)
        : [...current.members, member],
    }));
  const groupContactCount = currentContacts.filter(
    (contact) =>
      contact.audience?.type === "group" &&
      contact.audience.groupId === groupDraft.id,
  ).length;
  const institution = CONTACT_INSTITUTION_BY_KEY.get(draft.institutionKey);
  const title =
    view === "groups"
      ? "Vlastní skupiny"
      : view === "csob-alternatives"
        ? "Alternativní kontakty ČSOB"
        : view === "institution-picker"
          ? "Přidat instituci"
          : view === "contact-form"
            ? editingContactId
              ? "Upravit kontakt"
              : "Nový kontakt"
            : "Kontakty";
  const subtitle =
    view === "groups"
      ? "Vytvořte skupinu a vyberte uživatele, kteří uvidí její kontakty."
      : view === "contact-form"
        ? "Kontaktní údaje a jejich dostupnost na jednom místě."
        : view === "csob-alternatives"
          ? "Regionální podpora a další kontaktní osoby."
          : view === "institution-picker"
            ? "Vyberte instituci, pro kterou chcete přidat první kontakt."
            : "Obchodní a administrativní podpora partnerských institucí.";
  const statusElement = status ? (
    <div
      className={styles.status}
      data-tone={status.tone}
      role={status.tone === "error" ? "alert" : "status"}
    >
      <span>{status.text}</span>
      {needsRefresh && (
        <button
          type="button"
          disabled={loading || saving}
          onClick={() => setReloadVersion((version) => version + 1)}
        >
          <RefreshCw size={14} />
          Načíst aktuální verzi
        </button>
      )}
    </div>
  ) : null;

  return (
    <div className={ui.overlay}>
      <button
        type="button"
        className={ui.backdrop}
        onClick={onClose}
        aria-label="Zavřít kontakty"
        tabIndex={-1}
      />
      <section
        ref={panelRef}
        tabIndex={-1}
        className={`${ui.panel} ${styles.panel}`}
        data-directory={view === "contacts" || undefined}
        data-editor={view === "contact-form" || view === "groups" || undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contacts-modal-title"
      >
        <header className={ui.header}>
          <span className={ui.headerIcon}>
            {view === "groups" ? (
              <UsersRound size={22} aria-hidden="true" />
            ) : (
              <ContactRound size={22} strokeWidth={1.7} aria-hidden="true" />
            )}
          </span>
          <div className={ui.heading}>
            {view !== "contacts" ? (
              <button
                type="button"
                disabled={saving}
                onClick={returnFromCurrentView}
                className={ui.back}
              >
                <ArrowLeft size={13} />
                {view === "groups" && groupReturnView === "contact-form"
                  ? "Zpět na kontakt"
                  : "Zpět na kontakty"}
              </button>
            ) : (
              <p className={ui.eyebrow}>Adresář podpory</p>
            )}
            <h2 id="contacts-modal-title" className={ui.title}>
              {title}
            </h2>
            <p className={ui.subtitle}>{subtitle}</p>
          </div>
          <div className={ui.headerActions}>
            {view === "contacts" && canEdit && (
              <button
                type="button"
                onClick={() => {
                  setEditingMode((current) => !current);
                  setStatus(null);
                }}
                className={ui.edit}
                aria-pressed={editingMode}
                aria-label={
                  editingMode ? "Dokončit úpravy" : "Editovat kontakty"
                }
              >
                {editingMode ? <Check size={16} /> : <Pencil size={16} />}
                <span>{editingMode ? "Hotovo" : "Editovat"}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className={ui.close}
              aria-label="Zavřít"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {loading && (
          <div className={styles.loading} role="status">
            <span className={styles.spinner} />
            Načítám kontakty…
          </div>
        )}
        {!loading && !sessionReady && (
          <div className={styles.loadFailure}>
            {statusElement}
            <p>
              {user
                ? "Aktuální adresář zatím není k dispozici."
                : "Pro zobrazení kontaktů se přihlaste."}
            </p>
            {user && (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setReloadVersion((value) => value + 1)}
              >
                <RefreshCw size={15} />
                Zkusit znovu
              </button>
            )}
          </div>
        )}

        {!loading && sessionReady && view === "contacts" && (
          <div className={styles.directory}>
            <nav
              className={styles.sidebar}
              aria-label="Filtrovat kontakty podle instituce"
            >
              <div className={styles.sidebarHeading}>
                <p>Instituce</p>
                <span>{institutionsWithContacts.length}</span>
              </div>
              <div className={styles.institutionList}>
                <button
                  type="button"
                  onClick={() => setSelectedInstitution(null)}
                  aria-pressed={selectedInstitution === null}
                  className={styles.institutionButton}
                >
                  <span
                    className={`${styles.institutionLogo} ${styles.allInstitutions}`}
                  >
                    <ContactRound size={22} aria-hidden="true" />
                  </span>
                  <span className={styles.institutionLabel}>
                    Všechny kontakty
                  </span>
                  <span className={styles.institutionCount}>
                    {currentContacts.length}
                  </span>
                </button>
                {institutionsWithContacts.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSelectedInstitution(item.key)}
                    aria-pressed={selectedInstitution === item.key}
                    className={styles.institutionButton}
                  >
                    <span className={styles.institutionLogo}>
                      <Image
                        src={item.logoPath}
                        alt=""
                        width={64}
                        height={40}
                      />
                    </span>
                    <span className={styles.institutionLabel}>
                      {item.label}
                    </span>
                    <span className={styles.institutionCount}>
                      {
                        currentContacts.filter(
                          (contact) => contact.institutionKey === item.key,
                        ).length
                      }
                    </span>
                  </button>
                ))}
              </div>
              {canEdit && (
                <button
                  type="button"
                  className={styles.manageGroups}
                  aria-label="Spravovat skupiny"
                  onClick={() => openGroups("contacts")}
                >
                  <UsersRound size={16} />
                  <span>Spravovat skupiny</span>
                  <span className={styles.institutionCount}>
                    {currentGroups.length}
                  </span>
                </button>
              )}
            </nav>
            <div className={styles.main}>
              <div className={`${ui.toolbar} ${styles.toolbar}`}>
                <div className={styles.directoryTools}>
                  <div className={`${ui.search} ${styles.search}`}>
                    <Search size={17} aria-hidden="true" />
                    <input
                      aria-label="Hledat kontakt"
                      placeholder="Jméno, instituce, telefon nebo e-mail…"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        aria-label="Vymazat hledání"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                  <label className={styles.audienceFilter}>
                    <span>Určeno pro</span>
                    <select
                      aria-label="Filtrovat kontakty podle skupiny"
                      value={audienceFilter}
                      onChange={(event) =>
                        setAudienceFilter(event.target.value)
                      }
                    >
                      <option value="all">Všechny dostupné</option>
                      <option value="everyone">Všichni</option>
                      {(canManage ||
                        currentContacts.some(
                          (contact) => contact.audience?.type === "specialists",
                        )) && <option value="specialists">Specialisti</option>}
                      {currentGroups.map((group) => (
                        <option key={group.id} value={`group:${group.id}`}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={13} aria-hidden="true" />
                  </label>
                </div>
                {editingMode && canEdit && (
                  <div className={styles.editToolbar}>
                    <span>
                      <Pencil size={13} />
                      Úpravy adresáře
                    </span>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => openGroups("contacts")}
                    >
                      <UsersRound size={15} />
                      Skupiny
                    </button>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() =>
                        openNewContact(
                          selectedInstitution ??
                            institutionsWithContacts[0]?.key ??
                            "bohemika",
                        )
                      }
                    >
                      <Plus size={15} />
                      Přidat kontakt
                    </button>
                    {availableInstitutions.length > 0 && (
                      <button
                        type="button"
                        className={styles.textButton}
                        onClick={() => setView("institution-picker")}
                      >
                        <Building2 size={15} />
                        Přidat instituci
                      </button>
                    )}
                  </div>
                )}
                {statusElement}
              </div>
              <div
                ref={contactContentRef}
                className={`${ui.content} ${styles.contactContent}`}
              >
                <div className={styles.resultsHeading}>
                  <div>
                    <p className={styles.resultsEyebrow}>
                      Kontakty, které máte k dispozici
                    </p>
                    <h3>
                      {selectedInstitution
                        ? CONTACT_INSTITUTION_BY_KEY.get(selectedInstitution)
                            ?.label
                        : "Všechny kontakty"}
                    </h3>
                  </div>
                  <span
                    className={styles.resultsCount}
                    role="status"
                    aria-live="polite"
                  >
                    {visibleContacts.length} / {currentContacts.length} kontaktů
                  </span>
                </div>
                <div className={styles.grid}>
                  {visibleContacts.map((contact) => {
                    const item = CONTACT_INSTITUTION_BY_KEY.get(
                      contact.institutionKey,
                    );
                    if (!item) return null;
                    const name =
                      contact.person ??
                      contact.description ??
                      contact.role ??
                      item.label;
                    return (
                      <article
                        key={contact.id}
                        ref={
                          contact.id === initialContactId
                            ? highlightedContactRef
                            : undefined
                        }
                        className={styles.card}
                        data-highlighted={
                          contact.id === initialContactId || undefined
                        }
                      >
                        <div className={styles.cardHeader}>
                          <span className={styles.logo}>
                            <Image
                              src={item.logoPath}
                              alt=""
                              width={64}
                              height={44}
                            />
                          </span>
                          <div className={styles.identity}>
                            {name !== item.label && (
                              <p className={styles.institution}>{item.label}</p>
                            )}
                            <h3 className={styles.name}>{name}</h3>
                            {contact.role && name !== contact.role && (
                              <span className={styles.role}>
                                {contact.role}
                              </span>
                            )}
                          </div>
                          {editingMode && canEdit && (
                            <button
                              type="button"
                              onClick={() => openExistingContact(contact)}
                              className={styles.editCard}
                              aria-label={`Upravit kontakt ${name}`}
                            >
                              <Pencil size={15} />
                            </button>
                          )}
                        </div>
                        <span
                          className={styles.audienceBadge}
                          data-audience={contact.audience?.type ?? "everyone"}
                          aria-label={`Určeno pro: ${audienceLabel(contact.audience)}`}
                        >
                          {contact.audience?.type === "specialists" ? (
                            <ShieldCheck size={12} />
                          ) : (
                            <UsersRound size={12} />
                          )}
                          {audienceLabel(contact.audience)}
                        </span>
                        {contact.person && contact.description && (
                          <p className={styles.description}>
                            {contact.description}
                          </p>
                        )}
                        <div className={styles.methods}>
                          {contact.phone && (
                            <a
                              href={`tel:${contact.phone.href}`}
                              className={styles.method}
                            >
                              <span className={styles.methodIcon}>
                                <Phone size={16} aria-hidden="true" />
                              </span>
                              <span className={styles.methodText}>
                                {contact.phone.display}
                              </span>
                              <ArrowUpRight
                                size={15}
                                className={styles.methodArrow}
                                aria-hidden="true"
                              />
                            </a>
                          )}
                          {contact.emails?.map((email) => (
                            <a
                              key={`${email.value}-${email.label ?? ""}`}
                              href={mailtoHref(email)}
                              className={styles.method}
                            >
                              <span className={styles.methodIcon}>
                                <Mail size={16} aria-hidden="true" />
                              </span>
                              <span className={styles.methodText}>
                                {email.label && <small>{email.label}</small>}
                                {email.value}
                              </span>
                              <ArrowUpRight
                                size={15}
                                className={styles.methodArrow}
                                aria-hidden="true"
                              />
                            </a>
                          ))}
                        </div>
                        {contact.id === "csob" && (
                          <button
                            type="button"
                            className={styles.alternativesButton}
                            onClick={() => {
                              setStatus(null);
                              setView("csob-alternatives");
                            }}
                          >
                            Další regionální kontakty ČSOB
                            <ArrowUpRight size={14} />
                          </button>
                        )}
                        {contact.notice && (
                          <div className={styles.notice}>
                            <AlertTriangle size={15} aria-hidden="true" />
                            <p>{contact.notice}</p>
                          </div>
                        )}
                      </article>
                    );
                  })}
                  {visibleContacts.length === 0 && (
                    <div className={ui.empty}>
                      <Search size={28} />
                      <p>
                        {currentContacts.length
                          ? "Žádný kontakt neodpovídá zvolenému filtru."
                          : "Zatím nemáte k dispozici žádné kontakty."}
                      </p>
                      {currentContacts.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearch("");
                            setSelectedInstitution(null);
                            setAudienceFilter("all");
                          }}
                        >
                          Zrušit filtry
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {!loading && sessionReady && view === "csob-alternatives" && (
          <div className={ui.content}>
            <div className={styles.alternativesGrid}>
              {CSOB_ALTERNATIVES.map((contact) => (
                <article key={contact.email} className={styles.alternativeCard}>
                  <h3>{contact.name}</h3>
                  <p>
                    <MapPin size={14} />
                    {contact.region}
                  </p>
                  <a href={`tel:${contact.phone.href}`}>
                    <Phone size={14} />
                    {contact.phone.display}
                  </a>
                  <a href={`mailto:${contact.email}`}>
                    <Mail size={14} />
                    {contact.email}
                  </a>
                </article>
              ))}
            </div>
          </div>
        )}

        {!loading && canEdit && view === "institution-picker" && (
          <div className={ui.content}>
            <div className={styles.institutionPicker}>
              {availableInstitutions.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => openNewContact(item.key, "institution-picker")}
                >
                  <Image src={item.logoPath} alt="" width={90} height={46} />
                  <strong>{item.label}</strong>
                  <span>
                    <Plus size={14} />
                    Vybrat instituci
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!loading && canEdit && view === "contact-form" && institution && (
          <form
            className={styles.editorForm}
            onSubmit={(event) => {
              event.preventDefault();
              void saveDraft();
            }}
          >
            <fieldset className={styles.editorScroll} disabled={saving}>
              <div className={styles.editorGrid}>
                <div className={styles.editorPrimary}>
                  <section
                    className={styles.formSection}
                    aria-labelledby="contact-identity-title"
                  >
                    <div className={styles.sectionHeading}>
                      <span className={styles.sectionIcon}>
                        <ContactRound size={18} />
                      </span>
                      <div>
                        <h3 id="contact-identity-title">Kontaktní osoba</h3>
                        <p>Kdo vám pomůže a s čím se na něj obrátit.</p>
                      </div>
                    </div>
                    <div className={styles.institutionIdentity}>
                      <span className={styles.formInstitutionLogo}>
                        <Image
                          src={institution.logoPath}
                          alt=""
                          width={90}
                          height={44}
                        />
                      </span>
                      <label className={styles.field}>
                        <span>Instituce</span>
                        <select
                          aria-label="Instituce kontaktu"
                          value={draft.institutionKey}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              institutionKey: event.target.value,
                            }))
                          }
                        >
                          {CONTACT_INSTITUTIONS.map((item) => (
                            <option key={item.key} value={item.key}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className={styles.fieldGrid}>
                      <label className={styles.field}>
                        <span>Jméno / kontaktní osoba</span>
                        <input
                          autoComplete="off"
                          maxLength={120}
                          value={draft.person}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              person: event.target.value,
                            }))
                          }
                          placeholder="např. Jana Nováková"
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Role / štítek</span>
                        <input
                          maxLength={80}
                          value={draft.role}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              role: event.target.value,
                            }))
                          }
                          placeholder="např. KAM"
                        />
                      </label>
                      <label className={`${styles.field} ${styles.fullWidth}`}>
                        <span>Agenda / popis</span>
                        <textarea
                          rows={2}
                          maxLength={500}
                          value={draft.description}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                          placeholder="S čím vám kontakt pomůže"
                        />
                      </label>
                    </div>
                  </section>
                  <section
                    className={styles.formSection}
                    aria-labelledby="contact-methods-title"
                  >
                    <div className={styles.sectionHeading}>
                      <span className={styles.sectionIcon}>
                        <Phone size={18} />
                      </span>
                      <div>
                        <h3 id="contact-methods-title">Jak se spojit</h3>
                        <p>Vyplňte alespoň telefon nebo e-mail.</p>
                      </div>
                    </div>
                    <label className={styles.field}>
                      <span>Telefon</span>
                      <input
                        type="tel"
                        autoComplete="off"
                        maxLength={40}
                        value={draft.phone}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            phone: event.target.value,
                          }))
                        }
                        placeholder="+420 123 456 789"
                      />
                    </label>
                    <div className={styles.emailList}>
                      {draft.emails.map((email, index) => (
                        <div key={index} className={styles.emailEntry}>
                          <div className={styles.emailHeading}>
                            <span>
                              <Mail size={13} />
                              {index === 0 ? "E-mail" : `Další e-mail ${index}`}
                            </span>
                            {draft.emails.length > 1 && (
                              <button
                                type="button"
                                aria-label={`Odebrat e-mail ${index + 1}`}
                                onClick={() =>
                                  setDraft((current) => ({
                                    ...current,
                                    emails: current.emails.filter(
                                      (_, position) => position !== index,
                                    ),
                                  }))
                                }
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                          <div className={styles.fieldGrid}>
                            <label className={styles.field}>
                              <span>Adresa e-mailu {index + 1}</span>
                              <input
                                type="email"
                                autoComplete="off"
                                maxLength={180}
                                value={email.value}
                                onChange={(event) =>
                                  updateEmail(
                                    index,
                                    "value",
                                    event.target.value,
                                  )
                                }
                                placeholder="kontakt@instituce.cz"
                              />
                            </label>
                            <label className={styles.field}>
                              <span>
                                Popisek e-mailu {index + 1}
                                <small>Volitelné</small>
                              </span>
                              <input
                                maxLength={80}
                                value={email.label}
                                onChange={(event) =>
                                  updateEmail(
                                    index,
                                    "label",
                                    event.target.value,
                                  )
                                }
                                placeholder="např. Administrace"
                              />
                            </label>
                          </div>
                          <details
                            className={styles.emailOptions}
                            open={email.cc ? true : undefined}
                          >
                            <summary>Automatická kopie (CC)</summary>
                            <label className={styles.field}>
                              <span>Kopie e-mailu {index + 1}</span>
                              <input
                                type="email"
                                maxLength={180}
                                value={email.cc}
                                onChange={(event) =>
                                  updateEmail(index, "cc", event.target.value)
                                }
                                placeholder="kopie@instituce.cz"
                              />
                            </label>
                          </details>
                        </div>
                      ))}
                    </div>
                    {draft.emails.length < 4 && (
                      <button
                        type="button"
                        className={styles.textButton}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            emails: [
                              ...current.emails,
                              { value: "", label: "", cc: "" },
                            ],
                          }))
                        }
                      >
                        <Plus size={14} />
                        Přidat další e-mail
                      </button>
                    )}
                  </section>
                  <details
                    className={styles.noticeOptions}
                    open={draft.notice ? true : undefined}
                  >
                    <summary>
                      <AlertTriangle size={16} />
                      <span>
                        Důležité upozornění
                        <small>Volitelná poznámka ke kontaktu</small>
                      </span>
                      <ChevronDown size={15} />
                    </summary>
                    <label className={styles.field}>
                      <span>Upozornění pro uživatele</span>
                      <textarea
                        rows={3}
                        maxLength={500}
                        value={draft.notice}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            notice: event.target.value,
                          }))
                        }
                        placeholder="např. Pouze pro interní komunikaci"
                      />
                    </label>
                  </details>
                </div>
                <aside className={styles.audienceAside}>
                  <fieldset className={styles.audienceSection}>
                    <legend>Pro koho je kontakt určen?</legend>
                    <p>
                      Kontakt uvidí zvolení uživatelé v adresáři i při
                      vyhledávání.
                    </p>
                    <div className={styles.audienceChoices}>
                      {(
                        [
                          {
                            type: "everyone",
                            title: "Všichni",
                            description: "Všichni přihlášení poradci",
                            icon: UsersRound,
                          },
                          {
                            type: "specialists",
                            title: "Specialisti",
                            description: "Specialisté a administrátoři",
                            icon: ShieldCheck,
                          },
                          {
                            type: "group",
                            title: "Vlastní skupina",
                            description: "Pouze vybraní členové skupiny",
                            icon: UserRoundPlus,
                          },
                        ] as const
                      ).map((option) => (
                        <label
                          key={option.type}
                          className={styles.audienceChoice}
                          data-selected={
                            draft.audience.type === option.type || undefined
                          }
                        >
                          <input
                            type="radio"
                            name="contact-audience"
                            value={option.type}
                            checked={draft.audience.type === option.type}
                            onChange={() =>
                              setDraft((current) => ({
                                ...current,
                                audience:
                                  option.type === "group"
                                    ? {
                                        type: "group",
                                        groupId:
                                          current.audience.type === "group"
                                            ? current.audience.groupId
                                            : "",
                                      }
                                    : { type: option.type },
                              }))
                            }
                          />
                          <span className={styles.audienceIcon}>
                            <option.icon size={18} />
                          </span>
                          <span>
                            <strong>{option.title}</strong>
                            <small>{option.description}</small>
                          </span>
                          <span className={styles.radioIndicator}>
                            {draft.audience.type === option.type && (
                              <Check size={11} />
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                    {draft.audience.type === "group" && (
                      <div className={styles.groupSelection}>
                        <label className={styles.field}>
                          <span>Skupina kontaktu</span>
                          <select
                            aria-label="Skupina kontaktu"
                            value={draft.audience.groupId}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                audience: {
                                  type: "group",
                                  groupId: event.target.value,
                                },
                              }))
                            }
                          >
                            <option value="">Vyberte skupinu…</option>
                            {currentGroups.map((group) => (
                              <option key={group.id} value={group.id}>
                                {group.name} ({group.memberCount})
                              </option>
                            ))}
                          </select>
                        </label>
                        {currentGroups.length === 0 && (
                          <p>Nejdříve vytvořte skupinu a vyberte její členy.</p>
                        )}
                        <div className={styles.groupSelectionActions}>
                          <button
                            type="button"
                            className={styles.textButton}
                            onClick={() => openGroups("contact-form", true)}
                          >
                            <Plus size={14} />
                            Vytvořit skupinu
                          </button>
                          {currentGroups.length > 0 && (
                            <button
                              type="button"
                              className={styles.textButton}
                              onClick={() => openGroups("contact-form")}
                            >
                              <Settings2 size={14} />
                              Upravit skupiny
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </fieldset>
                  <div className={styles.accessNote}>
                    <ShieldCheck size={18} />
                    <p>
                      Kontakty i skupiny mohou spravovat administrátoři a
                      specialisté.
                    </p>
                  </div>
                </aside>
              </div>
            </fieldset>
            <footer className={styles.editorFooter}>
              <div className={styles.footerStatus}>
                {statusElement ?? (
                  <p>
                    <ShieldCheck size={14} />
                    Dostupnost kontaktu se uloží spolu s jeho údaji.
                  </p>
                )}
              </div>
              <div className={styles.formActions}>
                {editingContactId && (
                  <button
                    type="button"
                    className={styles.deleteButton}
                    disabled={saving}
                    onClick={() => void deleteCurrentContact()}
                  >
                    <Trash2 size={15} />
                    <span>Odstranit</span>
                  </button>
                )}
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={saving}
                  onClick={returnFromCurrentView}
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={saving}
                >
                  <Save size={15} />
                  {saving ? "Ukládám…" : "Uložit kontakt"}
                </button>
              </div>
            </footer>
          </form>
        )}

        {!loading && canEdit && view === "groups" && (
          <div className={styles.groupWorkspace}>
            <aside className={styles.groupList}>
              <div className={styles.groupListHeading}>
                <span>Skupiny adresáře</span>
                <button
                  type="button"
                  aria-label="Vytvořit novou skupinu"
                  disabled={saving}
                  onClick={() => {
                    setGroupDraft({ name: "", members: [] });
                    setMemberQuery("");
                    setStatus(null);
                  }}
                >
                  <Plus size={16} />
                </button>
              </div>
              {currentGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className={styles.groupListItem}
                  aria-pressed={groupDraft.id === group.id}
                  disabled={saving}
                  onClick={() => {
                    setGroupDraft({
                      id: group.id,
                      name: group.name,
                      members: group.members ?? [],
                    });
                    setMemberQuery("");
                    setStatus(null);
                  }}
                >
                  <span className={styles.groupListIcon}>
                    <UsersRound size={17} />
                  </span>
                  <span>
                    <strong>{group.name}</strong>
                    <small>{group.memberCount} členů</small>
                  </span>
                </button>
              ))}
              {!currentGroups.length && (
                <p className={styles.groupListEmpty}>
                  Vlastní skupiny se zobrazí zde.
                </p>
              )}
            </aside>
            <form
              className={styles.groupEditor}
              onSubmit={(event) => {
                event.preventDefault();
                void saveGroup();
              }}
            >
              <fieldset className={styles.groupEditorScroll} disabled={saving}>
                <div className={styles.groupEditorHeading}>
                  <span className={styles.sectionIcon}>
                    <UsersRound size={20} />
                  </span>
                  <div>
                    <p>{groupDraft.id ? "Úprava skupiny" : "Nová skupina"}</p>
                    <h3>
                      {groupDraft.id
                        ? groupDraft.name || "Vlastní skupina"
                        : "Spojte správné lidi"}
                    </h3>
                  </div>
                </div>
                <label className={styles.field}>
                  <span>Název skupiny</span>
                  <input
                    required
                    maxLength={80}
                    value={groupDraft.name}
                    onChange={(event) =>
                      setGroupDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="např. Podpora životního pojištění"
                  />
                </label>
                <div className={styles.memberSection}>
                  <div className={styles.memberHeading}>
                    <div>
                      <h4>Členové skupiny</h4>
                      <p>
                        Vybraní uživatelé uvidí kontakty přiřazené této skupině.
                      </p>
                    </div>
                    <span>{groupDraft.members.length}</span>
                  </div>
                  <label className={styles.memberSearch}>
                    <Search size={17} />
                    <input
                      aria-label="Vyhledat členy skupiny"
                      maxLength={120}
                      value={memberQuery}
                      onChange={(event) => setMemberQuery(event.target.value)}
                      placeholder="Hledejte podle jména nebo e-mailu…"
                    />
                    {memberQuery && (
                      <button
                        type="button"
                        aria-label="Vymazat hledání členů"
                        onClick={() => setMemberQuery("")}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </label>
                  {memberSearching && (
                    <p className={styles.searchHint} role="status">
                      Vyhledávám uživatele…
                    </p>
                  )}
                  {memberSearchError && (
                    <p className={styles.memberError} role="alert">
                      {memberSearchError}
                    </p>
                  )}
                  {memberQuery.trim().length >= 2 &&
                    !memberSearching &&
                    !memberSearchError && (
                      <div className={styles.memberResults}>
                        {memberResults.length ? (
                          memberResults.map((member) => (
                            <label
                              key={member.uid}
                              className={styles.memberResult}
                            >
                              <input
                                type="checkbox"
                                checked={groupDraft.members.some(
                                  (selected) => selected.uid === member.uid,
                                )}
                                onChange={() => toggleMember(member)}
                              />
                              <span className={styles.memberAvatar}>
                                {(member.name || member.email)
                                  .slice(0, 1)
                                  .toUpperCase()}
                              </span>
                              <span>
                                <strong>{member.name || member.email}</strong>
                                <small>{member.email}</small>
                              </span>
                            </label>
                          ))
                        ) : (
                          <p className={styles.searchHint}>
                            Nenalezen žádný uživatel.
                          </p>
                        )}
                      </div>
                    )}
                  {memberQuery.trim().length < 2 && (
                    <p className={styles.searchHint}>
                      Pro vyhledání zadejte alespoň 2 znaky.
                    </p>
                  )}
                  <div className={styles.selectedMembers}>
                    {groupDraft.members.map((member) => (
                      <div key={member.uid} className={styles.selectedMember}>
                        <span className={styles.memberAvatar}>
                          {(member.name || member.email)
                            .slice(0, 1)
                            .toUpperCase()}
                        </span>
                        <span>
                          <strong>{member.name || member.email}</strong>
                          <small>{member.email}</small>
                        </span>
                        <button
                          type="button"
                          aria-label={`Odebrat člena ${member.name || member.email}`}
                          onClick={() => toggleMember(member)}
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                    {groupDraft.members.length === 0 && (
                      <div className={styles.noMembers}>
                        <UserRoundPlus size={23} />
                        <p>Zatím jste nevybrali žádné členy.</p>
                        <small>
                          Kontakty skupiny budou zatím dostupné pouze správcům
                          adresáře.
                        </small>
                      </div>
                    )}
                  </div>
                </div>
                {groupDraft.id && (
                  <p className={styles.groupUsage}>
                    {groupContactCount > 0
                      ? `Tato skupina je přiřazena ke kontaktům (${groupContactCount}). Před odstraněním skupiny kontakty přeřaďte.`
                      : "Ke skupině zatím nejsou přiřazené žádné kontakty."}
                  </p>
                )}
              </fieldset>
              <footer className={styles.editorFooter}>
                <div className={styles.footerStatus}>{statusElement}</div>
                <div className={styles.formActions}>
                  {groupDraft.id && (
                    <button
                      type="button"
                      className={styles.deleteButton}
                      disabled={saving || groupContactCount > 0}
                      title={
                        groupContactCount > 0
                          ? "Nejdříve přeřaďte kontakty této skupiny."
                          : undefined
                      }
                      onClick={() => void deleteGroup()}
                    >
                      <Trash2 size={15} />
                      <span>Odstranit</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={saving}
                    onClick={returnFromCurrentView}
                  >
                    Zpět
                  </button>
                  <button
                    type="submit"
                    className={styles.primaryButton}
                    disabled={saving}
                  >
                    <Save size={15} />
                    {saving ? "Ukládám…" : "Uložit skupinu"}
                  </button>
                </div>
              </footer>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
