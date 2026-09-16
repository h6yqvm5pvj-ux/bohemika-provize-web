"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Car,
  CalendarDays,
  Check,
  CheckCheck,
  Lightbulb,
  MessageSquare,
  Paperclip,
  Clock,
  CircleDollarSign,
  CircleX,
  Download,
  ExternalLink,
  FileText,
  Gauge,
  Home,
  IdCard,
  ImageIcon,
  Mail,
  Package,
  Phone,
  RefreshCw,
  Trash2,
  UserRound,
} from "lucide-react";

import { auth } from "@/app/firebase";
import { fetchAuthedBlobOrThrow, fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { isLifeProduct } from "@/app/lib/productCatalog";
import type { Product } from "@/app/types/domain";
import { AppLayout } from "@/components/AppLayout";
import { PdfDocumentPreview } from "@/components/PdfDocumentPreview";
import { TipDialog } from "../TipDialog";
import { notifyTipDetailParent } from "../tipDetailMessages";
import styles from "./tipDetail.module.css";

type AccountType = "advisor" | "tipster";
type TipLifecycleStatus = "pending" | "contracted" | "failed";

type TipField = {
  label: string;
  value: string;
};

type TipAttachment = {
  id: string;
  name: string;
  url: string;
  contentType: string;
  sizeBytes: number;
};

type PreviewAttachment = TipAttachment & {
  objectUrl: string;
  pdfData?: Uint8Array;
};

type LinkedContractSummary = {
  ownerEmail: string;
  entryId: string;
  path: string;
  number: string;
  productKey: Product | string | null;
  tipsterPercent: number | null;
  immediateGrossFirstYear: number | null;
  immediateNetFirstYear: number | null;
  tipsterAmountFirstYear: number | null;
};

type TipsterTip = {
  id: string;
  title: string;
  product: string;
  productLabel: string;
  status: TipLifecycleStatus | string;
  recipientEmail: string;
  recipientName: string;
  tipsterEmail: string;
  tipsterName: string;
  messageText: string;
  fields: TipField[];
  attachments: TipAttachment[];
  attachmentCount: number;
  linkedContractOwnerEmail?: string;
  linkedContractEntryId?: string;
  linkedContractPath?: string;
  linkedContractNumber?: string;
  linkedContract?: LinkedContractSummary | null;
  createdAtMs: number | null;
};

type TipDetailResponse = {
  ok?: boolean;
  accountType?: AccountType;
  item?: TipsterTip;
  error?: string;
};

type TipStatusPatchResponse = {
  ok?: boolean;
  id?: string;
  status?: TipLifecycleStatus;
  error?: string;
};

type TipDeleteResponse = {
  ok?: boolean;
  id?: string;
  error?: string;
};

const TIP_STATUS_OPTIONS: Array<{
  key: TipLifecycleStatus;
  label: string;
  badgeClass: string;
}> = [
  {
    key: "pending",
    label: "Čeká na zpracování",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-800",
  },
  {
    key: "contracted",
    label: "Sjednáno",
    badgeClass: "border-violet-200 bg-violet-50 text-violet-800",
  },
  {
    key: "failed",
    label: "Obchod neproběhl",
    badgeClass: "border-rose-200 bg-rose-50 text-rose-800",
  },
];

const normalize = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

const normalizeIco = (value: string): string =>
  value.replace(/\D+/g, "").slice(0, 8);

const getAresIcoFromField = (field: TipField): string | null => {
  const normalizedLabel = normalize(field.label);
  if (!normalizedLabel.includes("ico")) return null;

  const ico = normalizeIco(field.value);
  return ico.length === 8 ? ico : null;
};

const normalizeTipStatus = (value: unknown): TipLifecycleStatus => {
  if (value === "failed") return "failed";
  if (value === "paid" || value === "contracted") return "contracted";
  return "pending";
};

const tipStatusMeta = (status: TipLifecycleStatus) =>
  TIP_STATUS_OPTIONS.find((option) => option.key === status) ?? TIP_STATUS_OPTIONS[0]!;

const formatDateTime = (ms: number | null): string => {
  if (!ms || !Number.isFinite(ms)) return "Neznámý čas";
  try {
    return new Intl.DateTimeFormat("cs-CZ", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(ms));
  } catch {
    return "Neznámý čas";
  }
};

const formatMoney = (value: number | null | undefined): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Neuvedeno";
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(value);
};

const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Velikost neuvedena";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} kB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
};

const isImageAttachment = (attachment: TipAttachment): boolean => {
  const contentType = attachment.contentType.toLowerCase();
  if (contentType.startsWith("image/")) return true;
  return /\.(avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i.test(attachment.url);
};

const productIconKind = (product: string): "vehicle" | "business" | "property" | "other" => {
  const normalized = normalize(product);
  if (normalized.includes("vehicle") || normalized.includes("vozidel")) return "vehicle";
  if (normalized.includes("business") || normalized.includes("podnikatel")) return "business";
  if (normalized.includes("property") || normalized.includes("majetek")) return "property";
  return "other";
};

function ProductIcon({ product, className = "h-4 w-4" }: { product: string; className?: string }) {
  const productKind = productIconKind(product);
  if (productKind === "vehicle") return <Car className={className} />;
  if (productKind === "business") return <Building2 className={className} />;
  if (productKind === "property") return <Home className={className} />;
  return <Package className={className} />;
}

function StatusIcon({
  status,
  className = "h-4 w-4",
}: {
  status: TipLifecycleStatus;
  className?: string;
}) {
  if (status === "failed") return <CircleX className={className} />;
  if (status === "contracted") return <CircleDollarSign className={className} />;
  return <Clock className={className} />;
}

function FieldIcon({ label }: { label: string }) {
  const normalized = normalize(label);
  if (normalized.includes("telefon")) return <Phone className="h-4 w-4" />;
  if (normalized.includes("mail")) return <Mail className="h-4 w-4" />;
  if (normalized.includes("rodne") || normalized.includes("ico")) return <IdCard className="h-4 w-4" />;
  if (normalized.includes("cas") || normalized.includes("datum")) return <Clock className="h-4 w-4" />;
  if (normalized.includes("najed") || normalized.includes("najezd")) return <Gauge className="h-4 w-4" />;
  if (normalized.includes("spz") || normalized.includes("technick")) {
    return <Car className="h-4 w-4" />;
  }
  if (normalized.includes("adresa")) return <Home className="h-4 w-4" />;
  if (normalized.includes("jmeno") || normalized.includes("klient") || normalized.includes("firma")) {
    return <UserRound className="h-4 w-4" />;
  }
  return <FileText className="h-4 w-4" />;
}

function DetailField({ field, onOpenAres }: {
  field: TipField;
  onOpenAres: (ico: string) => void;
}) {
  const aresIco = getAresIcoFromField(field);
  const label = normalize(field.label);
  const href = label.includes("telefon") ? `tel:${field.value.replace(/[^+\d]/g, "")}`
    : label.includes("mail") ? `mailto:${encodeURIComponent(field.value.trim())}` : null;
  return (
    <div className={styles.field}>
      <span className={styles.fieldIcon}><FieldIcon label={field.label} /></span>
      <div>
        <dt>{field.label}</dt>
        <dd>{href ? <a href={href}>{field.value}</a> : field.value}</dd>
        {aresIco ? <button type="button" onClick={() => onOpenAres(aresIco)} className={styles.aresLink}>
          Ověřit v ARES <ExternalLink size={12} />
        </button> : null}
      </div>
    </div>
  );
}

function AttachmentCard({ attachment, busy, onOpen, onDownload }: {
  attachment: TipAttachment;
  busy: boolean;
  onOpen: (attachment: TipAttachment) => void;
  onDownload: (attachment: TipAttachment) => void;
}) {
  return (
    <article className={styles.attachment}>
      <span className={styles.fileIcon}>{isImageAttachment(attachment) ? <ImageIcon size={23} /> : <FileText size={23} />}</span>
      <button type="button" onClick={() => onOpen(attachment)} disabled={busy} className={styles.fileName} aria-label={`Otevřít přílohu ${attachment.name}`}>
        <strong>{attachment.name}</strong><span>{busy ? "Načítám soubor…" : formatFileSize(attachment.sizeBytes)}</span>
      </button>
      <button type="button" onClick={() => onDownload(attachment)} disabled={busy} className={styles.download} aria-label={`Stáhnout ${attachment.name}`}><Download size={17} /></button>
    </article>
  );
}

function LoadingState() {
  return <div className={styles.loading} role="status"><RefreshCw size={24} className={styles.spinning} /><p>Načítám detail tipu…</p><div /><div /></div>;
}

function TipDetailContent({ embedded }: { embedded: boolean }) {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const rawId = params?.id;
  const tipId = typeof rawId === "string" ? rawId : "";

  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [accountType, setAccountType] = useState<AccountType>("advisor");
  const [tip, setTip] = useState<TipsterTip | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<PreviewAttachment | null>(null);
  const previewAttachmentObjectUrlRef = useRef("");
  const [aresModalIco, setAresModalIco] = useState<string | null>(null);
  const [loadingAttachmentId, setLoadingAttachmentId] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let resolved = false;
    const readyFallbackTimer = window.setTimeout(() => {
      if (resolved) return;
      setUser(null);
      setAuthReady(true);
      setLoading(false);
    }, 5000);

    const unsub = onAuthStateChanged(auth, (fbUser) => {
      resolved = true;
      window.clearTimeout(readyFallbackTimer);
      setUser(fbUser ?? null);
      setAuthReady(true);
    });

    return () => {
      resolved = true;
      window.clearTimeout(readyFallbackTimer);
      unsub();
    };
  }, []);

  const loadTip = useCallback(
    async (currentUser: FirebaseUser, mode: "initial" | "refresh" = "initial") => {
      if (!tipId) {
        setError("Neplatné ID tipu.");
        setLoading(false);
        return;
      }
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ id: tipId });
        const payload = await fetchAuthedJsonOrThrow<TipDetailResponse>(
          currentUser,
          `/api/tips/detail?${query.toString()}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );
        if (!payload.item) {
          throw new Error(payload.error || "Tip nebyl nalezen.");
        }
        setTip(payload.item);
        setAccountType(payload.accountType === "tipster" ? "tipster" : "advisor");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Detail tipu se nepodařilo načíst.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tipId]
  );

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setLoading(false);
      setError("Pro zobrazení detailu tipu je potřeba přihlášení.");
      return;
    }
    void loadTip(user);
  }, [authReady, user, loadTip]);

  useEffect(() => {
    if (!embedded) return;
    notifyTipDetailParent(tipId, "busy", savingStatus || deleting);
  }, [embedded, tipId, savingStatus, deleting]);

  useEffect(() => {
    if (!embedded) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || previewAttachment || aresModalIco || showDeleteConfirm || savingStatus || deleting) return;
      event.preventDefault();
      notifyTipDetailParent(tipId, "close");
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [embedded, tipId, previewAttachment, aresModalIco, showDeleteConfirm, savingStatus, deleting]);

  const revokePreviewAttachmentObjectUrl = useCallback(() => {
    if (!previewAttachmentObjectUrlRef.current) return;
    URL.revokeObjectURL(previewAttachmentObjectUrlRef.current);
    previewAttachmentObjectUrlRef.current = "";
  }, []);

  useEffect(() => {
    return () => {
      revokePreviewAttachmentObjectUrl();
    };
  }, [revokePreviewAttachmentObjectUrl]);

  const closeAttachmentPreview = useCallback(() => {
    revokePreviewAttachmentObjectUrl();
    setPreviewAttachment(null);
  }, [revokePreviewAttachmentObjectUrl]);

  const fetchAttachmentBlob = useCallback(async (attachment: TipAttachment): Promise<Blob> => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("Pro otevření přílohy je potřeba přihlášení.");
    }
    return fetchAuthedBlobOrThrow(currentUser, attachment.url);
  }, []);

  const handleOpenAttachment = useCallback(
    async (attachment: TipAttachment) => {
      setError(null);
      setLoadingAttachmentId(attachment.id);
      try {
        const blob = await fetchAttachmentBlob(attachment);
        const pdfData = /pdf/i.test(attachment.contentType) || /\.pdf$/i.test(attachment.name)
          ? new Uint8Array(await blob.arrayBuffer()) : undefined;
        const objectUrl = URL.createObjectURL(blob);
        revokePreviewAttachmentObjectUrl();
        previewAttachmentObjectUrlRef.current = objectUrl;
        setPreviewAttachment({
          ...attachment,
          objectUrl,
          pdfData,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Přílohu se nepodařilo otevřít.");
      } finally { setLoadingAttachmentId(null); }
    },
    [fetchAttachmentBlob, revokePreviewAttachmentObjectUrl]
  );

  const handleDownloadAttachment = useCallback(
    async (attachment: TipAttachment) => {
      setError(null);
      setLoadingAttachmentId(attachment.id);
      try {
        const blob = await fetchAttachmentBlob(attachment);
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = attachment.name || "priloha";
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Přílohu se nepodařilo stáhnout.");
      } finally { setLoadingAttachmentId(null); }
    },
    [fetchAttachmentBlob]
  );

  const handleRefresh = () => {
    if (!user) return;
    void loadTip(user, "refresh");
  };

  const handleSetStatus = async (status: TipLifecycleStatus) => {
    const currentUser = auth.currentUser;
    if (!currentUser || accountType !== "advisor" || !tip || savingStatus || deleting) return;
    setSavingStatus(true);
    setSuccess(null);
    setError(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<TipStatusPatchResponse>(
        currentUser,
        "/api/advisor-tips",
        {
          method: "PATCH",
          body: JSON.stringify({ id: tip.id, status }),
        }
      );
      const nextStatus = normalizeTipStatus(payload.status ?? status);
      setTip((previous) => (previous ? { ...previous, status: nextStatus } : previous));
      setSuccess("Stav tipu je uložený. Uvidí ho i tipař.");
      if (embedded) notifyTipDetailParent(tipId, "changed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stav tipu se nepodařilo uložit.");
    } finally {
      setSavingStatus(false);
    }
  };

  const handleDeleteTip = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || !tip) return;
    setDeleting(true);
    setError(null);
    try {
      const query = new URLSearchParams({ id: tip.id });
      await fetchAuthedJsonOrThrow<TipDeleteResponse>(
        currentUser,
        `/api/tips/detail?${query.toString()}`,
        {
          method: "DELETE",
        }
      );
      if (embedded && window.parent !== window) notifyTipDetailParent(tipId, "deleted");
      else router.push("/tipy");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tip se nepodařilo smazat.");
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  const tipStatus = normalizeTipStatus(tip?.status);
  const statusMeta = tipStatusMeta(tipStatus);
  const isAdvisorMode = accountType === "advisor";
  const counterpartValue = useMemo(() => {
    if (!tip) return "Neuvedeno";
    return isAdvisorMode
      ? tip.tipsterName || tip.tipsterEmail || "Tipař neuveden"
      : tip.recipientName || tip.recipientEmail || "Příjemce neuveden";
  }, [isAdvisorMode, tip]);
  const linkedContractHref = useMemo(() => {
    const ownerEmail = (tip?.linkedContractOwnerEmail ?? "").trim().toLowerCase();
    const entryId = (tip?.linkedContractEntryId ?? "").trim();
    if (!ownerEmail || !entryId) return null;
    return `/smlouvy/${encodeURIComponent(`${ownerEmail}___${entryId}`)}`;
  }, [tip?.linkedContractEntryId, tip?.linkedContractOwnerEmail]);
  const hasLinkedContract = Boolean(linkedContractHref || tip?.linkedContractNumber || tip?.linkedContract);
  const linkedContract = tip?.linkedContract ?? null;
  const linkedContractNumber =
    linkedContract?.number || tip?.linkedContractNumber || "";
  const linkedContractLifeProduct = isLifeProduct(
    (linkedContract?.productKey ?? null) as Product | null
  );
  const linkedContractTipBaseText = linkedContractLifeProduct
    ? "Tipař má nárok pouze na podíl z provize A101."
    : "Tipař má nárok pouze na podíl z okamžité provize v 1. roce.";
  const linkedContractGrossLabel = linkedContractLifeProduct
    ? "A101 základ"
    : "Okamžitá provize";
  const linkedTipPercent =
    typeof linkedContract?.tipsterPercent === "number" &&
    Number.isFinite(linkedContract.tipsterPercent)
      ? linkedContract.tipsterPercent
      : null;
  const showAdvisorLinkedContractData = isAdvisorMode;

  const client = tip?.fields.find((field) => /jmeno|klient|nazev|ares/.test(normalize(field.label)))?.value || "Neuvedený klient";
  const phone = tip?.fields.find((field) => /telefon/.test(normalize(field.label)))?.value;
  const email = tip?.fields.find((field) => /e-mail|email/.test(normalize(field.label)))?.value;
  const callTime = tip?.fields.filter((field) => /preferovany.*(?:cas|datum)/.test(normalize(field.label))).map((field) => field.value).join(" · ");
  const notes = tip?.fields.filter((field) => /poznamka|popis|vzkaz/.test(normalize(field.label))) ?? [];
  const detailFields = tip?.fields.filter((field) => !notes.includes(field)) ?? [];
  const counterpartEmail = isAdvisorMode ? tip?.tipsterEmail : tip?.recipientEmail;
  const busy = savingStatus || deleting || refreshing;

  return (
    <div className={`${styles.page} ${embedded ? styles.embedded : ""}`}>
      {loading ? <LoadingState /> : !tip ? (
        <section className={styles.errorState}>
          <CircleX size={32} /><h1>Detail se nepodařilo načíst</h1>
          <p role="alert">{error || "Tip nebyl nalezen."}</p>
          {user ? <button type="button" onClick={handleRefresh} disabled={refreshing}><RefreshCw size={16} />Zkusit znovu</button> : null}
          {!embedded ? <Link href="/tipy"><ArrowLeft size={16} />Zpět na tipy</Link> : null}
        </section>
      ) : (
        <>
          <div className={styles.topbar}>
            {embedded ? <span className={styles.breadcrumb}><Lightbulb size={15} />{isAdvisorMode ? "Přijatá příležitost" : "Moje doporučení"}</span> : <Link href="/tipy" className={styles.back}><ArrowLeft size={16} />Zpět na tipy</Link>}
            <button type="button" onClick={handleRefresh} disabled={busy || !user} className={styles.refresh}><RefreshCw size={14} className={refreshing ? styles.spinning : undefined} />Obnovit</button>
          </div>

          <header className={styles.hero}>
            <div className={styles.heroMain}>
              <span className={styles.productIcon}><ProductIcon product={`${tip.product} ${tip.productLabel}`} className="h-7 w-7" /></span>
              <div className={styles.heroCopy}>
                <p className={styles.eyebrow}>{tip.productLabel}</p>
                <h1>{client}</h1>
                <p className={styles.created}><Clock size={13} />Přijato {formatDateTime(tip.createdAtMs)}</p>
              </div>
              <span className={styles.badge} data-status={tipStatus}><StatusIcon status={tipStatus} />{statusMeta.label}</span>
            </div>
            <div className={styles.heroBottom}>
              <p>Vše potřebné pro další krok na jednom místě.</p>
              <div className={styles.contactActions}>
                {phone ? <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className={styles.primaryAction}><Phone size={15} />Zavolat klientovi</a> : null}
                {email ? <a href={`mailto:${encodeURIComponent(email.trim())}`} className={styles.secondaryAction}><Mail size={15} />Napsat e-mail</a> : null}
              </div>
            </div>
          </header>

          {error ? <div className={styles.alert} role="alert"><AlertTriangle size={17} /><span>{error}</span></div> : null}
          {success ? <div className={styles.success} role="status"><CheckCheck size={17} />{success}</div> : null}

          <div className={styles.layout}>
            <div className={styles.main}>
              {callTime ? <div className={styles.callTime}><span><CalendarDays size={21} /></span><div><p>Ideální čas zavolat</p><strong>{callTime}</strong></div></div> : null}
              <section className={styles.panel} aria-labelledby="tip-fields-title">
                <div className={styles.sectionHeading}><span className={styles.sectionIcon}><UserRound size={18} /></span><div><h2 id="tip-fields-title">Klient a podklady</h2><p>Informace předané spolu s tipem.</p></div><span className={styles.count}>{detailFields.length}</span></div>
                {detailFields.length ? <dl className={styles.fields}>{detailFields.map((field, index) => <DetailField key={`${field.label}-${index}`} field={field} onOpenAres={setAresModalIco} />)}</dl> : <p className={styles.empty}>K tipu zatím nejsou vyplněné další údaje.</p>}
                {notes.length ? <div className={styles.notes}>{notes.map((note, index) => <div key={index}><span><MessageSquare size={15} />{note.label}</span><p>{note.value}</p></div>)}</div> : null}
                {!tip.fields.length && tip.messageText ? <div className={styles.notes}><p>{tip.messageText}</p></div> : null}
              </section>

              <section className={styles.panel} aria-labelledby="tip-files-title">
                <div className={styles.sectionHeading}><span className={styles.sectionIcon}><Paperclip size={18} /></span><div><h2 id="tip-files-title">Přílohy k tipu</h2><p>Dokumenty a fotografie od tipaře.</p></div><span className={styles.count}>{tip.attachments.length}</span></div>
                {tip.attachments.length ? <div className={styles.files}>{tip.attachments.map((attachment) => <AttachmentCard key={attachment.id} attachment={attachment} busy={loadingAttachmentId !== null} onOpen={handleOpenAttachment} onDownload={handleDownloadAttachment} />)}</div> : <div className={styles.emptyFiles}><FileText size={26} /><p>Všechno důležité je v údajích výše.<span>K tomuto tipu nejsou přiložené soubory.</span></p></div>}
              </section>

              {hasLinkedContract ? <section className={`${styles.panel} ${styles.contract}`} aria-labelledby="tip-contract-title">
                <div className={styles.sectionHeading}><span className={styles.sectionIcon}><CheckCheck size={19} /></span><div><h2 id="tip-contract-title">Z tipu vznikla smlouva</h2><p>{linkedContractNumber || "Propojená smlouva"}</p></div></div>
                <div className={styles.contractStats}>
                  <div><span>Podíl tipaře</span><strong>{linkedTipPercent != null ? `${linkedTipPercent} %` : "Neuvedeno"}</strong></div>
                  <div><span>Provize tipaře</span><strong>{formatMoney(linkedContract?.tipsterAmountFirstYear)}</strong></div>
                  {showAdvisorLinkedContractData ? <div><span>{linkedContractGrossLabel}</span><strong>{formatMoney(linkedContract?.immediateGrossFirstYear)}</strong></div> : null}
                </div>
                <div className={styles.contractFooter}><p>{linkedContractTipBaseText}</p>{showAdvisorLinkedContractData && linkedContractHref ? <Link href={linkedContractHref} target={embedded ? "_blank" : undefined} rel={embedded ? "noopener noreferrer" : undefined}>Otevřít smlouvu<ExternalLink size={14} /></Link> : null}</div>
              </section> : null}
            </div>

            <aside className={styles.sidebar}>
              <section className={styles.statusPanel} aria-labelledby="tip-status-title">
                <span className={styles.eyebrow}>JAK SI TIP VEDE</span><h2 id="tip-status-title">Stav příležitosti</h2>
                <p>{isAdvisorMode ? "Udržuj tipaře v obraze. Změnu stavu uvidí i ve svém přehledu." : "Aktuální výsledek od poradce. O stav tvého tipu se postará on."}</p>
                <div className={styles.statusOptions}>
                  {TIP_STATUS_OPTIONS.map((option) => {
                    const active = option.key === tipStatus;
                    const description = option.key === "pending" ? "Kontakt čeká na zpracování" : option.key === "contracted" ? "Podařilo se uzavřít obchod" : "Tentokrát to nevyšlo";
                    return isAdvisorMode ? <button key={option.key} type="button" data-status={option.key} aria-pressed={active} disabled={busy} onClick={() => { if (!active) void handleSetStatus(option.key); }}>
                      <span className={styles.statusIcon}><StatusIcon status={option.key} /></span><span><strong>{option.label}</strong><small>{description}</small></span>{active ? <Check size={15} className={styles.selectedCheck} /> : null}
                    </button> : active ? <div key={option.key} className={styles.currentStatus} data-status={option.key}><StatusIcon status={option.key} /><strong>{option.label}</strong></div> : null;
                  })}
                </div>
                {savingStatus ? <span className={styles.saving} role="status"><RefreshCw size={13} className={styles.spinning} />Ukládám změnu…</span> : null}
              </section>
              <section className={styles.personPanel}>
                <span className={styles.eyebrow}>{isAdvisorMode ? "KDO VÁS PROPOJIL" : "TVŮJ PORADCE"}</span>
                <div className={styles.person}><span><UserRound size={22} /></span><div><h2>{counterpartValue}</h2><p>{isAdvisorMode ? "Tipař" : "Poradce"}</p></div></div>
                {counterpartEmail ? <a href={`mailto:${encodeURIComponent(counterpartEmail)}`}><Mail size={14} /><span>{counterpartEmail}</span></a> : null}
                <div className={styles.personNote}><Lightbulb size={15} /><p>{isAdvisorMode ? "Při prvním hovoru zmiň, kdo vás propojil. Známé jméno je dobrý začátek důvěry." : "S dotazy k průběhu se můžeš obrátit přímo na svého poradce."}</p></div>
              </section>
              <button type="button" className={styles.deleteLink} onClick={() => setShowDeleteConfirm(true)} disabled={busy}><Trash2 size={14} />Smazat tento tip</button>
            </aside>
          </div>

          {previewAttachment ? <TipDialog title="Náhled přílohy" subtitle={previewAttachment.name} onClose={closeAttachmentPreview} actions={<button type="button" className={styles.previewDownload} onClick={() => void handleDownloadAttachment(previewAttachment)} disabled={loadingAttachmentId !== null}><Download size={16} />Stáhnout</button>}>
            <div className={styles.previewBody}>
              {isImageAttachment(previewAttachment) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewAttachment.objectUrl} alt={previewAttachment.name} className={styles.previewImage} />
              ) : previewAttachment.pdfData ? <PdfDocumentPreview pdfData={previewAttachment.pdfData} name={previewAttachment.name} /> : <div className={styles.unsupported}><FileText size={36} /><h3>Náhled tohoto formátu není k dispozici</h3><p>Soubor si můžeš stáhnout a otevřít v příslušné aplikaci.</p><button type="button" onClick={() => void handleDownloadAttachment(previewAttachment)} className={styles.primaryAction}><Download size={16} />Stáhnout soubor</button></div>}
            </div>
          </TipDialog> : null}

          {aresModalIco ? <TipDialog title="ARES" subtitle={`IČO ${aresModalIco}`} onClose={() => setAresModalIco(null)}><iframe src={`/pomucky/ares?ico=${encodeURIComponent(aresModalIco)}&embed=1`} title={`ARES IČO ${aresModalIco}`} className={styles.aresFrame} /></TipDialog> : null}

          {showDeleteConfirm ? <TipDialog title="Smazat tip?" onClose={() => setShowDeleteConfirm(false)} busy={deleting} size="small">
            <div className={styles.deleteConfirm}><span><Trash2 size={24} /></span><h3>{client}</h3><p>Tip se odstraní z tvého přehledu. Tuto akci nelze vrátit.</p><div><button type="button" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>Ponechat tip</button><button type="button" onClick={() => void handleDeleteTip()} disabled={deleting} className={styles.confirmDelete}>{deleting ? "Mažu…" : "Smazat tip"}</button></div></div>
          </TipDialog> : null}
        </>
      )}
    </div>
  );
}

function TipDetailPageContent() {
  const searchParams = useSearchParams();
  const embedded = searchParams?.get("embedded") === "1";
  return <AppLayout active="tips" embedded={embedded}><TipDetailContent embedded={embedded} /></AppLayout>;
}

export default function TipDetailPage() {
  return <Suspense fallback={<LoadingState />}><TipDetailPageContent /></Suspense>;
}
