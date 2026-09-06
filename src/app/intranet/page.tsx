"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import dynamic from "next/dynamic";
import type { LucideIcon } from "lucide-react";
import { EmojiStyle, type EmojiClickData } from "emoji-picker-react";
import {
  BarChart3,
  CheckCircle2,
  LayoutGrid,
  BookOpen,
  CarFront,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Clock3,
  CalendarClock,
  Download,
  ExternalLink,
  FileText,
  Heart,
  HeartPulse,
  Home,
  Image as ImageIcon,
  Landmark,
  Link2,
  Loader2,
  MessageSquare,
  Paperclip,
  Pencil,
  Pin,
  Plane,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Smile,
  Sparkles,
  TrendingUp,
  Trash2,
  UserRound,
  Vote,
  Wrench,
  X,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { normalizeProfileAvatar } from "@/lib/profileAvatar";
import { systemSansFont } from "@/lib/fonts";
import { auth } from "@/app/firebase";
import {
  fetchAuthedBlobOrThrow,
  fetchAuthedJsonOrThrow,
} from "@/app/lib/authenticatedApi";
import { useEffectiveUserEmail } from "@/app/lib/useAdminImpersonation";
import {
  INTRANET_SECTIONS,
  INTRANET_SECTION_LABEL_BY_KEY,
  type IntranetSectionKey,
} from "./sections";
import {
  INTRANET_WALL_MAX_SOURCES,
  INTRANET_WALL_SOURCE_MAX_URL_LENGTH,
  intranetWallSourceHost,
  parseIntranetWallSources,
  sanitizeStoredIntranetWallSources,
} from "./wallSources";
import {
  WallPostRichTextEditor,
  type WallPostRichTextEditorHandle,
} from "./WallPostRichTextEditor";
import { splitWallPostTextIntoBoldSegments } from "./wallPostRichText";
import {
  shouldCollapseWallPostText,
  wallPostReadingMinutes,
} from "./wallPostPreview";
import styles from "./intranetWallArt.module.css";
import { matchesWallView, normalizeWallPersonalState, type WallPersonalAction, type WallPersonalState, type WallView } from "./wallPersonal";
import { SolutionAction, SpecialistBadge, WallFeedFilters, WallPostPersonalActions } from "./WallPersonalControls";

type FeedSection = IntranetSectionKey | "all";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

const wallFont = systemSansFont;

const INTRANET_SECTION_KEY_SET = new Set<IntranetSectionKey>(
  INTRANET_SECTIONS.map((section) => section.key)
);

type WallAuthor = {
  uid: string;
  email: string;
  name: string;
  profileAvatar: string;
  specialist?: boolean;
};

type WallAttachment = {
  id: string;
  name: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  isImage: boolean;
  path?: string;
};

type WallPollOption = {
  id: string;
  text: string;
  voteCount: number;
};

type WallPoll = {
  id: string;
  question: string;
  totalVotes: number;
  selectedOptionId: string | null;
  options: WallPollOption[];
};

type WallComment = {
  id: string;
  text: string;
  createdAtMs: number | null;
  author: WallAuthor;
  likeCount: number;
  likedByMe: boolean;
  parentCommentId: string | null;
  replies: WallCommentReply[];
};

type WallCommentReply = {
  id: string;
  text: string;
  createdAtMs: number | null;
  author: WallAuthor;
  likeCount: number;
  likedByMe: boolean;
  parentCommentId: string;
};

type WallPost = WallPersonalState & {
  id: string;
  title: string;
  text: string;
  section: IntranetSectionKey;
  sectionLabel: string;
  createdAtMs: number | null;
  updatedAtMs: number | null;
  pinned: boolean;
  acceptedCommentId: string | null;
  readByDay: string | null;
  commentCount: number;
  likeCount: number;
  likedByMe: boolean;
  author: WallAuthor;
  attachments: WallAttachment[];
  sources: string[];
  comments: WallComment[];
  poll: WallPoll | null;
};

type WallApiResponse = {
  ok?: boolean;
  error?: string;
  posts?: WallPost[];
  hasMore?: boolean;
  nextCursorMs?: number | null;
  nextCursorId?: string | null;
};

type WallCreateResponse = {
  ok?: boolean;
  error?: string;
  postId?: string;
};

type WallDeleteResponse = {
  ok?: boolean;
  error?: string;
  postId?: string;
};

type WallUpdateResponse = {
  ok?: boolean;
  error?: string;
  postId?: string;
};

type WallCommentCreateResponse = {
  ok?: boolean;
  error?: string;
  commentId?: string;
};

type WallLikeResponse = {
  ok?: boolean;
  error?: string;
  postId?: string;
  likeCount?: number;
  likedByMe?: boolean;
};

type WallPollVoteResponse = {
  ok?: boolean;
  error?: string;
  postId?: string;
  poll?: WallPoll;
};

type WallCommentLikeResponse = {
  ok?: boolean;
  error?: string;
  postId?: string;
  commentId?: string;
  likeCount?: number;
  likedByMe?: boolean;
};

type AttachmentPreviewState = {
  attachment: WallAttachment;
  objectUrl: string | null;
  /**
   * PDF.js on iOS/WebKit cannot reliably load a blob: URL. Keep the already
   * authenticated response bytes for the canvas renderer instead.
   */
  pdfData: Uint8Array | null;
  loading: boolean;
  error: string | null;
};

type PdfRenderedPage = {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
};

type PdfViewportLike = {
  width: number;
  height: number;
};

type PdfRenderTaskLike = {
  promise: Promise<void>;
};

type PdfPageLike = {
  getViewport: (params: { scale: number }) => PdfViewportLike;
  render: (params: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewportLike;
    transform?: [number, number, number, number, number, number];
  }) => PdfRenderTaskLike;
};

type PdfDocumentLike = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageLike>;
  destroy: () => Promise<void>;
};

type SectionVisual = {
  icon: LucideIcon;
  chipActive: string;
  chipGlow: string;
  badge: string;
  rail: string;
  avatarBg: string;
  postAccent: string;
};

const SECTION_VISUALS: Record<IntranetSectionKey, SectionVisual> = {
  zivot: {
    icon: HeartPulse,
    chipActive:
      "border-rose-500 bg-[linear-gradient(135deg,#fb7185_0%,#e11d48_100%)] text-white",
    chipGlow: "shadow-[0_16px_36px_rgba(225,29,72,0.35)]",
    badge: "border-rose-200/80 bg-rose-50/80 text-rose-800",
    rail: "from-rose-500 via-pink-500 to-fuchsia-500",
    avatarBg: "bg-rose-100 text-rose-700",
    postAccent: "ring-rose-100/80",
  },
  majetek: {
    icon: Home,
    chipActive:
      "border-cyan-500 bg-[linear-gradient(135deg,#22d3ee_0%,#0e7490_100%)] text-white",
    chipGlow: "shadow-[0_16px_36px_rgba(8,145,178,0.3)]",
    badge: "border-cyan-200/80 bg-cyan-50/80 text-cyan-800",
    rail: "from-cyan-400 via-sky-500 to-blue-500",
    avatarBg: "bg-cyan-100 text-cyan-800",
    postAccent: "ring-cyan-100/80",
  },
  auto: {
    icon: CarFront,
    chipActive:
      "border-blue-500 bg-[linear-gradient(135deg,#60a5fa_0%,#1d4ed8_100%)] text-white",
    chipGlow: "shadow-[0_16px_36px_rgba(29,78,216,0.35)]",
    badge: "border-blue-200/80 bg-blue-50/80 text-blue-800",
    rail: "from-blue-500 via-indigo-500 to-violet-500",
    avatarBg: "bg-blue-100 text-blue-700",
    postAccent: "ring-blue-100/80",
  },
  odpovednost: {
    icon: ShieldCheck,
    chipActive:
      "border-emerald-500 bg-[linear-gradient(135deg,#34d399_0%,#047857_100%)] text-white",
    chipGlow: "shadow-[0_16px_36px_rgba(4,120,87,0.35)]",
    badge: "border-emerald-200/80 bg-emerald-50/80 text-emerald-800",
    rail: "from-emerald-400 via-emerald-500 to-teal-500",
    avatarBg: "bg-emerald-100 text-emerald-700",
    postAccent: "ring-emerald-100/80",
  },
  cizinci: {
    icon: UserRound,
    chipActive:
      "border-indigo-500 bg-[linear-gradient(135deg,#818cf8_0%,#4338ca_100%)] text-white",
    chipGlow: "shadow-[0_16px_36px_rgba(67,56,202,0.32)]",
    badge: "border-indigo-200/80 bg-indigo-50/80 text-indigo-800",
    rail: "from-indigo-400 via-indigo-500 to-blue-600",
    avatarBg: "bg-indigo-100 text-indigo-700",
    postAccent: "ring-indigo-100/80",
  },
  cestovko: {
    icon: Plane,
    chipActive:
      "border-sky-500 bg-[linear-gradient(135deg,#38bdf8_0%,#0369a1_100%)] text-white",
    chipGlow: "shadow-[0_16px_36px_rgba(3,105,161,0.3)]",
    badge: "border-sky-200/80 bg-sky-50/80 text-sky-800",
    rail: "from-sky-400 via-sky-500 to-cyan-500",
    avatarBg: "bg-sky-100 text-sky-700",
    postAccent: "ring-sky-100/80",
  },
  investice: {
    icon: TrendingUp,
    chipActive:
      "border-amber-500 bg-[linear-gradient(135deg,#f59e0b_0%,#b45309_100%)] text-white",
    chipGlow: "shadow-[0_16px_36px_rgba(180,83,9,0.35)]",
    badge: "border-amber-200/80 bg-amber-50/80 text-amber-800",
    rail: "from-amber-400 via-orange-500 to-orange-600",
    avatarBg: "bg-amber-100 text-amber-700",
    postAccent: "ring-amber-100/80",
  },
  zlato: {
    icon: Landmark,
    chipActive:
      "border-yellow-500 bg-[linear-gradient(135deg,#facc15_0%,#ca8a04_100%)] text-slate-900",
    chipGlow: "shadow-[0_16px_36px_rgba(202,138,4,0.35)]",
    badge: "border-yellow-200/80 bg-yellow-50/80 text-yellow-900",
    rail: "from-yellow-300 via-amber-400 to-orange-500",
    avatarBg: "bg-yellow-100 text-amber-700",
    postAccent: "ring-yellow-100/80",
  },
  obecne: {
    icon: Wrench,
    chipActive:
      "border-slate-700 bg-[linear-gradient(135deg,#334155_0%,#0f172a_100%)] text-white",
    chipGlow: "shadow-[0_16px_36px_rgba(15,23,42,0.35)]",
    badge: "border-slate-200/80 bg-slate-100/80 text-slate-800",
    rail: "from-slate-500 via-slate-700 to-slate-900",
    avatarBg: "bg-slate-200 text-slate-700",
    postAccent: "ring-slate-200/80",
  },
  pomoc: {
    icon: CircleHelp,
    chipActive:
      "border-orange-500 bg-[linear-gradient(135deg,#fb923c_0%,#c2410c_100%)] text-white",
    chipGlow: "shadow-[0_16px_36px_rgba(194,65,12,0.35)]",
    badge: "border-orange-200/80 bg-orange-50/80 text-orange-800",
    rail: "from-orange-400 via-orange-500 to-red-500",
    avatarBg: "bg-orange-100 text-orange-700",
    postAccent: "ring-orange-100/80",
  },
};

const MAX_TITLE_LEN = 140;
const MAX_TEXT_LEN = 6000;
const MAX_FILES = 6;
const POSTS_PAGE_SIZE = 10;
const MAX_POLL_QUESTION_LEN = 180;
const MAX_POLL_OPTION_LEN = 100;
const MAX_POLL_OPTIONS = 8;
const MIN_POLL_OPTIONS = 2;
const MAX_COMMENT_LEN = 2000;
const QUICK_EMOJIS = [
  "👏",
  "🔥",
  "💪",
  "✅",
  "🚀",
  "🎯",
  "📈",
  "🙏",
  "🙂",
  "😄",
  "🤝",
  "🏆",
  "⭐",
  "❤️",
  "📌",
  "💬",
  "👍",
  "👎",
  "🙌",
  "👌",
  "🤔",
  "👀",
  "💡",
  "❗",
  "❓",
  "⚠️",
  "⏰",
  "📣",
  "📝",
  "📎",
  "📊",
  "💰",
  "🎉",
  "🥳",
  "🤩",
  "😎",
  "😂",
  "😅",
  "😊",
  "😍",
  "😮",
  "😢",
  "😡",
  "🤯",
  "🫶",
  "🤞",
  "💯",
  "🔝",
  "🌟",
  "✨",
  "🧠",
  "📚",
  "🧾",
  "📅",
  "☎️",
  "💻",
  "🔒",
  "🔓",
  "🟢",
  "🟡",
  "🔴",
];

const normalizeEmail = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

const formatDateTime = (valueMs: number | null | undefined): string => {
  if (!valueMs || !Number.isFinite(valueMs)) return "—";
  return new Date(valueMs).toLocaleString("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const formatBytes = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${Math.floor(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const filePreviewKey = (file: File, index: number): string =>
  `${file.name}::${file.size}::${file.lastModified}::${index}`;

const isPreviewableImage = (file: File): boolean => {
  const type = file.type.trim().toLowerCase();
  if (type === "image/png" || type === "image/jpeg" || type === "image/jpg") {
    return true;
  }
  const name = file.name.toLowerCase();
  return name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg");
};

const replyComposerKey = (postId: string, commentId: string): string =>
  `${postId}::${commentId}`;

const isPdfAttachment = (attachment: WallAttachment): boolean => {
  const type = attachment.contentType.trim().toLowerCase();
  return type === "application/pdf" || attachment.name.toLowerCase().endsWith(".pdf");
};

const isPreviewableAttachment = (attachment: WallAttachment): boolean =>
  attachment.isImage || isPdfAttachment(attachment);

const attachmentPreviewUrlCache = new Map<string, string>();
const attachmentPreviewInflightCache = new Map<string, Promise<string>>();
const pdfFirstPagePreviewCache = new Map<string, PdfRenderedPage>();

type RichTextSegment =
  | { kind: "text"; value: string }
  | { kind: "link"; value: string; href: string };

const trimUrlCandidate = (value: string): string => {
  let trimmed = value.trim();
  while (trimmed && !/[\p{L}\p{N}/#%=&_+~.-]/u.test(trimmed.slice(-1))) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
};

const normalizeLinkHref = (value: string): string | null => {
  const trimmed = trimUrlCandidate(value);
  if (!trimmed) return null;
  try {
    const url = new URL(/^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
};

const splitTextIntoLinkSegments = (value: string): RichTextSegment[] => {
  const segments: RichTextSegment[] = [];
  const regex = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
  let cursor = 0;

  for (const match of value.matchAll(regex)) {
    const raw = match[0] ?? "";
    const start = match.index ?? 0;
    const linkText = trimUrlCandidate(raw);
    const href = normalizeLinkHref(linkText);
    if (!linkText || !href) continue;

    if (start > cursor) {
      segments.push({ kind: "text", value: value.slice(cursor, start) });
    }
    segments.push({ kind: "link", value: linkText, href });
    cursor = start + linkText.length;
  }

  if (cursor < value.length) {
    segments.push({ kind: "text", value: value.slice(cursor) });
  }

  return segments.length ? segments : [{ kind: "text", value }];
};

function LinkedText({ text, className }: { text: string; className: string }) {
  const segments = useMemo(() => splitTextIntoLinkSegments(text), [text]);

  return (
    <p className={className}>
      {segments.map((segment, index) =>
        segment.kind === "link" ? (
          <a
            key={`${segment.href}-${index}`}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-sky-700 underline decoration-sky-300 underline-offset-2 transition hover:text-sky-900 hover:decoration-sky-600"
          >
            {segment.value}
          </a>
        ) : (
          splitWallPostTextIntoBoldSegments(segment.value).map((inlineSegment, inlineIndex) =>
            inlineSegment.bold ? (
              <strong key={`text-${index}-${inlineIndex}`} className="font-bold text-slate-900">
                {inlineSegment.value}
              </strong>
            ) : (
              <span key={`text-${index}-${inlineIndex}`}>{inlineSegment.value}</span>
            )
          )
        )
      )}
    </p>
  );
}

const insertAtTextAreaSelection = ({
  currentValue,
  insertion,
  maxLength,
  textarea,
}: {
  currentValue: string;
  insertion: string;
  maxLength: number;
  textarea: HTMLTextAreaElement | null;
}): { value: string; cursor: number } => {
  const startRaw = textarea?.selectionStart ?? currentValue.length;
  const endRaw = textarea?.selectionEnd ?? currentValue.length;
  const start = Math.min(Math.max(startRaw, 0), currentValue.length);
  const end = Math.min(Math.max(endRaw, start), currentValue.length);
  const baseLength = currentValue.length - (end - start);
  const remainingLength = Math.max(0, maxLength - baseLength);
  const inserted = insertion.slice(0, remainingLength);
  const value = `${currentValue.slice(0, start)}${inserted}${currentValue.slice(end)}`;

  return {
    value,
    cursor: Math.min(start + inserted.length, value.length),
  };
};

const restoreTextAreaCursor = (textarea: HTMLTextAreaElement | null, cursor: number) => {
  if (!textarea || typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor);
  });
};

const normalizeWallPosts = (rawPosts: WallPost[]): WallPost[] =>
  rawPosts.map((post) => ({
    ...post,
    ...normalizeWallPersonalState(post),
    acceptedCommentId: post.section === "pomoc" ? post.acceptedCommentId ?? null : null,
    author: {
      ...post.author,
      profileAvatar: normalizeProfileAvatar(post.author.profileAvatar),
    },
    comments: post.comments.map((comment) => ({
      ...comment,
      author: {
        ...comment.author,
        profileAvatar: normalizeProfileAvatar(comment.author.profileAvatar),
      },
      replies: comment.replies.map((reply) => ({
        ...reply,
        author: {
          ...reply.author,
          profileAvatar: normalizeProfileAvatar(reply.author.profileAvatar),
        },
      })),
    })),
    pinned: post.pinned === true,
    readByDay:
      typeof post.readByDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(post.readByDay)
        ? post.readByDay
        : null,
    likeCount:
      Number.isFinite(post.likeCount) && post.likeCount >= 0
        ? Math.floor(post.likeCount)
        : 0,
    likedByMe: post.likedByMe === true,
    sources: sanitizeStoredIntranetWallSources(post.sources),
    poll: post.poll
      ? {
          ...post.poll,
          totalVotes:
            Number.isFinite(post.poll.totalVotes) && post.poll.totalVotes >= 0
              ? Math.floor(post.poll.totalVotes)
              : 0,
          selectedOptionId: post.poll.selectedOptionId ?? null,
          options: Array.isArray(post.poll.options)
            ? post.poll.options.map((option) => ({
                ...option,
                voteCount:
                  Number.isFinite(option.voteCount) && option.voteCount >= 0
                    ? Math.floor(option.voteCount)
                    : 0,
              }))
            : [],
        }
      : null,
  }));

function AttachmentImagePreview({
  attachment,
  user,
  onOpen,
}: {
  attachment: WallAttachment;
  user: FirebaseUser | null;
  onOpen: (attachment: WallAttachment) => void;
}) {
  const previewCacheKey = attachment.url;
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    () => attachmentPreviewUrlCache.get(previewCacheKey) ?? null
  );
  const [failed, setFailed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const previewRef = useRef<HTMLButtonElement | null>(null);
  const loading = isVisible && !!user && !previewUrl && !failed;

  useEffect(() => {
    const node = previewRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      const frame = window.requestAnimationFrame(() => setIsVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "1200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || !user || !attachment.isImage) return;

    let active = true;
    const existingRequest = attachmentPreviewInflightCache.get(previewCacheKey);
    const request =
      existingRequest ??
      fetchAuthedBlobOrThrow(user, attachment.url, { cache: "force-cache" }).then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        attachmentPreviewUrlCache.set(previewCacheKey, objectUrl);
        return objectUrl;
      });

    if (!existingRequest) {
      attachmentPreviewInflightCache.set(previewCacheKey, request);
    }

    request
      .then((objectUrl) => {
        if (active) {
          setFailed(false);
          setPreviewUrl(objectUrl);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (attachmentPreviewInflightCache.get(previewCacheKey) === request) {
          attachmentPreviewInflightCache.delete(previewCacheKey);
        }
      });

    return () => {
      active = false;
    };
  }, [attachment.isImage, attachment.url, isVisible, previewCacheKey, user]);

  return (
    <button
      ref={previewRef}
      type="button"
      onClick={() => onOpen(attachment)}
      className="group flex w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left text-xs font-semibold text-slate-600 shadow-[0_8px_22px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_30px_rgba(15,23,42,0.1)]"
    >
      <span className="flex h-44 w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_100%)]">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={`Náhled ${attachment.name}`}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.02]"
          />
        ) : loading ? (
          <span className="inline-flex items-center gap-2 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Načítám náhled
          </span>
        ) : failed ? (
          <span className="inline-flex items-center gap-2 text-slate-500">
            <ImageIcon className="h-4 w-4" />
            Otevřít obrázek
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-slate-500">
            <ImageIcon className="h-4 w-4" />
            Připravuji náhled
          </span>
        )}
      </span>
      <span className="flex w-full min-w-0 items-center gap-2.5 border-t border-slate-200 px-3 py-2.5">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 ring-1 ring-sky-100">
          <ImageIcon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-bold text-slate-800">{attachment.name}</span>
          <span className="mt-0.5 block text-[11px] font-medium text-slate-500">
            Obrázek • {formatBytes(attachment.sizeBytes)}
          </span>
        </span>
      </span>
    </button>
  );
}

function PdfAttachmentThumbnail({
  attachment,
  user,
  onOpen,
}: {
  attachment: WallAttachment;
  user: FirebaseUser | null;
  onOpen: (attachment: WallAttachment) => void;
}) {
  const previewCacheKey = attachment.url;
  const [preview, setPreview] = useState<PdfRenderedPage | null>(
    () => pdfFirstPagePreviewCache.get(previewCacheKey) ?? null
  );
  const [failed, setFailed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const previewRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const node = previewRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      const frame = window.requestAnimationFrame(() => setIsVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "900px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || !user || !isPdfAttachment(attachment) || preview || failed) return;

    let active = true;
    let loadingTask: { destroy: () => void } | null = null;
    let pdfDocument: PdfDocumentLike | null = null;
    setLoading(true);

    const renderPreview = async () => {
      try {
        const blob = await fetchAuthedBlobOrThrow(user, attachment.url, {
          cache: "force-cache",
        });
        const pdfjs = await import("pdfjs-dist");
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/build/pdf.worker.min.mjs",
            import.meta.url
          ).toString();
        }

        const task = pdfjs.getDocument({
          data: new Uint8Array(await blob.arrayBuffer()),
        });
        loadingTask = task;
        pdfDocument = (await task.promise) as unknown as PdfDocumentLike;
        const firstPage = await pdfDocument.getPage(1);
        const viewport = firstPage.getViewport({ scale: 0.92 });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Prohlížeč nepodporuje náhled PDF.");

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        await firstPage.render({
          canvas,
          canvasContext: context,
          viewport,
          transform:
            outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        }).promise;

        const renderedPage: PdfRenderedPage = {
          pageNumber: 1,
          dataUrl: canvas.toDataURL("image/png"),
          width: viewport.width,
          height: viewport.height,
        };
        pdfFirstPagePreviewCache.set(previewCacheKey, renderedPage);
        if (active) setPreview(renderedPage);
      } catch {
        if (active) setFailed(true);
      } finally {
        if (pdfDocument) void pdfDocument.destroy();
        loadingTask?.destroy();
        if (active) setLoading(false);
      }
    };

    void renderPreview();
    return () => {
      active = false;
      loadingTask?.destroy();
      if (pdfDocument) void pdfDocument.destroy();
    };
  }, [attachment, failed, isVisible, preview, previewCacheKey, user]);

  return (
    <button
      ref={previewRef}
      type="button"
      onClick={() => onOpen(attachment)}
      className="group relative flex h-44 w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 transition hover:border-slate-400 hover:shadow-[0_12px_28px_rgba(15,23,42,0.12)]"
      aria-label={`Otevřít náhled přílohy ${attachment.name}`}
    >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.dataUrl}
          alt={`První strana ${attachment.name}`}
          className="h-full max-w-full object-contain"
        />
      ) : loading ? (
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Načítám náhled
        </span>
      ) : (
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
          <FileText className="h-4 w-4" />
          {failed ? "Otevřít PDF" : "Připravuji náhled"}
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent_0%,rgba(15,23,42,0.8)_100%)] px-3 pb-2 pt-6 text-left text-[11px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
        Otevřít náhled
      </span>
    </button>
  );
}

function AttachmentDocumentPreviewCard({
  attachment,
  user,
  onPreview,
  onDownload,
}: {
  attachment: WallAttachment;
  user: FirebaseUser | null;
  onPreview: (attachment: WallAttachment) => void;
  onDownload: (attachment: WallAttachment) => void;
}) {
  if (!isPdfAttachment(attachment)) {
    return (
      <AttachmentFileCard
        attachment={attachment}
        onPreview={onPreview}
        onDownload={onDownload}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
      <PdfAttachmentThumbnail attachment={attachment} user={user} onOpen={onPreview} />
      <div className="p-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-700">
            <FileText className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => onPreview(attachment)}
              className="block max-w-full truncate text-left text-xs font-bold text-slate-800 underline-offset-2 hover:underline"
            >
              {attachment.name}
            </button>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <span className="rounded-full border border-red-100 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700">
                PDF
              </span>
              <span>{formatBytes(attachment.sizeBytes)}</span>
            </div>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => onPreview(attachment)}
            className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 transition hover:border-slate-500 hover:bg-slate-100"
          >
            <FileText className="h-3.5 w-3.5" />
            Náhled
          </button>
          <button
            type="button"
            onClick={() => onDownload(attachment)}
            className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 transition hover:border-slate-500 hover:bg-slate-100"
          >
            <Download className="h-3.5 w-3.5" />
            Stáhnout
          </button>
        </div>
      </div>
    </div>
  );
}

function PdfPagePreview({
  pageNumber,
  page,
  error,
  onRender,
}: {
  pageNumber: number;
  page: PdfRenderedPage | undefined;
  error: string | undefined;
  onRender: (pageNumber: number) => void;
}) {
  const pageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (page || error) return;
    const node = pageRef.current;
    if (!node) return;

    if (pageNumber === 1 || typeof IntersectionObserver === "undefined") {
      onRender(pageNumber);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onRender(pageNumber);
          observer.disconnect();
        }
      },
      { rootMargin: "900px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [error, onRender, page, pageNumber]);

  return (
    <div
      ref={pageRef}
      className="w-full max-w-[920px] overflow-hidden rounded-xl bg-white shadow-[0_14px_44px_rgba(15,23,42,0.14)] ring-1 ring-slate-200"
      style={{ aspectRatio: page ? `${page.width} / ${page.height}` : "210 / 297" }}
    >
      {page ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={page.dataUrl}
          alt={`Strana ${page.pageNumber}`}
          className="h-auto w-full"
          style={{ aspectRatio: `${page.width} / ${page.height}` }}
        />
      ) : error ? (
        <div className="flex h-full min-h-40 items-center justify-center px-4 text-center text-xs font-semibold text-red-700">
          {error}
        </div>
      ) : (
        <div className="flex h-full min-h-40 items-center justify-center">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Strana {pageNumber}
          </div>
        </div>
      )}
    </div>
  );
}

function PdfDocumentPreview({
  pdfData,
  name,
  cacheKey,
}: {
  pdfData: Uint8Array;
  name: string;
  cacheKey: string;
}) {
  const [pagesByNumber, setPagesByNumber] = useState<Record<number, PdfRenderedPage>>({});
  const [pageErrorsByNumber, setPageErrorsByNumber] = useState<Record<number, string>>({});
  const [loadingDocument, setLoadingDocument] = useState(true);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const pdfDocumentRef = useRef<PdfDocumentLike | null>(null);
  const renderingPagesRef = useRef<Set<number>>(new Set());
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: { destroy: () => void } | null = null;
    const cachedFirstPage = pdfFirstPagePreviewCache.get(cacheKey);

    setPagesByNumber(cachedFirstPage ? { 1: cachedFirstPage } : {});
    setPageErrorsByNumber({});
    setLoadingDocument(true);
    setDocumentError(null);
    setTotalPages(0);
    renderingPagesRef.current.clear();

    if (pdfDocumentRef.current) {
      void pdfDocumentRef.current.destroy();
      pdfDocumentRef.current = null;
    }

    const loadPdf = async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/build/pdf.worker.min.mjs",
            import.meta.url
          ).toString();
        }

        // Supplying bytes avoids a second fetch of a blob: URL. That fetch
        // works in desktop Chromium but returns response 0 in iOS WebKit on
        // the public domain. Pass a copy because PDF.js may transfer its
        // input buffer to the worker.
        const task = pdfjs.getDocument({ data: pdfData.slice() });
        loadingTask = task;
        const pdf = (await task.promise) as unknown as PdfDocumentLike;
        if (cancelled) {
          void pdf.destroy();
          return;
        }

        pdfDocumentRef.current = pdf;
        setTotalPages(pdf.numPages);
        setLoadingDocument(false);
      } catch (loadError) {
        if (cancelled) return;
        setLoadingDocument(false);
        setDocumentError(
          loadError instanceof Error ? loadError.message : "PDF se nepodařilo načíst."
        );
      }
    };

    void loadPdf();

    return () => {
      cancelled = true;
      loadingTask?.destroy();
      if (pdfDocumentRef.current) {
        void pdfDocumentRef.current.destroy();
        pdfDocumentRef.current = null;
      }
    };
  }, [cacheKey, pdfData]);

  const renderPage = useCallback(
    async (pageNumber: number) => {
      const pdf = pdfDocumentRef.current;
      if (!pdf || pageNumber < 1 || pageNumber > pdf.numPages) return;
      if (pagesByNumber[pageNumber] || renderingPagesRef.current.has(pageNumber)) return;

      const cachedFirstPage =
        pageNumber === 1 ? pdfFirstPagePreviewCache.get(cacheKey) : undefined;
      if (cachedFirstPage) {
        setPagesByNumber((prev) => ({ ...prev, 1: cachedFirstPage }));
        return;
      }

      renderingPagesRef.current.add(pageNumber);
      setPageErrorsByNumber((prev) => {
        if (!prev[pageNumber]) return prev;
        const next = { ...prev };
        delete next[pageNumber];
        return next;
      });

      try {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.55 });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Prohlížeč nepodporuje canvas náhled PDF.");
        }

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);

        await page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform:
            outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        }).promise;

        const renderedPage: PdfRenderedPage = {
          pageNumber,
          dataUrl: canvas.toDataURL("image/png"),
          width: viewport.width,
          height: viewport.height,
        };

        if (pageNumber === 1) {
          pdfFirstPagePreviewCache.set(cacheKey, renderedPage);
        }

        if (mountedRef.current && pdfDocumentRef.current === pdf) {
          setPagesByNumber((prev) => ({ ...prev, [pageNumber]: renderedPage }));
        }
      } catch (renderError) {
        if (!mountedRef.current || pdfDocumentRef.current !== pdf) return;
        setPageErrorsByNumber((prev) => ({
          ...prev,
          [pageNumber]:
            renderError instanceof Error
              ? renderError.message
              : "Stranu se nepodařilo zobrazit.",
        }));
      } finally {
        renderingPagesRef.current.delete(pageNumber);
      }
    },
    [cacheKey, pagesByNumber]
  );

  useEffect(() => {
    if (!loadingDocument && totalPages > 0) {
      void renderPage(1);
    }
  }, [loadingDocument, renderPage, totalPages]);

  if (documentError) {
    return (
      <div className="flex min-h-[54vh] items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-5 text-center text-sm font-semibold text-red-700">
        {documentError}
      </div>
    );
  }

  if (loadingDocument && totalPages === 0) {
    return (
      <div className="flex min-h-[54vh] items-center justify-center rounded-2xl bg-white">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Připravuji PDF náhled
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-4">
      <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
        {name} • {totalPages} {totalPages === 1 ? "strana" : "stran"}
      </div>

      {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
        <PdfPagePreview
          key={pageNumber}
          pageNumber={pageNumber}
          page={pagesByNumber[pageNumber]}
          error={pageErrorsByNumber[pageNumber]}
          onRender={(nextPageNumber) => {
            void renderPage(nextPageNumber);
          }}
        />
      ))}
    </div>
  );
}

function AttachmentFileCard({
  attachment,
  onPreview,
  onDownload,
}: {
  attachment: WallAttachment;
  onPreview: (attachment: WallAttachment) => void;
  onDownload: (attachment: WallAttachment) => void;
}) {
  const isPdf = isPdfAttachment(attachment);
  const AttachmentIcon = isPdf ? FileText : Paperclip;
  const PreviewIcon = isPdf ? FileText : ImageIcon;

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white/95 p-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className={[
            "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
            isPdf
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-slate-200 bg-slate-50 text-slate-600",
          ].join(" ")}
        >
          <AttachmentIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => onPreview(attachment)}
            className="block max-w-full truncate text-left text-xs font-bold text-slate-800 underline-offset-2 hover:underline"
          >
            {attachment.name}
          </button>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-slate-500">
            {isPdf ? (
              <span className="rounded-full border border-red-100 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700">
                PDF
              </span>
            ) : null}
            <span>{attachment.contentType}</span>
            <span>•</span>
            <span>{formatBytes(attachment.sizeBytes)}</span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPreview(attachment)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:border-slate-500 hover:bg-slate-100"
        >
          <PreviewIcon className="h-3.5 w-3.5" />
          Náhled
        </button>
        <button
          type="button"
          onClick={() => onDownload(attachment)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:border-slate-500 hover:bg-slate-100"
        >
          <Download className="h-3.5 w-3.5" />
          Stáhnout
        </button>
      </div>
    </div>
  );
}

function PollCard({
  postId,
  poll,
  votingOptionId,
  error,
  onVote,
}: {
  postId: string;
  poll: WallPoll;
  votingOptionId: string | null | undefined;
  error: string | null | undefined;
  onVote: (postId: string, optionId: string) => void;
}) {
  return (
    <div className="mt-3 rounded-2xl border border-emerald-200/80 bg-[linear-gradient(150deg,rgba(240,253,244,0.92)_0%,rgba(255,255,255,0.96)_100%)] p-3 shadow-[0_12px_32px_rgba(16,185,129,0.1)]">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-700">
            <Vote className="h-3.5 w-3.5" />
            Hlasování
          </div>
          <div className="mt-2 text-sm font-bold text-slate-900">{poll.question}</div>
        </div>
        <div className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">
          {poll.totalVotes} {poll.totalVotes === 1 ? "hlas" : poll.totalVotes > 1 && poll.totalVotes < 5 ? "hlasy" : "hlasů"}
        </div>
      </div>

      <div className="space-y-2">
        {poll.options.map((option) => {
          const isSelected = poll.selectedOptionId === option.id;
          const isVoting = votingOptionId === option.id;
          const percent =
            poll.totalVotes > 0 ? Math.round((option.voteCount / poll.totalVotes) * 100) : 0;

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onVote(postId, option.id)}
              disabled={!!votingOptionId}
              className={[
                "group relative w-full overflow-hidden rounded-xl border bg-white px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-75",
                isSelected
                  ? "border-emerald-300 shadow-[0_10px_24px_rgba(16,185,129,0.16)]"
                  : "border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/35",
              ].join(" ")}
            >
              <span
                className="absolute inset-y-0 left-0 bg-emerald-100/80 transition-all"
                style={{ width: `${percent}%` }}
                aria-hidden="true"
              />
              <span className="relative flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={[
                      "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                      isSelected
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-slate-300 bg-white text-slate-500",
                    ].join(" ")}
                  >
                    {isVoting ? <Loader2 className="h-3 w-3 animate-spin" /> : isSelected ? "✓" : ""}
                  </span>
                  <span className="truncate text-xs font-semibold text-slate-800">
                    {option.text}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] font-bold text-slate-600">
                  {percent}% · {option.voteCount}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {error ? (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export default function IntranetPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const effectiveEmail = useEffectiveUserEmail(user?.email);
  const [selectedSection, setSelectedSection] = useState<FeedSection>("all");
  const [view, setView] = useState<WallView>("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [postsCursorId, setPostsCursorId] = useState<string | null>(null);
  const [personalBusy, setPersonalBusy] = useState<Record<string, boolean>>({});
  const [personalErrors, setPersonalErrors] = useState<Record<string, string | null>>({});
  const personalRequests = useRef(new Set<string>());
  const feedRequestId = useRef(0);
  const accountRef = useRef(effectiveEmail);
  accountRef.current = effectiveEmail;
  const feedKey = JSON.stringify([effectiveEmail, selectedSection, view, searchQuery]);
  const feedKeyRef = useRef(feedKey);
  feedKeyRef.current = feedKey;

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);
  const [posts, setPosts] = useState<WallPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [loadingOlderPosts, setLoadingOlderPosts] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [olderPostsError, setOlderPostsError] = useState<string | null>(null);
  const [postsHasMore, setPostsHasMore] = useState(false);
  const [postsCursorMs, setPostsCursorMs] = useState<number | null>(null);

  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [postSection, setPostSection] = useState<IntranetSectionKey>("obecne");
  const [postPinned, setPostPinned] = useState(false);
  const [postReadByDay, setPostReadByDay] = useState("");
  const [postSources, setPostSources] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [filePreviewUrls, setFilePreviewUrls] = useState<Record<string, string>>({});
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<WallPost | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreviewState | null>(null);
  const [sourcesModalPost, setSourcesModalPost] = useState<WallPost | null>(null);
  const [readerPost, setReaderPost] = useState<WallPost | null>(null);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [replacementFilesByAttachmentId, setReplacementFilesByAttachmentId] = useState<
    Record<string, File>
  >({});
  const [replaceAttachmentTargetId, setReplaceAttachmentTargetId] = useState<string | null>(null);

  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentPostingById, setCommentPostingById] = useState<Record<string, boolean>>({});
  const [commentErrorById, setCommentErrorById] = useState<Record<string, string | null>>({});
  const [replyDraftsById, setReplyDraftsById] = useState<Record<string, string>>({});
  const [replyPostingById, setReplyPostingById] = useState<Record<string, boolean>>({});
  const [replyErrorById, setReplyErrorById] = useState<Record<string, string | null>>({});
  const [replyComposerOpenById, setReplyComposerOpenById] = useState<Record<string, boolean>>({});
  const [commentLikePostingById, setCommentLikePostingById] = useState<Record<string, boolean>>({});
  const [expandedCommentsById, setExpandedCommentsById] = useState<Record<string, boolean>>({});
  const [commentComposerOpenById, setCommentComposerOpenById] = useState<Record<string, boolean>>(
    {}
  );
  const [likePostingById, setLikePostingById] = useState<Record<string, boolean>>({});
  const [pollVotingByPostId, setPollVotingByPostId] = useState<Record<string, string | null>>({});
  const [pollErrorByPostId, setPollErrorByPostId] = useState<Record<string, string | null>>({});
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [pendingFocusPostId, setPendingFocusPostId] = useState<string | null>(null);
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);
  const [deepLinkSection, setDeepLinkSection] = useState<IntranetSectionKey | null>(
    null
  );
  const [deepLinkPostId, setDeepLinkPostId] = useState<string | null>(null);

  const readerDialogRef = useRef<HTMLDivElement | null>(null);
  const readerTriggerRef = useRef<HTMLElement | null>(null);
  const readerPostId = readerPost?.id;
  useEffect(() => {
    if (!readerPostId) return;
    readerDialogRef.current?.focus();
    return () => {
      const trigger = readerTriggerRef.current;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      else document.querySelector<HTMLElement>('[aria-label="Zobrazení příspěvků"] [aria-pressed="true"]')?.focus({ preventScroll: true });
    };
  }, [readerPostId]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const postTextEditorRef = useRef<WallPostRichTextEditorHandle | null>(null);
  const commentInputRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const replyInputRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const postCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const dragDepthRef = useRef(0);
  const highlightTimerRef = useRef<number | null>(null);
  const attachmentPreviewRequestIdRef = useRef(0);
  const attachmentPreviewObjectUrlRef = useRef<string | null>(null);

  const resetPostFormForCreate = () => {
    setTitle("");
    setText("");
    setPostSection(selectedSection === "all" ? "obecne" : selectedSection);
    setPostPinned(false);
    setPostReadByDay("");
    setPostSources([]);
    setFiles([]);
    setRemovedAttachmentIds([]);
    setReplacementFilesByAttachmentId({});
    setReplaceAttachmentTargetId(null);
    setPollEnabled(false);
    setPollQuestion("");
    setPollOptions(["", ""]);
    setEmojiOpen(false);
    setPostError(null);
  };

  const openCreatePostModal = () => {
    setEditingPost(null);
    resetPostFormForCreate();
    setPostModalOpen(true);
  };

  const openEditPostModal = (post: WallPost) => {
    setEditingPost(post);
    setTitle(post.title);
    setText(post.text);
    setPostSection(post.section);
    setPostPinned(post.pinned);
    setPostReadByDay(post.readByDay ?? "");
    setPostSources(post.sources);
    setFiles([]);
    setRemovedAttachmentIds([]);
    setReplacementFilesByAttachmentId({});
    setReplaceAttachmentTargetId(null);
    setPollEnabled(false);
    setPollQuestion("");
    setPollOptions(["", ""]);
    setEmojiOpen(false);
    setPostError(null);
    setPostModalOpen(true);
  };

  const closePostModal = () => {
    setPostModalOpen(false);
    setEditingPost(null);
    setPostError(null);
    setRemovedAttachmentIds([]);
    setReplacementFilesByAttachmentId({});
    setReplaceAttachmentTargetId(null);
    setPollEnabled(false);
    setPollQuestion("");
    setPollOptions(["", ""]);
    setPostPinned(false);
    setPostReadByDay("");
    setPostSources([]);
    setIsDraggingFiles(false);
    dragDepthRef.current = 0;
  };

  const closeAttachmentPreview = useCallback(() => {
    attachmentPreviewRequestIdRef.current += 1;
    if (attachmentPreviewObjectUrlRef.current) {
      URL.revokeObjectURL(attachmentPreviewObjectUrlRef.current);
      attachmentPreviewObjectUrlRef.current = null;
    }
    setAttachmentPreview(null);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setUser(fbUser);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const parseDeepLinkFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const sectionRaw = (params.get("section") ?? "").trim();
      const section = INTRANET_SECTION_KEY_SET.has(sectionRaw as IntranetSectionKey)
        ? (sectionRaw as IntranetSectionKey)
        : null;
      const postId = (params.get("postId") ?? "").trim() || null;
      setDeepLinkSection(section);
      setDeepLinkPostId(postId);
    };
    parseDeepLinkFromLocation();
    window.addEventListener("popstate", parseDeepLinkFromLocation);
    return () => window.removeEventListener("popstate", parseDeepLinkFromLocation);
  }, []);

  useEffect(() => {
    if (deepLinkSection && deepLinkSection !== selectedSection) {
      setSelectedSection(deepLinkSection);
    }
    if (deepLinkPostId) {
      setPendingFocusPostId(deepLinkPostId);
    }
    // URL query params should be applied only when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkSection, deepLinkPostId]);

  useEffect(() => {
    if (!postModalOpen || attachmentPreview) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPostModalOpen(false);
        setEditingPost(null);
        setPostError(null);
        setRemovedAttachmentIds([]);
        setReplacementFilesByAttachmentId({});
        setReplaceAttachmentTargetId(null);
        setPollEnabled(false);
        setPollQuestion("");
        setPollOptions(["", ""]);
        setPostSources([]);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [attachmentPreview, postModalOpen]);

  useEffect(() => {
    if (!sourcesModalPost) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSourcesModalPost(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sourcesModalPost]);

  useEffect(() => {
    if (!readerPost || sourcesModalPost) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReaderPost(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [readerPost, sourcesModalPost]);

  useEffect(() => {
    if (!attachmentPreview) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeAttachmentPreview();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [attachmentPreview, closeAttachmentPreview]);

  useEffect(() => {
    if (postModalOpen) return;
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
  }, [postModalOpen]);

  const applyPostPatch = useCallback((postId: string, patch: Partial<WallPost>) => {
    setPosts(previous => previous.map(post => post.id === postId ? { ...post, ...patch } : post));
    setReaderPost(previous => previous?.id === postId ? { ...previous, ...patch } : previous);
  }, []);

  const changePersonalState = useCallback(async (post: WallPost, action: WallPersonalAction) => {
    if (!user) return;
    const account = effectiveEmail;
    const key = `${account}:${post.id}:${action.field}`;
    if (personalRequests.current.has(key)) return;
    personalRequests.current.add(key);
    setPersonalBusy(previous => ({ ...previous, [`${post.id}:${action.field}`]: true }));
    setPersonalErrors(previous => ({ ...previous, [post.id]: null }));
    try {
      const payload = await fetchAuthedJsonOrThrow<{ ok?: boolean; state?: WallPersonalState; error?: string }>(user, `/api/intranet/wall/${encodeURIComponent(post.id)}/state`, { method: "POST", body: JSON.stringify(action) });
      if (!payload.ok || !payload.state) throw new Error(payload.error || "Změnu se nepodařilo uložit.");
      if (account !== accountRef.current) return;
      const field = action.field === "read" ? "readAtMs" : action.field;
      applyPostPatch(post.id, { [field]: payload.state[field] });
    } catch (error) {
      if (account === accountRef.current) setPersonalErrors(previous => ({ ...previous, [post.id]: error instanceof Error ? error.message : "Změnu se nepodařilo uložit." }));
    } finally {
      personalRequests.current.delete(key);
      if (account === accountRef.current) setPersonalBusy(previous => ({ ...previous, [`${post.id}:${action.field}`]: false }));
    }
  }, [user, effectiveEmail, applyPostPatch]);

  const loadPosts = useCallback(async (
    currentUser: FirebaseUser,
    section: FeedSection,
    options?: { append?: boolean; cursorMs?: number | null; cursorId?: string | null }
  ) => {
    const append = options?.append === true;
    const requestId = ++feedRequestId.current;
    const requestKey = JSON.stringify([effectiveEmail, section, view, searchQuery]);
    const isCurrent = () => requestId === feedRequestId.current && requestKey === feedKeyRef.current;
    if (append) {
      setLoadingOlderPosts(true);
      setOlderPostsError(null);
    } else {
      setLoadingPosts(true);
      setLoadingOlderPosts(false);
      setPostsError(null);
      setOlderPostsError(null);
      setPostsHasMore(false);
      setPostsCursorMs(null);
    }
    try {
      const query = new URLSearchParams();
      if (section !== "all") query.set("section", section);
      query.set("view", view);
      if (searchQuery) query.set("q", searchQuery);
      query.set("limit", String(POSTS_PAGE_SIZE));
      if (append && options?.cursorMs) {
        query.set("cursorMs", String(options.cursorMs));
        if (options.cursorId) query.set("cursorId", options.cursorId);
      }
      const endpoint = `/api/intranet/wall${query.toString() ? `?${query.toString()}` : ""}`;
      const payload = await fetchAuthedJsonOrThrow<WallApiResponse>(currentUser, endpoint, {
        method: "GET",
      });
      if (!payload?.ok) {
        throw new Error(payload?.error || "Server nevrátil úspěšnou odpověď.");
      }
      if (!isCurrent()) return;
      const rawPosts = Array.isArray(payload.posts) ? payload.posts : [];
      const normalizedPosts = normalizeWallPosts(rawPosts);
      setPosts((prev) => {
        if (!append) return normalizedPosts;
        const seen = new Set(prev.map((post) => post.id));
        return [
          ...prev,
          ...normalizedPosts.filter((post) => {
            if (seen.has(post.id)) return false;
            seen.add(post.id);
            return true;
          }),
        ];
      });
      setPostsHasMore(payload.hasMore === true);
      setPostsCursorId(payload.nextCursorId ?? null);
      setPostsCursorMs(
        typeof payload.nextCursorMs === "number" && Number.isFinite(payload.nextCursorMs)
          ? payload.nextCursorMs
          : null
      );
    } catch (error) {
      if (!isCurrent()) return;
      if (append) {
        setOlderPostsError(
          error instanceof Error ? error.message : "Nepodařilo se načíst starší příspěvky."
        );
      } else {
        setPostsError(
          error instanceof Error ? error.message : "Nepodařilo se načíst příspěvky."
        );
        setPosts([]);
        setPostsHasMore(false);
        setPostsCursorMs(null);
      }
    } finally {
      if (isCurrent()) {
        if (append) setLoadingOlderPosts(false);
        else setLoadingPosts(false);
      }
    }
  }, [effectiveEmail, view, searchQuery]);

  useEffect(() => {
    if (!user) {
      feedRequestId.current += 1;
      setPosts([]);
      setLoadingPosts(false);
      setLoadingOlderPosts(false);
      setPostsHasMore(false);
      setPostsCursorMs(null);
      setOlderPostsError(null);
      return;
    }
    void loadPosts(user, selectedSection);
  }, [effectiveEmail, user, selectedSection, view, searchQuery, loadPosts]);

  useEffect(() => {
    setReaderPost(null);
    setPersonalErrors({});
    setPersonalBusy({});
  }, [effectiveEmail]);

  useEffect(() => {
    if (!user || !pendingFocusPostId || loadingPosts || posts.some(post => post.id === pendingFocusPostId)) return;
    let cancelled = false;
    const currentAccount = effectiveEmail;
    void fetchAuthedJsonOrThrow<WallApiResponse>(user, `/api/intranet/wall?postId=${encodeURIComponent(pendingFocusPostId)}`)
      .then(payload => {
        if (cancelled || currentAccount !== accountRef.current) return;
        const targeted = normalizeWallPosts(payload.posts ?? []);
        setPosts(previous => [...targeted.filter(post => !previous.some(existing => existing.id === post.id)), ...previous]);
        if (!targeted.length) setPendingFocusPostId(null);
      })
      .catch(error => { if (!cancelled) { setPostsError(error instanceof Error ? error.message : "Příspěvek se nepodařilo otevřít."); setPendingFocusPostId(null); } });
    return () => { cancelled = true; };
  }, [user, effectiveEmail, pendingFocusPostId, loadingPosts, posts]);

  useEffect(() => {
    if (!pendingFocusPostId || loadingPosts) return;
    const targetExists = posts.some((post) => post.id === pendingFocusPostId);
    if (!targetExists) return;

    const node = postCardRefs.current[pendingFocusPostId];
    if (!(node instanceof HTMLElement)) return;

    node.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    setHighlightPostId(pendingFocusPostId);
    setExpandedCommentsById(previous => ({ ...previous, [pendingFocusPostId]: true }));
    const opened = posts.find(post => post.id === pendingFocusPostId);
    if (opened && opened.readAtMs === null) void changePersonalState(opened, { field: "read", value: true });

    if (highlightTimerRef.current != null) {
      window.clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightPostId((current) =>
        current === pendingFocusPostId ? null : current
      );
      highlightTimerRef.current = null;
    }, 2600);

    setPendingFocusPostId(null);
  }, [pendingFocusPostId, loadingPosts, posts, changePersonalState]);

  useEffect(
    () => () => {
      if (highlightTimerRef.current != null) {
        window.clearTimeout(highlightTimerRef.current);
      }
      attachmentPreviewRequestIdRef.current += 1;
      if (attachmentPreviewObjectUrlRef.current) {
        URL.revokeObjectURL(attachmentPreviewObjectUrlRef.current);
        attachmentPreviewObjectUrlRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    const created: string[] = [];
    const nextPreviews: Record<string, string> = {};

    files.forEach((file, index) => {
      if (!isPreviewableImage(file)) return;
      const key = filePreviewKey(file, index);
      const url = URL.createObjectURL(file);
      created.push(url);
      nextPreviews[key] = url;
    });

    setFilePreviewUrls(nextPreviews);

    return () => {
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  const currentSectionLabel = useMemo(
    () => selectedSection === "all" ? "Intranet" : INTRANET_SECTION_LABEL_BY_KEY.get(selectedSection) ?? selectedSection,
    [selectedSection]
  );
  const currentSectionVisual = SECTION_VISUALS[selectedSection === "all" ? "obecne" : selectedSection];
  const CurrentSectionIcon = selectedSection === "all" ? LayoutGrid : currentSectionVisual.icon;

  const selectedPostSectionVisual = SECTION_VISUALS[postSection];
  const SelectedPostIcon = selectedPostSectionVisual.icon;
  const isEditingPost = editingPost !== null;
  const removedAttachmentIdSet = useMemo(
    () => new Set(removedAttachmentIds),
    [removedAttachmentIds]
  );
  const replacementAttachmentIds = useMemo(
    () => Object.keys(replacementFilesByAttachmentId),
    [replacementFilesByAttachmentId]
  );
  const keptExistingAttachmentCount =
    editingPost?.attachments.filter((attachment) => !removedAttachmentIdSet.has(attachment.id))
      .length ?? 0;
  const replacementAttachmentCount = replacementAttachmentIds.length;
  const pendingExistingAttachmentCount =
    keptExistingAttachmentCount + replacementAttachmentCount;
  const attachmentSlotsRemaining = Math.max(0, MAX_FILES - pendingExistingAttachmentCount);
  const attachmentSlotsAvailable = Math.max(0, attachmentSlotsRemaining - files.length);
  const PostModalIcon = isEditingPost ? Pencil : Plus;

  const addEmojiToPost = (emoji: string) => {
    if (postTextEditorRef.current) {
      postTextEditorRef.current.insertText(emoji);
    } else {
      setText((current) => `${current}${emoji}`.slice(0, MAX_TEXT_LEN));
    }
    setPostError(null);
  };

  const togglePostTextBold = () => {
    postTextEditorRef.current?.toggleBold();
    setPostError(null);
  };

  const handlePostEmojiClick = (emojiData: EmojiClickData) => {
    addEmojiToPost(emojiData.emoji);
  };

  const updatePollOption = (index: number, value: string) => {
    setPollOptions((prev) =>
      prev.map((option, idx) =>
        idx === index ? value.slice(0, MAX_POLL_OPTION_LEN) : option
      )
    );
    setPostError(null);
  };

  const addPollOption = () => {
    setPollOptions((prev) =>
      prev.length >= MAX_POLL_OPTIONS ? prev : [...prev, ""]
    );
    setPostError(null);
  };

  const removePollOption = (index: number) => {
    setPollOptions((prev) =>
      prev.length <= MIN_POLL_OPTIONS ? prev : prev.filter((_, idx) => idx !== index)
    );
    setPostError(null);
  };

  const addPostSource = () => {
    setPostSources((prev) =>
      prev.length >= INTRANET_WALL_MAX_SOURCES ? prev : [...prev, ""]
    );
    setPostError(null);
  };

  const updatePostSource = (index: number, value: string) => {
    setPostSources((prev) =>
      prev.map((source, sourceIndex) => (sourceIndex === index ? value : source))
    );
    setPostError(null);
  };

  const removePostSource = (index: number) => {
    setPostSources((prev) => prev.filter((_, sourceIndex) => sourceIndex !== index));
    setPostError(null);
  };

  const addEmojiToComment = (postId: string, emoji: string) => {
    const textarea = commentInputRefs.current[postId] ?? null;
    const currentValue = commentDrafts[postId] ?? "";
    const result = insertAtTextAreaSelection({
      currentValue,
      insertion: emoji,
      maxLength: MAX_COMMENT_LEN,
      textarea,
    });
    setCommentDrafts((prev) => ({
      ...prev,
      [postId]: result.value,
    }));
    restoreTextAreaCursor(textarea, result.cursor);
    setCommentErrorById((prev) => ({ ...prev, [postId]: null }));
  };

  const addEmojiToReply = (postId: string, commentId: string, emoji: string) => {
    const key = replyComposerKey(postId, commentId);
    const textarea = replyInputRefs.current[key] ?? null;
    const currentValue = replyDraftsById[key] ?? "";
    const result = insertAtTextAreaSelection({
      currentValue,
      insertion: emoji,
      maxLength: MAX_COMMENT_LEN,
      textarea,
    });
    setReplyDraftsById((prev) => ({
      ...prev,
      [key]: result.value,
    }));
    restoreTextAreaCursor(textarea, result.cursor);
    setReplyErrorById((prev) => ({ ...prev, [key]: null }));
  };

  const addFiles = (incoming: File[]) => {
    if (!incoming.length) return;
    const maxNewFiles = isEditingPost ? attachmentSlotsRemaining : MAX_FILES;
    if (maxNewFiles <= 0) {
      setPostError(`Příspěvek může mít maximálně ${MAX_FILES} příloh.`);
      return;
    }
    setFiles((prev) => {
      const merged = [...prev, ...incoming];
      if (merged.length <= maxNewFiles) return merged;
      return merged.slice(0, maxNewFiles);
    });
    setPostError(null);
  };

  const handleFileAdd = (nextFiles: FileList | null) => {
    if (!nextFiles) return;
    addFiles(Array.from(nextFiles));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDropZoneDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!event.dataTransfer.types.includes("Files")) return;
    dragDepthRef.current += 1;
    setIsDraggingFiles(true);
  };

  const handleDropZoneDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!event.dataTransfer.types.includes("Files")) return;
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingFiles(true);
  };

  const handleDropZoneDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingFiles(false);
    }
  };

  const handleDropZoneDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    const incoming = Array.from(event.dataTransfer.files ?? []);
    if (!incoming.length) return;
    addFiles(incoming);
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleRemoveExistingAttachment = (attachmentId: string) => {
    setRemovedAttachmentIds((prev) => (prev.includes(attachmentId) ? prev : [...prev, attachmentId]));
    setReplacementFilesByAttachmentId((prev) => {
      if (!prev[attachmentId]) return prev;
      const next = { ...prev };
      delete next[attachmentId];
      return next;
    });
    setPostError(null);
  };

  const handleUndoExistingAttachmentChange = (attachmentId: string) => {
    setRemovedAttachmentIds((prev) => prev.filter((id) => id !== attachmentId));
    setReplacementFilesByAttachmentId((prev) => {
      if (!prev[attachmentId]) return prev;
      const next = { ...prev };
      delete next[attachmentId];
      return next;
    });
    setPostError(null);
  };

  const handleReplaceAttachmentClick = (attachmentId: string) => {
    setReplaceAttachmentTargetId(attachmentId);
    replaceAttachmentInputRef.current?.click();
  };

  const handleReplaceAttachmentFile = (nextFiles: FileList | null) => {
    const file = nextFiles?.[0] ?? null;
    const attachmentId = replaceAttachmentTargetId;
    if (replaceAttachmentInputRef.current) {
      replaceAttachmentInputRef.current.value = "";
    }
    setReplaceAttachmentTargetId(null);
    if (!file || !attachmentId) return;

    const alreadyRemoved = removedAttachmentIdSet.has(attachmentId);
    const alreadyHasReplacement = !!replacementFilesByAttachmentId[attachmentId];
    if (alreadyRemoved && !alreadyHasReplacement && attachmentSlotsAvailable <= 0) {
      setPostError(`Příspěvek může mít maximálně ${MAX_FILES} příloh.`);
      return;
    }

    setRemovedAttachmentIds((prev) => (prev.includes(attachmentId) ? prev : [...prev, attachmentId]));
    setReplacementFilesByAttachmentId((prev) => ({ ...prev, [attachmentId]: file }));
    setPostError(null);
  };

  const handleSavePost = async () => {
    if (!user || posting) return;
    const trimmedTitle = title.trim();
    const trimmedText = text.trim();
    const isEditing = !!editingPost;
    if (!trimmedTitle) {
      setPostError("Titulek je povinný.");
      return;
    }
    if (!trimmedText) {
      setPostError("Text příspěvku je povinný.");
      return;
    }
    const sourcesResult = parseIntranetWallSources(postSources);
    if (!sourcesResult.ok) {
      setPostError(sourcesResult.error);
      return;
    }
    const trimmedPollQuestion = pollQuestion.trim();
    const trimmedPollOptions = pollOptions
      .map((option) => option.trim())
      .filter(Boolean)
      .slice(0, MAX_POLL_OPTIONS);
    if (!isEditing && pollEnabled) {
      if (!trimmedPollQuestion) {
        setPostError("Otázka ankety je povinná.");
        return;
      }
      if (trimmedPollOptions.length < MIN_POLL_OPTIONS) {
        setPostError("Anketa musí mít alespoň dvě možnosti.");
        return;
      }
    }

    setPosting(true);
    setPostError(null);

    try {
      const form = new FormData();
      form.set("title", trimmedTitle.slice(0, MAX_TITLE_LEN));
      form.set("text", trimmedText.slice(0, MAX_TEXT_LEN));
      form.set("section", postSection);
      form.set("pinned", postPinned ? "1" : "0");
      form.set("sources", JSON.stringify(sourcesResult.sources));
      if (postReadByDay) form.set("readByDay", postReadByDay);
      files.forEach((file) => form.append("files", file));
      if (!isEditing && pollEnabled) {
        form.set("pollEnabled", "1");
        form.set("pollQuestion", trimmedPollQuestion.slice(0, MAX_POLL_QUESTION_LEN));
        trimmedPollOptions.forEach((option) => {
          form.append("pollOptions", option.slice(0, MAX_POLL_OPTION_LEN));
        });
      }
      if (isEditing) {
        removedAttachmentIds.forEach((attachmentId) => {
          form.append("removedAttachmentIds", attachmentId);
        });
        Object.values(replacementFilesByAttachmentId).forEach((file) => {
          form.append("files", file);
        });
      }

      const payload = isEditing
        ? await fetchAuthedJsonOrThrow<WallUpdateResponse>(
            user,
            `/api/intranet/wall/${encodeURIComponent(editingPost.id)}`,
            {
              method: "PATCH",
              body: form,
            }
          )
        : await fetchAuthedJsonOrThrow<WallCreateResponse>(
            user,
            "/api/intranet/wall",
            {
              method: "POST",
              body: form,
            }
          );
      if (!payload?.ok) {
        throw new Error(payload?.error || "Server nevrátil úspěšnou odpověď.");
      }

      setTitle("");
      setText("");
      setFiles([]);
      setRemovedAttachmentIds([]);
      setReplacementFilesByAttachmentId({});
      setReplaceAttachmentTargetId(null);
      setPollEnabled(false);
      setPollQuestion("");
      setPollOptions(["", ""]);
      setEmojiOpen(false);
      setPostPinned(false);
      setPostReadByDay("");
      setPostSources([]);
      setPostModalOpen(false);
      setEditingPost(null);
      if (postSection !== selectedSection) {
        setSelectedSection(postSection);
      } else {
        await loadPosts(user, selectedSection);
      }
    } catch (error) {
      setPostError(
        error instanceof Error
          ? error.message
          : isEditing
            ? "Nepodařilo se upravit příspěvek."
            : "Nepodařilo se přidat příspěvek."
      );
    } finally {
      setPosting(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!user || deletingPostId) return;
    const confirmed = window.confirm("Opravdu chceš smazat tento příspěvek?");
    if (!confirmed) return;

    setDeletingPostId(postId);
    setPostsError(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<WallDeleteResponse>(
        user,
        `/api/intranet/wall/${encodeURIComponent(postId)}`,
        { method: "DELETE" }
      );
      if (!payload?.ok) {
        throw new Error(payload?.error || "Smazání se nepodařilo.");
      }
      await loadPosts(user, selectedSection);
    } catch (error) {
      setPostsError(error instanceof Error ? error.message : "Nepodařilo se smazat příspěvek.");
    } finally {
      setDeletingPostId(null);
    }
  };

  const handleOpenAttachment = async (attachment: WallAttachment) => {
    if (!user) return;
    const requestId = attachmentPreviewRequestIdRef.current + 1;
    attachmentPreviewRequestIdRef.current = requestId;

    if (attachmentPreviewObjectUrlRef.current) {
      URL.revokeObjectURL(attachmentPreviewObjectUrlRef.current);
      attachmentPreviewObjectUrlRef.current = null;
    }

    setPostsError(null);
    setAttachmentPreview({
      attachment,
      objectUrl: null,
      pdfData: null,
      loading: true,
      error: null,
    });

    try {
      const blob = await fetchAuthedBlobOrThrow(user, attachment.url, {
        cache: attachment.isImage ? "force-cache" : "no-store",
      });
      const objectUrl = URL.createObjectURL(blob);
      const pdfData = isPdfAttachment(attachment)
        ? new Uint8Array(await blob.arrayBuffer())
        : null;
      if (attachmentPreviewRequestIdRef.current !== requestId) {
        URL.revokeObjectURL(objectUrl);
        return;
      }

      attachmentPreviewObjectUrlRef.current = objectUrl;
      setAttachmentPreview({
        attachment,
        objectUrl,
        pdfData,
        loading: false,
        error: null,
      });
    } catch (error) {
      if (attachmentPreviewRequestIdRef.current !== requestId) return;
      setAttachmentPreview({
        attachment,
        objectUrl: null,
        pdfData: null,
        loading: false,
        error: error instanceof Error ? error.message : "Přílohu se nepodařilo otevřít.",
      });
    }
  };

  const handleDownloadAttachment = async (attachment: WallAttachment) => {
    if (!user) return;
    setPostsError(null);
    try {
      const blob = await fetchAuthedBlobOrThrow(user, attachment.url, {
        cache: attachment.isImage ? "force-cache" : "no-store",
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = attachment.name || "priloha";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch (error) {
      setPostsError(error instanceof Error ? error.message : "Přílohu se nepodařilo stáhnout.");
    }
  };

  const handleCreateComment = async (postId: string, parentCommentId?: string) => {
    if (!user) return;
    const commentAccount = effectiveEmail;
    const isReply = !!parentCommentId;
    const composerKey = parentCommentId ? replyComposerKey(postId, parentCommentId) : postId;
    const draft = isReply
      ? (replyDraftsById[composerKey] ?? "").trim()
      : (commentDrafts[postId] ?? "").trim();
    if (!draft) return;
    if (isReply ? replyPostingById[composerKey] : commentPostingById[postId]) return;

    if (isReply) {
      setReplyPostingById((prev) => ({ ...prev, [composerKey]: true }));
      setReplyErrorById((prev) => ({ ...prev, [composerKey]: null }));
    } else {
      setCommentPostingById((prev) => ({ ...prev, [postId]: true }));
      setCommentErrorById((prev) => ({ ...prev, [postId]: null }));
    }

    try {
      const payload = await fetchAuthedJsonOrThrow<WallCommentCreateResponse>(
        user,
        `/api/intranet/wall/${encodeURIComponent(postId)}/comments`,
        {
          method: "POST",
          body: JSON.stringify({
            text: draft,
            parentCommentId: parentCommentId ?? null,
          }),
        }
      );
      if (!payload?.ok) {
        throw new Error(payload?.error || "Server nevrátil úspěšnou odpověď.");
      }

      if (commentAccount !== accountRef.current) return;
      if (isReply) {
        setReplyDraftsById((prev) => ({ ...prev, [composerKey]: "" }));
        setReplyComposerOpenById((prev) => ({ ...prev, [composerKey]: false }));
      } else {
        setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
      }
      setExpandedCommentsById((prev) => ({ ...prev, [postId]: true }));
      try {
        const refreshed = await fetchAuthedJsonOrThrow<WallApiResponse>(user, `/api/intranet/wall?postId=${encodeURIComponent(postId)}`);
        const updated = normalizeWallPosts(refreshed.posts ?? [])[0];
        if (!refreshed.ok || !updated) throw new Error("REFRESH_FAILED");
        if (commentAccount === accountRef.current) applyPostPatch(postId, { comments: updated.comments, commentCount: updated.commentCount });
      } catch {
        if (commentAccount === accountRef.current) setPersonalErrors(previous => ({ ...previous, [postId]: "Komentář je uložený. Diskusi se nepodařilo obnovit; použij tlačítko Obnovit." }));
      }
    } catch (error) {
      if (isReply) {
        setReplyErrorById((prev) => ({
          ...prev,
          [composerKey]:
            error instanceof Error ? error.message : "Nepodařilo se uložit reakci.",
        }));
      } else {
        setCommentErrorById((prev) => ({
          ...prev,
          [postId]:
            error instanceof Error ? error.message : "Nepodařilo se uložit komentář.",
        }));
      }
    } finally {
      if (isReply) {
        setReplyPostingById((prev) => ({ ...prev, [composerKey]: false }));
      } else {
        setCommentPostingById((prev) => ({ ...prev, [postId]: false }));
      }
    }
  };

  const openReader = (post: WallPost, trigger?: HTMLElement) => {
    readerTriggerRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setReaderPost(post);
    if (post.readAtMs === null) void changePersonalState(post, { field: "read", value: true });
  };

  const selectSolution = async (post: WallPost, commentId: string | null) => {
    if (!user) return;
    const account = effectiveEmail;
    const key = `${account}:${post.id}:solution`;
    if (personalRequests.current.has(key)) return;
    personalRequests.current.add(key);
    setPersonalBusy(previous => ({ ...previous, [`${post.id}:solution`]: true }));
    setPersonalErrors(previous => ({ ...previous, [post.id]: null }));
    try {
      const payload = await fetchAuthedJsonOrThrow<{ ok?: boolean; acceptedCommentId?: string | null; error?: string }>(user, `/api/intranet/wall/${encodeURIComponent(post.id)}/solution`, { method: "POST", body: JSON.stringify({ commentId }) });
      if (!payload.ok) throw new Error(payload.error || "Řešení se nepodařilo uložit.");
      if (account === accountRef.current) applyPostPatch(post.id, { acceptedCommentId: payload.acceptedCommentId ?? null });
    } catch (error) {
      if (account === accountRef.current) setPersonalErrors(previous => ({ ...previous, [post.id]: error instanceof Error ? error.message : "Řešení se nepodařilo uložit." }));
    } finally {
      personalRequests.current.delete(key);
      if (account === accountRef.current) setPersonalBusy(previous => ({ ...previous, [`${post.id}:solution`]: false }));
    }
  };

  const personalActions = (post: WallPost) => <WallPostPersonalActions state={post} disabled={!user}
    busy={{ saved: personalBusy[`${post.id}:saved`], following: personalBusy[`${post.id}:following`], read: personalBusy[`${post.id}:read`] }}
    onChange={action => void changePersonalState(post, action)} />;

  const solutionAction = (post: WallPost, commentId: string) => <SolutionAction
    accepted={post.acceptedCommentId === commentId}
    allowed={post.section === "pomoc" && canDeletePost(post)}
    busy={personalBusy[`${post.id}:solution`] === true}
    onSelect={() => void selectSolution(post, post.acceptedCommentId === commentId ? null : commentId)} />;

  const jumpToSolution = (post: WallPost) => {
    setExpandedCommentsById(previous => ({ ...previous, [post.id]: true }));
    if (post.readAtMs === null) void changePersonalState(post, { field: "read", value: true });
    window.setTimeout(() => document.getElementById(`wall-comment-${post.id}-${post.acceptedCommentId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 0);
  };

  const handleToggleComments = (postId: string) => {
    const nextExpanded = !expandedCommentsById[postId];
    const post = posts.find(item => item.id === postId);
    if (nextExpanded && post?.readAtMs === null) void changePersonalState(post, { field: "read", value: true });
    setExpandedCommentsById((prev) => ({ ...prev, [postId]: nextExpanded }));
    if (!nextExpanded) {
      setCommentComposerOpenById((prev) => ({ ...prev, [postId]: false }));
      setReplyComposerOpenById((prev) =>
        Object.fromEntries(
          Object.entries(prev).filter(([key, value]) => !(value && key.startsWith(`${postId}::`)))
        )
      );
    }
  };

  const handleOpenCommentComposer = (postId: string) => {
    setExpandedCommentsById((prev) => ({ ...prev, [postId]: true }));
    setCommentComposerOpenById((prev) => ({ ...prev, [postId]: true }));
    setTimeout(() => {
      commentInputRefs.current[postId]?.focus();
    }, 0);
  };

  const handleOpenReplyComposer = (postId: string, commentId: string) => {
    const key = replyComposerKey(postId, commentId);
    setExpandedCommentsById((prev) => ({ ...prev, [postId]: true }));
    setReplyComposerOpenById((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => {
      replyInputRefs.current[key]?.focus();
    }, 0);
  };

  const handleToggleCommentLike = async (postId: string, commentId: string) => {
    if (!user) return;
    const key = replyComposerKey(postId, commentId);
    if (commentLikePostingById[key]) return;

    setCommentLikePostingById((prev) => ({ ...prev, [key]: true }));
    setPostsError(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<WallCommentLikeResponse>(
        user,
        `/api/intranet/wall/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/like`,
        { method: "POST" }
      );
      if (!payload?.ok) {
        throw new Error(payload?.error || "Server nevrátil úspěšnou odpověď.");
      }

      setPosts((prev) =>
        prev.map((post) => {
          if (post.id !== postId) return post;

          const nextComments = post.comments.map((comment) => {
            if (comment.id === commentId) {
              return {
                ...comment,
                likeCount:
                  typeof payload.likeCount === "number" &&
                  Number.isFinite(payload.likeCount) &&
                  payload.likeCount >= 0
                    ? Math.floor(payload.likeCount)
                    : comment.likeCount,
                likedByMe: payload.likedByMe === true,
              };
            }

            const nextReplies = comment.replies.map((reply) =>
              reply.id === commentId
                ? {
                    ...reply,
                    likeCount:
                      typeof payload.likeCount === "number" &&
                      Number.isFinite(payload.likeCount) &&
                      payload.likeCount >= 0
                        ? Math.floor(payload.likeCount)
                        : reply.likeCount,
                    likedByMe: payload.likedByMe === true,
                  }
                : reply
            );
            return { ...comment, replies: nextReplies };
          });
          return { ...post, comments: nextComments };
        })
      );
    } catch (error) {
      setPostsError(error instanceof Error ? error.message : "Nepodařilo se uložit lajk komentáře.");
    } finally {
      setCommentLikePostingById((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleToggleLike = async (postId: string) => {
    if (!user || likePostingById[postId]) return;

    setLikePostingById((prev) => ({ ...prev, [postId]: true }));
    setPostsError(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<WallLikeResponse>(
        user,
        `/api/intranet/wall/${encodeURIComponent(postId)}/like`,
        { method: "POST" }
      );
      if (!payload?.ok) {
        throw new Error(payload?.error || "Server nevrátil úspěšnou odpověď.");
      }

      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                likeCount:
                  typeof payload.likeCount === "number" &&
                  Number.isFinite(payload.likeCount) &&
                  payload.likeCount >= 0
                    ? Math.floor(payload.likeCount)
                    : post.likeCount,
                likedByMe: payload.likedByMe === true,
              }
            : post
        )
      );
    } catch (error) {
      setPostsError(error instanceof Error ? error.message : "Nepodařilo se uložit lajk.");
    } finally {
      setLikePostingById((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const handleVoteInPoll = async (postId: string, optionId: string) => {
    if (!user || pollVotingByPostId[postId]) return;

    setPollVotingByPostId((prev) => ({ ...prev, [postId]: optionId }));
    setPollErrorByPostId((prev) => ({ ...prev, [postId]: null }));
    try {
      const payload = await fetchAuthedJsonOrThrow<WallPollVoteResponse>(
        user,
        `/api/intranet/wall/${encodeURIComponent(postId)}/poll-vote`,
        {
          method: "POST",
          body: JSON.stringify({ optionId }),
        }
      );
      if (!payload?.ok || !payload.poll) {
        throw new Error(payload?.error || "Server nevrátil úspěšnou odpověď.");
      }

      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                poll: payload.poll ?? post.poll,
              }
            : post
        )
      );
    } catch (error) {
      setPollErrorByPostId((prev) => ({
        ...prev,
        [postId]: error instanceof Error ? error.message : "Nepodařilo se uložit hlas.",
      }));
    } finally {
      setPollVotingByPostId((prev) => ({ ...prev, [postId]: null }));
    }
  };

  const handleLoadOlderPosts = () => {
    if (!user || loadingOlderPosts || !postsHasMore || !postsCursorMs) return;
    void loadPosts(user, selectedSection, {
      append: true,
      cursorMs: postsCursorMs,
      cursorId: postsCursorId,
    });
  };

  const canDeletePost = (post: WallPost): boolean => {
    const me = effectiveEmail;
    const author = normalizeEmail(post.author.email);
    return !!me && !!author && me === author;
  };

  const visiblePosts = posts.filter(post => matchesWallView(post, view)
    || (view === "unread" && expandedCommentsById[post.id])
    || post.id === highlightPostId || post.id === pendingFocusPostId);

  const previewAttachmentIsPdf = attachmentPreview
    ? isPdfAttachment(attachmentPreview.attachment)
    : false;
  const previewAttachmentCanRender = attachmentPreview
    ? isPreviewableAttachment(attachmentPreview.attachment)
    : false;
  const AttachmentPreviewIcon = attachmentPreview?.attachment.isImage
    ? ImageIcon
    : previewAttachmentIsPdf
      ? FileText
      : Paperclip;
  const readerVisual = readerPost
    ? SECTION_VISUALS[readerPost.section] ?? SECTION_VISUALS.obecne
    : SECTION_VISUALS.obecne;
  const ReaderSectionIcon = readerVisual.icon;

  return (
    <AppLayout active="intranet">
      <div className={`${wallFont.className} relative w-full overflow-visible px-2 pb-10 pt-2 sm:px-3`}>
        <div className={styles.canvas} aria-hidden="true">
          <span className={`${styles.orb} ${styles.orbA}`} />
          <span className={`${styles.orb} ${styles.orbB}`} />
          <span className={`${styles.orb} ${styles.orbC}`} />
          <span className={styles.mesh} />
          <span className={styles.grain} />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl space-y-4">
          <section className="px-1 py-1 sm:px-2 sm:py-2">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border shadow-[0_10px_24px_rgba(15,23,42,0.1)] ${currentSectionVisual.badge}`}
                >
                  <CurrentSectionIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-[2rem]">
                    {currentSectionLabel}
                  </h1>
                </div>
              </div>

              <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (user) void loadPosts(user, selectedSection);
                  }}
                  className="group inline-flex h-11 items-center gap-2 rounded-full border border-white/90 bg-white/80 py-1.5 pl-1.5 pr-4 text-sm font-bold text-slate-700 shadow-[0_10px_26px_rgba(15,23,42,0.1)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-[0_14px_30px_rgba(15,23,42,0.14)]"
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 ring-1 ring-slate-200">
                    <RefreshCw className="h-4 w-4 transition-transform duration-500 group-hover:rotate-180" />
                  </span>
                  Obnovit
                </button>
                <button
                  type="button"
                  onClick={openCreatePostModal}
                  className="group inline-flex h-11 items-center gap-2 rounded-full border border-slate-900/90 bg-[linear-gradient(135deg,#0f172a_0%,#020617_100%)] py-1.5 pl-1.5 pr-4 text-sm font-bold text-white shadow-[0_12px_28px_rgba(15,23,42,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(15,23,42,0.36)]"
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/12 ring-1 ring-white/15">
                    <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
                  </span>
                  Přidat příspěvek
                </button>
              </div>
            </div>
          </section>

          <nav
            className="sticky top-2 z-30 rounded-[24px] border border-white/70 bg-white/82 shadow-[0_18px_44px_rgba(15,23,42,0.13)] backdrop-blur-xl"
            aria-label="Sekce intranetu"
          >
            <div className="flex gap-2 overflow-x-auto px-2 py-2">
              <button type="button" onClick={() => { setSelectedSection("all"); setPendingFocusPostId(null); }} aria-pressed={selectedSection === "all"}
                className={`${styles.sectionChip} inline-flex shrink-0 items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-sm font-semibold ${selectedSection === "all" ? "border-violet-300 bg-violet-100 text-violet-900" : "border-slate-300 bg-white text-slate-700"}`}><LayoutGrid size={16} aria-hidden="true" />Vše</button>
              {INTRANET_SECTIONS.map((section) => {
                const visual = SECTION_VISUALS[section.key];
                const SectionIcon = visual.icon;
                const isActive = selectedSection === section.key;

                return (
                  <button
                    key={section.key}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => { setSelectedSection(section.key); setPendingFocusPostId(null); }}
                    className={[
                      styles.sectionChip,
                      "inline-flex shrink-0 items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-sm font-semibold transition",
                      isActive
                        ? `${visual.chipActive} ${visual.chipGlow} ring-2 ring-white/80 ring-offset-2 ring-offset-white/60`
                        : "border-slate-300/90 bg-white/88 text-slate-700 hover:-translate-y-0.5 hover:border-slate-400 hover:bg-white",
                    ].join(" ")}
                  >
                    <SectionIcon className="h-4 w-4" />
                    {section.label}
                    {isActive ? (
                      <span className="ml-1 rounded-full border border-white/40 bg-white/20 px-2 py-0.5 text-[11px] font-bold leading-none text-current">
                        {postsHasMore ? `${visiblePosts.length}+` : visiblePosts.length}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </nav>
          <WallFeedFilters view={view} onViewChange={next => { setView(next); setPendingFocusPostId(null); }} search={searchInput} onSearchChange={value => { setSearchInput(value); setPendingFocusPostId(null); }} sectionLabel={selectedSection === "all" ? "ve všech kategoriích" : `v sekci ${currentSectionLabel}`} />
          <p className="break-words px-2 text-xs text-slate-500">{selectedSection === "all" ? "Všechny kategorie" : currentSectionLabel}{searchQuery ? ` · Výsledky pro „${searchQuery}“` : ""}{view === "unread" ? " · Přečtení se zaznamená po otevření příspěvku nebo diskuse." : ""}</p>

          <section>
            {loadingPosts ? (
              <div className="grid gap-3">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div
                    key={`wall-skeleton-${idx}`}
                    className="h-44 animate-pulse rounded-[24px] border border-slate-200/70 bg-white/75"
                  />
                ))}
              </div>
            ) : postsError ? (
              <div className="rounded-3xl border border-red-300/80 bg-red-50/90 px-4 py-4 text-sm text-red-700 shadow-[0_14px_34px_rgba(248,113,113,0.18)]">
                {postsError}
              </div>
            ) : visiblePosts.length === 0 ? (
              <div className="rounded-[30px] border border-slate-200/80 bg-white/80 px-6 py-10 text-center shadow-[0_20px_58px_rgba(15,23,42,0.1)] backdrop-blur-xl">
                <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-[0_12px_30px_rgba(16,185,129,0.2)]">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-2xl font-semibold text-slate-900">{searchQuery ? "Nic jsme nenašli" : view === "saved" ? "Zatím nemáš uložené příspěvky" : view === "unread" ? "Žádné nepřečtené příspěvky" : view === "following" ? "Zatím nesleduješ žádnou diskusi" : "Tahle sekce čeká na první zprávu"}</h3>
                <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600 sm:text-base">
                  {searchQuery ? "Zkus jiné hledání nebo vyber všechny kategorie." : view === "saved" ? "U příspěvku klikni na Uložit a najdeš ho tady." : view === "unread" ? "V tomto výběru nejsou další neotevřené příspěvky." : view === "following" ? "Kliknutím na Sledovat se přihlásíš k upozorněním na nové komentáře." : "Přidej první inspiraci, tip nebo odpověď týmu."}
                </p>
                {postsHasMore && <button type="button" onClick={handleLoadOlderPosts} disabled={loadingOlderPosts} className="mt-4 rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700">{loadingOlderPosts ? "Načítám…" : "Zobrazit starší příspěvky"}</button>}
                {olderPostsError && <p role="alert" className="mt-3 text-sm text-red-700">{olderPostsError}</p>}
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={openCreatePostModal}
                    className="inline-flex items-center gap-2 rounded-2xl border border-emerald-700/70 bg-[linear-gradient(135deg,#16a34a_0%,#047857_100%)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(16,185,129,0.28)] transition hover:-translate-y-0.5"
                  >
                    <Plus className="h-4 w-4" />
                    Přidat první příspěvek
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                {visiblePosts.map((post, index) => {
                  const visual = SECTION_VISUALS[post.section] ?? SECTION_VISUALS.obecne;
                  const SectionIcon = visual.icon;
                  const isDeletingThis = deletingPostId === post.id;
                  const commentsExpanded = expandedCommentsById[post.id] === true;
                  const commentComposerOpen = commentComposerOpenById[post.id] === true;
                  const isLikingThis = likePostingById[post.id] === true;
                  const isCommentPostingThis = commentPostingById[post.id] === true;
                  const imageAttachments = post.attachments.filter((attachment) => attachment.isImage);
                  const otherAttachments = post.attachments.filter((attachment) => !attachment.isImage);
                  const hasAttachments = post.attachments.length > 0;
                  const isLongPost = shouldCollapseWallPostText(post.text);
                  const accepted = post.acceptedCommentId ? post.comments.flatMap(comment => [comment, ...comment.replies]).find(comment => comment.id === post.acceptedCommentId) : null;

                  return (
                    <article
                      key={post.id}
                      data-post-id={post.id}
                      ref={(node) => {
                        postCardRefs.current[post.id] = node;
                      }}
                      className={`${styles.wallCard} relative overflow-hidden rounded-[24px] border border-white/75 bg-white/90 p-4 shadow-[0_16px_42px_rgba(15,23,42,0.12)] backdrop-blur-xl ring-1 sm:p-5 ${visual.postAccent} ${
                        highlightPostId === post.id
                          ? "ring-2 ring-emerald-300 shadow-[0_0_0_4px_rgba(16,185,129,0.14),0_24px_54px_rgba(15,23,42,0.16)]"
                          : post.pinned
                            ? "ring-2 ring-violet-200 shadow-[0_0_0_4px_rgba(124,58,237,0.08),0_24px_54px_rgba(15,23,42,0.16)]"
                            : ""
                      }`}
                      style={{ animationDelay: `${Math.min(index * 50, 240)}ms` }}
                    >
                      <div
                        className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${visual.rail}`}
                        aria-hidden="true"
                      />

                      <div
                        className={
                          hasAttachments
                            ? "grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start"
                            : ""
                        }
                      >
                        <div className="min-w-0">
                          <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 pb-4">
                        <div className="flex min-w-0 items-start gap-3.5">
                          <ProfileAvatar
                            src={post.author.profileAvatar}
                            name={post.author.name}
                            className="h-12 w-12 rounded-2xl text-5xl shadow-inner ring-1 ring-slate-200"
                            sizes="48px"
                          />

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={[
                                  "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold",
                                  visual.badge,
                                ].join(" ")}
                              >
                                <SectionIcon className="h-3.5 w-3.5" />
                                {post.sectionLabel}
                              </span>
                              <span className="truncate text-sm font-medium text-slate-600">
                                od <strong className="text-slate-800">{post.author.name}</strong>
                              </span>
                              <SpecialistBadge specialist={post.author.specialist} />
                              {post.readAtMs === null && <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">Nepřečtené</span>}
                              {post.acceptedCommentId && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"><CheckCircle2 size={12} aria-hidden="true" />Vyřešeno</span>}
                              {post.pinned ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-bold text-violet-800">
                                  <Pin className="h-3 w-3 fill-current" />
                                  Připnuto
                                </span>
                              ) : null}
                              {post.readByDay ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
                                  <CalendarClock className="h-3 w-3" />
                                  Přečíst do {new Date(`${post.readByDay}T00:00:00`).toLocaleDateString("cs-CZ")}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-500">
                              <Clock3 className="h-3.5 w-3.5" />
                              {formatDateTime(post.createdAtMs)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {canDeletePost(post) ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditPostModal(post)}
                                disabled={!!deletingPostId}
                                className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Upravit
                              </button>

                              <button
                                type="button"
                                onClick={() => void handleDeletePost(post.id)}
                                disabled={!!deletingPostId}
                                className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isDeletingThis ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                                Smazat
                              </button>
                            </>
                          ) : null}
                        </div>
                          </div>

                          <div className="mt-5">
                          <div className="min-w-0 max-w-5xl">
                          <h3 className="text-2xl font-bold leading-[1.14] tracking-[-0.025em] text-slate-950 sm:text-[1.7rem]">
                            <button type="button" onClick={event => openReader(post, event.currentTarget)} className="text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400" aria-label={`Otevřít příspěvek: ${post.title}`}>{post.title}</button>
                          </h3>
                          {isLongPost ? (
                            <div className="mt-3">
                              <div className="relative overflow-hidden">
                                <LinkedText
                                  text={post.text}
                                  className="line-clamp-[8] whitespace-pre-wrap text-[15px] leading-7 text-slate-700 sm:text-base sm:leading-7 lg:text-[17px] lg:leading-8"
                                />
                                <div
                                  className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white via-white/90 to-transparent"
                                  aria-hidden="true"
                                />
                              </div>
                              <div className="relative mt-1 flex items-center justify-center pt-2">
                                <span
                                  className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent"
                                  aria-hidden="true"
                                />
                                <button
                                  type="button"
                                  onClick={event => openReader(post, event.currentTarget)}
                                  aria-haspopup="dialog"
                                  className="group/readmore relative inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 py-1.5 pl-2 pr-1.5 text-left text-slate-800 shadow-[0_10px_26px_rgba(15,23,42,0.11)] backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_32px_rgba(15,23,42,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                                >
                                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition group-hover/readmore:bg-slate-200 group-hover/readmore:text-slate-900">
                                    <BookOpen className="h-4 w-4" />
                                  </span>
                                  <span className="px-0.5">
                                    <span className="block text-sm font-bold leading-tight">
                                      Číst celý příspěvek
                                    </span>
                                    <span className="hidden text-[10px] font-semibold leading-tight text-slate-500 sm:block">
                                      {wallPostReadingMinutes(post.text)} min čtení
                                    </span>
                                  </span>
                                  <span className="ml-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition group-hover/readmore:translate-y-0.5 group-hover/readmore:bg-slate-800">
                                    <ChevronDown className="h-4 w-4" />
                                  </span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <LinkedText
                              text={post.text}
                              className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-slate-700 sm:text-base sm:leading-7 lg:text-[17px] lg:leading-8"
                            />
                          )}

                          {post.poll ? (
                            <PollCard
                              postId={post.id}
                              poll={post.poll}
                              votingOptionId={pollVotingByPostId[post.id]}
                              error={pollErrorByPostId[post.id]}
                              onVote={(targetPostId, optionId) =>
                                void handleVoteInPoll(targetPostId, optionId)
                              }
                            />
                          ) : null}
                          </div>
                          </div>
                        </div>

                          {hasAttachments ? (
                            <aside className="rounded-[18px] border border-slate-200/90 bg-[linear-gradient(145deg,#f8fafc_0%,#ffffff_100%)] p-2.5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                              <div className="flex items-center justify-between gap-2 px-0.5 pb-2.5">
                                <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600">
                                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm ring-1 ring-slate-200">
                                    <Paperclip className="h-3.5 w-3.5" />
                                  </span>
                                  Přílohy
                                </div>
                                <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500 shadow-sm">
                                  {post.attachments.length}{" "}
                                  {post.attachments.length === 1
                                    ? "soubor"
                                    : post.attachments.length <= 4
                                      ? "soubory"
                                      : "souborů"}
                                </span>
                              </div>

                              <div className="grid grid-cols-1 items-start gap-2.5">
                                {imageAttachments.map((attachment) => (
                                  <AttachmentImagePreview
                                    key={attachment.id}
                                    attachment={attachment}
                                    user={user}
                                    onOpen={(item) => void handleOpenAttachment(item)}
                                  />
                                ))}
                                {otherAttachments.map((attachment) => (
                                  <AttachmentDocumentPreviewCard
                                    key={attachment.id}
                                    attachment={attachment}
                                    user={user}
                                    onPreview={(item) => void handleOpenAttachment(item)}
                                    onDownload={(item) => void handleDownloadAttachment(item)}
                                  />
                                ))}
                              </div>
                            </aside>
                          ) : null}
                        </div>

                      {accepted && <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-emerald-800"><CheckCircle2 size={15} aria-hidden="true" /><strong>Vybrané řešení</strong><span>{accepted.author.name}</span><SpecialistBadge specialist={accepted.author.specialist} /></div>
                        <LinkedText text={accepted.text} className="line-clamp-3 whitespace-pre-wrap text-sm text-slate-700" />
                        <button type="button" onClick={() => jumpToSolution(post)} className="mt-2 text-xs font-semibold text-emerald-800 underline underline-offset-2">Přejít na odpověď</button>
                      </div>}
                      {personalErrors[post.id] && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{personalErrors[post.id]}</p>}
                      <div className="mt-5 border-t border-slate-200/80 pt-4">
                        <div className="mb-3">{personalActions(post)}</div>
                          <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200/90 bg-[linear-gradient(145deg,#f8fafc_0%,#ffffff_100%)] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_22px_rgba(15,23,42,0.05)]">
                                {post.sources.length > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => setSourcesModalPost(post)}
                                    className="group inline-flex h-10 items-center gap-2 rounded-xl border border-transparent px-2.5 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800"
                                  >
                                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700 transition group-hover:bg-sky-200/70">
                                      <Link2 className="h-3.5 w-3.5" />
                                    </span>
                                    Zdroje
                                    <span className="inline-flex min-w-6 items-center justify-center rounded-lg bg-white px-1.5 py-1 text-[11px] font-bold leading-none text-sky-700 shadow-sm ring-1 ring-sky-100">
                                      {post.sources.length}
                                    </span>
                                  </button>
                                ) : null}

                                <button
                                  type="button"
                                  onClick={() => void handleToggleLike(post.id)}
                                  disabled={isLikingThis || !user}
                                  className={`group inline-flex h-10 items-center gap-2 rounded-xl border px-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                    post.likedByMe
                                      ? "border-rose-200 bg-rose-50 text-rose-700 shadow-[0_5px_14px_rgba(244,63,94,0.1)] hover:bg-rose-100"
                                      : "border-transparent text-slate-700 hover:border-rose-100 hover:bg-rose-50/70 hover:text-rose-700"
                                  }`}
                                >
                                  <span
                                    className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition ${
                                      post.likedByMe
                                        ? "bg-rose-100 text-rose-600"
                                        : "bg-slate-100 text-slate-500 group-hover:bg-rose-100 group-hover:text-rose-600"
                                    }`}
                                  >
                                    {isLikingThis ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Heart
                                        className={`h-3.5 w-3.5 ${post.likedByMe ? "fill-current" : ""}`}
                                      />
                                    )}
                                  </span>
                                  <span>{post.likedByMe ? "Líbí se mi" : "Like"}</span>
                                  <span className="inline-flex min-w-6 items-center justify-center rounded-lg bg-white px-1.5 py-1 text-[11px] font-bold leading-none text-current shadow-sm ring-1 ring-current/10">
                                    {post.likeCount}
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleToggleComments(post.id)}
                                  className="group inline-flex h-10 items-center gap-2 rounded-xl border border-transparent px-2.5 text-sm font-semibold text-slate-700 transition hover:border-indigo-100 hover:bg-indigo-50/70 hover:text-indigo-800"
                                >
                                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-indigo-100 group-hover:text-indigo-700">
                                    <MessageSquare className="h-3.5 w-3.5" />
                                  </span>
                                  <span>{post.commentCount} komentářů</span>
                                  {commentsExpanded ? (
                                    <ChevronUp className="h-3.5 w-3.5 text-indigo-500" />
                                  ) : (
                                    <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition group-hover:text-indigo-500" />
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleOpenCommentComposer(post.id)}
                                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-700/80 bg-[linear-gradient(135deg,#16a34a_0%,#047857_100%)] px-3.5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(5,150,105,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_11px_26px_rgba(5,150,105,0.3)] sm:ml-auto"
                                >
                                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-white/15">
                                    <Plus className="h-3.5 w-3.5" />
                                  </span>
                                  Přidat komentář
                                </button>
                          </div>
                        </div>

                      {commentsExpanded ? (
                        <div className="mt-3 rounded-2xl border border-slate-200/90 bg-[linear-gradient(150deg,rgba(248,250,252,0.95)_0%,rgba(255,255,255,0.95)_100%)] p-3">
                          <div className="space-y-2">
                            {post.commentCount > post.comments.reduce((count, comment) => count + 1 + comment.replies.length, 0) && <p className="px-1 text-xs text-slate-500">Zobrazeny nejnovější komentáře a případné vybrané řešení.</p>}
                            {post.comments.length === 0 ? (
                              <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-500">
                                Zatím bez komentářů.
                              </div>
                            ) : (
                              post.comments.map((comment) => {
                                const commentActionKey = replyComposerKey(post.id, comment.id);
                                const isCommentLikePosting =
                                  commentLikePostingById[commentActionKey] === true;
                                const isReplyComposerOpen =
                                  replyComposerOpenById[commentActionKey] === true;
                                const isReplyPosting = replyPostingById[commentActionKey] === true;

                                return (
                                  <div
                                    key={comment.id}
                                    id={`wall-comment-${post.id}-${comment.id}`}
                                    className={`scroll-mt-24 rounded-xl border px-3 py-2 ${post.acceptedCommentId === comment.id ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white/95"}`}
                                  >
                                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                      <ProfileAvatar
                                        src={comment.author.profileAvatar}
                                        name={comment.author.name}
                                        alt=""
                                        className="h-6 w-6 rounded-full text-2xl ring-1 ring-slate-300"
                                        sizes="24px"
                                      />
                                      <span className="font-semibold text-slate-700">{comment.author.name}</span>
                                      <SpecialistBadge specialist={comment.author.specialist} />
                                      <span>{formatDateTime(comment.createdAtMs)}</span>
                                    </div>
                                    <LinkedText
                                      text={comment.text}
                                      className="mt-1 whitespace-pre-wrap text-sm text-slate-700"
                                    />

                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                      {solutionAction(post, comment.id)}
                                      <button
                                        type="button"
                                        onClick={() => void handleToggleCommentLike(post.id, comment.id)}
                                        disabled={isCommentLikePosting || !user}
                                        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                          comment.likedByMe
                                            ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                            : "border-slate-300 bg-white text-slate-700 hover:border-slate-500 hover:bg-slate-100"
                                        }`}
                                      >
                                        {isCommentLikePosting ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <Heart
                                            className={`h-3 w-3 ${comment.likedByMe ? "fill-current" : ""}`}
                                          />
                                        )}
                                        Like
                                        <span className="rounded-full border border-current/25 px-1 leading-none">
                                          {comment.likeCount}
                                        </span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => handleOpenReplyComposer(post.id, comment.id)}
                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-slate-500 hover:bg-slate-100"
                                      >
                                        <MessageSquare className="h-3 w-3" />
                                        Reagovat
                                      </button>

                                      {comment.replies.length > 0 ? (
                                        <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                                          Reakce: {comment.replies.length}
                                        </span>
                                      ) : null}
                                    </div>

                                    {comment.replies.length > 0 ? (
                                      <div className="mt-2 space-y-2 border-l border-slate-200 pl-3">
                                        {comment.replies.map((reply) => {
                                          const replyLikeKey = replyComposerKey(post.id, reply.id);
                                          const isReplyLikePosting =
                                            commentLikePostingById[replyLikeKey] === true;
                                          return (
                                            <div
                                              key={reply.id}
                                              id={`wall-comment-${post.id}-${reply.id}`}
                                              className={`scroll-mt-24 rounded-lg border px-2.5 py-2 ${post.acceptedCommentId === reply.id ? "border-emerald-300 bg-emerald-50" : "border-slate-200/90 bg-slate-50/80"}`}
                                            >
                                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                                <ProfileAvatar
                                                  src={reply.author.profileAvatar}
                                                  name={reply.author.name}
                                                  alt=""
                                                  className="h-5 w-5 rounded-full text-xl ring-1 ring-slate-300"
                                                  sizes="20px"
                                                />
                                                <span className="font-semibold text-slate-700">
                                                  {reply.author.name}
                                                </span>
                                                <SpecialistBadge specialist={reply.author.specialist} />
                                                <span>{formatDateTime(reply.createdAtMs)}</span>
                                              </div>
                                              <LinkedText
                                                text={reply.text}
                                                className="mt-1 whitespace-pre-wrap text-sm text-slate-700"
                                              />
                                              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                                {solutionAction(post, reply.id)}
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    void handleToggleCommentLike(post.id, reply.id)
                                                  }
                                                  disabled={isReplyLikePosting || !user}
                                                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                                    reply.likedByMe
                                                      ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-500 hover:bg-slate-100"
                                                  }`}
                                                >
                                                  {isReplyLikePosting ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                  ) : (
                                                    <Heart
                                                      className={`h-3 w-3 ${reply.likedByMe ? "fill-current" : ""}`}
                                                    />
                                                  )}
                                                  Like
                                                  <span className="rounded-full border border-current/25 px-1 leading-none">
                                                    {reply.likeCount}
                                                  </span>
                                                </button>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : null}

                                    {isReplyComposerOpen ? (
                                      <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
                                        <textarea
                                          ref={(node) => {
                                            replyInputRefs.current[commentActionKey] = node;
                                          }}
                                          value={replyDraftsById[commentActionKey] ?? ""}
                                          onChange={(event) =>
                                            setReplyDraftsById((prev) => ({
                                              ...prev,
                                              [commentActionKey]: event.target.value,
                                            }))
                                          }
                                          rows={2}
                                          placeholder={`Reakce na komentář od ${comment.author.name}...`}
                                          className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                                        />

                                        <div className="flex flex-wrap gap-1.5">
                                          {QUICK_EMOJIS.slice(0, 14).map((emoji) => (
                                            <button
                                              key={`${commentActionKey}-${emoji}`}
                                              type="button"
                                              onMouseDown={(event) => event.preventDefault()}
                                              onClick={() =>
                                                addEmojiToReply(post.id, comment.id, emoji)
                                              }
                                              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm transition hover:border-slate-500 hover:bg-slate-100"
                                            >
                                              {emoji}
                                            </button>
                                          ))}
                                        </div>

                                        {replyErrorById[commentActionKey] ? (
                                          <div className="rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">
                                            {replyErrorById[commentActionKey]}
                                          </div>
                                        ) : null}

                                        <div className="flex items-center justify-between gap-2">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setReplyComposerOpenById((prev) => ({
                                                ...prev,
                                                [commentActionKey]: false,
                                              }))
                                            }
                                            className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-500 hover:bg-slate-100"
                                          >
                                            <X className="h-3.5 w-3.5" />
                                            Zavřít
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() =>
                                              void handleCreateComment(post.id, comment.id)
                                            }
                                            disabled={isReplyPosting || !user}
                                            className="inline-flex items-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                          >
                                            {isReplyPosting ? (
                                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                              <Send className="h-3.5 w-3.5" />
                                            )}
                                            Odeslat reakci
                                          </button>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })
                            )}
                          </div>

                          {commentComposerOpen ? (
                            <div className="mt-3 space-y-2">
                              <textarea
                                ref={(node) => {
                                  commentInputRefs.current[post.id] = node;
                                }}
                                value={commentDrafts[post.id] ?? ""}
                                onChange={(event) =>
                                  setCommentDrafts((prev) => ({
                                    ...prev,
                                    [post.id]: event.target.value,
                                  }))
                                }
                                rows={2}
                                placeholder="Napiš komentář..."
                                className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                              />

                              <div className="flex flex-wrap gap-1.5">
                                {QUICK_EMOJIS.slice(0, 14).map((emoji) => (
                                  <button
                                    key={`${post.id}-${emoji}`}
                                    type="button"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => addEmojiToComment(post.id, emoji)}
                                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm transition hover:border-slate-500 hover:bg-slate-100"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>

                              {commentErrorById[post.id] ? (
                                <div className="rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">
                                  {commentErrorById[post.id]}
                                </div>
                              ) : null}

                              <div className="flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCommentComposerOpenById((prev) => ({
                                      ...prev,
                                      [post.id]: false,
                                    }))
                                  }
                                  className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-500 hover:bg-slate-100"
                                >
                                  <X className="h-3.5 w-3.5" />
                                  Zavřít formulář
                                </button>

                                <button
                                  type="button"
                                  onClick={() => void handleCreateComment(post.id)}
                                  disabled={isCommentPostingThis || !user}
                                  className="inline-flex items-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isCommentPostingThis ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Send className="h-3.5 w-3.5" />
                                  )}
                                  Odeslat komentář
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })}

                {olderPostsError ? (
                  <div className="rounded-2xl border border-red-300/80 bg-red-50/90 px-4 py-3 text-sm font-semibold text-red-700">
                    {olderPostsError}
                  </div>
                ) : null}

                {postsHasMore ? (
                  <div className="flex justify-center py-2">
                    <button
                      type="button"
                      onClick={handleLoadOlderPosts}
                      disabled={loadingOlderPosts || !postsCursorMs}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white/92 px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.1)] transition hover:-translate-y-0.5 hover:border-slate-500 hover:bg-white disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      {loadingOlderPosts ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                      {loadingOlderPosts ? "Načítám starší" : "Zobrazit starší"}
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>

      {readerPost ? (
        <div className="fixed inset-0 z-[55] flex items-center justify-center px-3 py-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-md"
            onClick={() => setReaderPost(null)}
            aria-label="Zavřít celý příspěvek"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="intranet-reader-title"
            ref={readerDialogRef}
            tabIndex={-1}
            onKeyDown={event => {
              if (event.key !== "Tab") return;
              const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]')];
              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              if (!first) { event.preventDefault(); return; }
              if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }}
            className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[30px] border border-white/80 bg-white shadow-[0_38px_110px_rgba(2,6,23,0.58)]"
          >
            <div
              className={`h-1.5 shrink-0 bg-gradient-to-r ${readerVisual.rail}`}
              aria-hidden="true"
            />
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3.5 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <ProfileAvatar
                  src={readerPost.author.profileAvatar}
                  name={readerPost.author.name}
                  className="h-11 w-11 rounded-2xl text-[2.75rem] shadow-inner ring-1 ring-slate-200"
                  sizes="44px"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={[
                        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold",
                        readerVisual.badge,
                      ].join(" ")}
                    >
                      <ReaderSectionIcon className="h-3.5 w-3.5" />
                      {readerPost.sectionLabel}
                    </span>
                    <span className="truncate text-xs font-semibold text-slate-600">
                      {readerPost.author.name}
                    </span>
                    <SpecialistBadge specialist={readerPost.author.specialist} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatDateTime(readerPost.createdAtMs)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5" />
                      {wallPostReadingMinutes(readerPost.text)} min čtení
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setReaderPost(null)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 transition hover:border-slate-500 hover:bg-slate-100"
                aria-label="Zavřít celý příspěvek"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-4 py-6 sm:px-7 sm:py-8">
              <article className="mx-auto max-w-3xl">
                <h2
                  id="intranet-reader-title"
                  className="text-3xl font-black leading-[1.12] tracking-[-0.035em] text-slate-950 sm:text-4xl"
                >
                  {readerPost.title}
                </h2>
                <div className={`mt-5 h-1 w-20 rounded-full bg-gradient-to-r ${readerVisual.rail}`} />
                <LinkedText
                  text={readerPost.text}
                  className="mt-7 whitespace-pre-wrap text-[16px] leading-8 text-slate-700 sm:text-[17px] sm:leading-8"
                />

                <div className="mt-6">{personalActions(readerPost)}</div>
                {personalErrors[readerPost.id] && <p role="alert" className="mt-3 text-sm text-red-700">{personalErrors[readerPost.id]}</p>}
                {readerPost.sources.length > 0 ? (
                  <div className="mt-8 border-t border-slate-200 pt-5">
                    <button
                      type="button"
                      onClick={() => setSourcesModalPost(readerPost)}
                      className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-sm font-bold text-sky-800 transition hover:border-sky-300 hover:bg-sky-100"
                    >
                      <Link2 className="h-4 w-4" />
                      Zobrazit zdroje
                      <span className="rounded-full border border-sky-300/70 bg-white/70 px-1.5 py-0.5 text-xs leading-none">
                        {readerPost.sources.length}
                      </span>
                    </button>
                  </div>
                ) : null}
              </article>
            </div>
          </div>
        </div>
      ) : null}

      {sourcesModalPost ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-3 py-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/65 backdrop-blur-sm"
            onClick={() => setSourcesModalPost(null)}
            aria-label="Zavřít zdroje příspěvku"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="intranet-post-sources-title"
            className="relative z-10 max-h-[86vh] w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-[0_34px_90px_rgba(2,6,23,0.48)]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-[linear-gradient(145deg,#eff6ff_0%,#ffffff_100%)] px-4 py-4 sm:px-5">
              <div className="flex min-w-0 items-start gap-3">
                <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 text-sky-700">
                  <Link2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3
                    id="intranet-post-sources-title"
                    className="text-xl font-bold tracking-[-0.01em] text-slate-900"
                  >
                    Zdroje
                  </h3>
                  <p className="mt-0.5 truncate text-sm font-medium text-slate-600">
                    {sourcesModalPost.title}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSourcesModalPost(null)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 transition hover:border-slate-500 hover:bg-slate-100"
                aria-label="Zavřít zdroje příspěvku"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[66vh] space-y-2 overflow-y-auto bg-slate-50/80 p-4 sm:p-5">
              {sourcesModalPost.sources.map((source, index) => (
                <a
                  key={source}
                  href={source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_12px_26px_rgba(14,165,233,0.12)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-sky-50 text-sm font-bold text-sky-700">
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-slate-900">
                        {intranetWallSourceHost(source)}
                      </span>
                      <span className="mt-0.5 block break-all text-xs leading-5 text-slate-500">
                        {source}
                      </span>
                    </span>
                  </div>
                  <ExternalLink className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-sky-700" />
                </a>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {attachmentPreview ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-3 py-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-md"
            onClick={closeAttachmentPreview}
            aria-label="Zavřít náhled přílohy"
          />

          <div className="relative z-10 flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-[0_34px_90px_rgba(2,6,23,0.5)]">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700">
                  <AttachmentPreviewIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-900">
                    {attachmentPreview.attachment.name}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    {attachmentPreview.attachment.contentType} •{" "}
                    {formatBytes(attachmentPreview.attachment.sizeBytes)}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {attachmentPreview.objectUrl ? (
                  <a
                    href={attachmentPreview.objectUrl}
                    download={attachmentPreview.attachment.name}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-500 hover:bg-slate-100"
                  >
                    <Download className="h-4 w-4" />
                    Stáhnout
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={closeAttachmentPreview}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 transition hover:border-slate-500 hover:bg-slate-100"
                  aria-label="Zavřít náhled přílohy"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="min-h-[54vh] flex-1 overflow-auto bg-slate-100 p-3 sm:p-4">
              {attachmentPreview.loading ? (
                <div className="flex min-h-[54vh] items-center justify-center rounded-2xl bg-white">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Načítám náhled
                  </div>
                </div>
              ) : attachmentPreview.error ? (
                <div className="flex min-h-[54vh] items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-5 text-center text-sm font-semibold text-red-700">
                  {attachmentPreview.error}
                </div>
              ) : attachmentPreview.objectUrl && attachmentPreview.attachment.isImage ? (
                <div className="flex min-h-[54vh] items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={attachmentPreview.objectUrl}
                    alt={`Náhled ${attachmentPreview.attachment.name}`}
                    className="max-h-[74vh] max-w-full rounded-2xl object-contain shadow-[0_18px_50px_rgba(15,23,42,0.18)]"
                  />
                </div>
              ) : attachmentPreview.pdfData && previewAttachmentIsPdf ? (
                <PdfDocumentPreview
                  pdfData={attachmentPreview.pdfData}
                  name={attachmentPreview.attachment.name}
                  cacheKey={attachmentPreview.attachment.url}
                />
              ) : (
                <div className="flex min-h-[54vh] items-center justify-center rounded-2xl bg-white px-5 text-center text-sm font-semibold text-slate-600">
                  {previewAttachmentCanRender
                    ? "Náhled se nepodařilo zobrazit."
                    : "Náhled pro tento typ souboru zatím není dostupný. Soubor si můžeš stáhnout."}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {postModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-3 py-4">
          <button
            type="button"
            className={`${styles.modalBackdrop} absolute inset-0 bg-slate-950/60 backdrop-blur-sm`}
            onClick={closePostModal}
            aria-label="Zavřít okno"
          />

          <div className={`${styles.modalPanel} relative z-10 w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/80 bg-white/96 shadow-[0_34px_90px_rgba(2,6,23,0.48)] max-h-[92vh]`}>
            <div className="grid max-h-[92vh] overflow-y-auto lg:grid-cols-[1.15fr_0.85fr]">
              <div className="p-4 sm:p-5 lg:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-[0_12px_24px_rgba(16,185,129,0.2)]">
                      <PostModalIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold tracking-[-0.01em] text-slate-900">
                        {isEditingPost ? "Upravit příspěvek" : "Přidat příspěvek"}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {isEditingPost ? "Uprav text, titulek nebo sekci." : "Sdílej update, otázku nebo tip."}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={closePostModal}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 transition hover:border-slate-500 hover:bg-slate-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <label className="block space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">
                        Titulek
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {title.length}/{MAX_TITLE_LEN}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={title}
                      onChange={(event) => {
                        setTitle(event.target.value.slice(0, MAX_TITLE_LEN));
                        setPostError(null);
                      }}
                      placeholder="Nadpis příspěvku"
                      className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                    />
                  </label>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="intranet-post-text" className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">
                        Text
                      </label>
                      <span className="text-[11px] text-slate-400">
                        {text.length}/{MAX_TEXT_LEN}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/85 p-1.5">
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={togglePostTextBold}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:border-slate-500 hover:bg-slate-100"
                        title="Tučné písmo (⌘/Ctrl + B)"
                        aria-label="Tučné písmo"
                      >
                        <span className="font-serif text-base font-bold">B</span>
                        Tučně
                      </button>
                      <span className="hidden text-xs text-slate-500 sm:inline">
                        Označ text a zvol Tučně.
                      </span>
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => setEmojiOpen((prev) => !prev)}
                        className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-slate-500 hover:bg-slate-100"
                        aria-expanded={emojiOpen}
                        aria-controls="intranet-emoji-picker"
                      >
                        <Smile className="h-4 w-4" />
                        Emoji
                      </button>
                    </div>
                    <WallPostRichTextEditor
                      id="intranet-post-text"
                      ref={postTextEditorRef}
                      value={text}
                      maxLength={MAX_TEXT_LEN}
                      onChange={(nextValue) => {
                        setText(nextValue);
                        setPostError(null);
                      }}
                      placeholder="Napiš text příspěvku..."
                    />
                  </div>

                  {emojiOpen ? (
                    <div
                      id="intranet-emoji-picker"
                      className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
                    >
                      <EmojiPicker
                        onEmojiClick={handlePostEmojiClick}
                        emojiStyle={EmojiStyle.NATIVE}
                        lazyLoadEmojis
                        searchPlaceholder="Hledat emoji"
                        previewConfig={{ showPreview: false }}
                        skinTonesDisabled
                        width="100%"
                        height={340}
                      />
                      <p className="px-1 pt-2 text-[11px] leading-4 text-slate-500">
                        Kompletní Unicode emoji knihovna se na macOS zobrazí systémovým Apple vzhledem.
                        Můžeš také použít systémový výběr klávesami ⌃⌘ Mezerník.
                      </p>
                    </div>
                  ) : null}

                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">
                      Sekce
                    </span>
                    <select
                      value={postSection}
                      onChange={(event) => setPostSection(event.target.value as IntranetSectionKey)}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                    >
                      {INTRANET_SECTIONS.map((section) => (
                        <option key={section.key} value={section.key}>
                          {section.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid gap-3 rounded-2xl border border-violet-100 bg-[linear-gradient(145deg,#faf5ff_0%,#ffffff_100%)] p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.13em] text-violet-800">
                        <Pin className="h-3.5 w-3.5" />
                        Důležitost příspěvku
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">
                        Připnuté příspěvky se v sekci zobrazí jako první.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={postPinned}
                      onClick={() => setPostPinned((value) => !value)}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                        postPinned
                          ? "border-violet-700 bg-violet-700 text-white shadow-[0_8px_18px_rgba(109,40,217,0.25)]"
                          : "border-violet-200 bg-white text-violet-800 hover:bg-violet-50"
                      }`}
                    >
                      <Pin className={`h-3.5 w-3.5 ${postPinned ? "fill-current" : ""}`} />
                      {postPinned ? "Připnuto nahoře" : "Připnout nahoře"}
                    </button>
                    <label className="sm:col-span-2 block space-y-1.5 border-t border-violet-100 pt-3">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">
                        <CalendarClock className="h-3.5 w-3.5" />
                        Přečíst do (volitelné)
                      </span>
                      <input
                        type="date"
                        value={postReadByDay}
                        onChange={(event) => setPostReadByDay(event.target.value)}
                        className="w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-600 focus:ring-2 focus:ring-violet-100"
                      />
                    </label>
                  </div>

                  {!isEditingPost ? (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.13em] text-emerald-700">
                            <BarChart3 className="h-3.5 w-3.5" />
                            Hlasování
                          </div>
                          <div className="mt-1 text-xs text-emerald-800/80">
                            Jedna otázka, jedna volba na člověka.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setPollEnabled((prev) => !prev);
                            setPostError(null);
                          }}
                          className={[
                            "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition",
                            pollEnabled
                              ? "border-emerald-600 bg-emerald-600 text-white"
                              : "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50",
                          ].join(" ")}
                        >
                          <Vote className="h-3.5 w-3.5" />
                          {pollEnabled ? "Zapnuto" : "Přidat"}
                        </button>
                      </div>

                      {pollEnabled ? (
                        <div className="mt-3 space-y-2">
                          <label className="block space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-800">
                                Otázka
                              </span>
                              <span className="text-[11px] text-emerald-800/60">
                                {pollQuestion.length}/{MAX_POLL_QUESTION_LEN}
                              </span>
                            </div>
                            <input
                              type="text"
                              value={pollQuestion}
                              onChange={(event) => {
                                setPollQuestion(event.target.value.slice(0, MAX_POLL_QUESTION_LEN));
                                setPostError(null);
                              }}
                              placeholder="Na co se chceš zeptat?"
                              className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                            />
                          </label>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-800">
                                Možnosti
                              </span>
                              <span className="text-[11px] text-emerald-800/60">
                                {pollOptions.length}/{MAX_POLL_OPTIONS}
                              </span>
                            </div>

                            {pollOptions.map((option, index) => (
                              <div key={`poll-option-${index}`} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={option}
                                  onChange={(event) => updatePollOption(index, event.target.value)}
                                  placeholder={`Možnost ${index + 1}`}
                                  className="min-w-0 flex-1 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                                />
                                <button
                                  type="button"
                                  onClick={() => removePollOption(index)}
                                  disabled={pollOptions.length <= MIN_POLL_OPTIONS}
                                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-white text-emerald-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                                  aria-label={`Odebrat možnost ${index + 1}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}

                            <button
                              type="button"
                              onClick={addPollOption}
                              disabled={pollOptions.length >= MAX_POLL_OPTIONS}
                              className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Přidat možnost
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : editingPost.poll ? (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 text-xs font-semibold text-emerald-800">
                      Tento příspěvek má anketu. Otázky a možnosti se po publikování nemění, aby výsledky zůstaly férové.
                    </div>
                  ) : null}

                  {postError ? (
                    <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {postError}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleSavePost}
                    disabled={posting || !user}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-700 bg-[linear-gradient(135deg,#16a34a_0%,#047857_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_42px_rgba(5,150,105,0.3)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_50px_rgba(5,150,105,0.36)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {isEditingPost ? "Uložit úpravy" : "Publikovat příspěvek"}
                  </button>
                </div>
              </div>

              <div className="border-t border-slate-200/80 bg-[linear-gradient(160deg,#f8fafc_0%,#eef6ff_100%)] p-4 sm:p-5 lg:border-l lg:border-t-0 lg:p-6">
                <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white/85 border-slate-300">
                  <SelectedPostIcon className="h-3.5 w-3.5" />
                  {INTRANET_SECTION_LABEL_BY_KEY.get(postSection) ?? postSection}
                </div>

                <h4 className="text-sm font-semibold uppercase tracking-[0.13em] text-slate-500">Přílohy</h4>

                {isEditingPost ? (
                  <>
                    <div className="mt-3 space-y-2 rounded-2xl border border-slate-200 bg-white/80 p-3">
                      <input
                        ref={replaceAttachmentInputRef}
                        type="file"
                        onChange={(event) => handleReplaceAttachmentFile(event.target.files)}
                        className="hidden"
                      />
                      {editingPost.attachments.length > 0 ? (
                        editingPost.attachments.map((attachment) => {
                          const isRemoved = removedAttachmentIdSet.has(attachment.id);
                          const replacementFile = replacementFilesByAttachmentId[attachment.id];
                          const attachmentIsPdf = isPdfAttachment(attachment);
                          const ExistingAttachmentIcon = attachment.isImage
                            ? ImageIcon
                            : attachmentIsPdf
                              ? FileText
                              : Paperclip;

                          return (
                            <div
                              key={attachment.id}
                              className={[
                                "rounded-xl border p-2 text-xs transition",
                                isRemoved
                                  ? "border-amber-200 bg-amber-50/80"
                                  : "border-slate-200 bg-white",
                              ].join(" ")}
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex min-w-0 items-center gap-2">
                                  <div
                                    className={[
                                      "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
                                      attachmentIsPdf
                                        ? "border-red-200 bg-red-50 text-red-700"
                                        : "border-slate-200 bg-slate-50 text-slate-600",
                                    ].join(" ")}
                                  >
                                    <ExistingAttachmentIcon className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="truncate font-bold text-slate-800">
                                      {attachment.name}
                                    </div>
                                    <div className="mt-0.5 text-[11px] font-medium text-slate-500">
                                      {attachment.contentType} • {formatBytes(attachment.sizeBytes)}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                                  {!isRemoved ? (
                                    <button
                                      type="button"
                                      onClick={() => void handleOpenAttachment(attachment)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:border-slate-500 hover:bg-slate-100"
                                    >
                                      <ExistingAttachmentIcon className="h-3.5 w-3.5" />
                                      Náhled
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => handleReplaceAttachmentClick(attachment.id)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5 text-[11px] font-semibold text-sky-700 transition hover:bg-sky-100"
                                  >
                                    <RefreshCw className="h-3.5 w-3.5" />
                                    {replacementFile ? "Změnit" : "Nahradit"}
                                  </button>
                                  {isRemoved ? (
                                    <button
                                      type="button"
                                      onClick={() => handleUndoExistingAttachmentChange(attachment.id)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:border-slate-500 hover:bg-slate-100"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                      Vrátit
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveExistingAttachment(attachment.id)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] font-semibold text-red-700 transition hover:bg-red-100"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      Odebrat
                                    </button>
                                  )}
                                </div>
                              </div>

                              {replacementFile ? (
                                <div className="mt-2 rounded-lg border border-sky-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-sky-700">
                                  Nový soubor: {replacementFile.name} •{" "}
                                  {formatBytes(replacementFile.size)}
                                </div>
                              ) : isRemoved ? (
                                <div className="mt-2 rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-amber-700">
                                  Příloha bude po uložení odebraná.
                                </div>
                              ) : null}
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-xs text-slate-500">Bez příloh.</div>
                      )}
                    </div>

                    <div
                      className={[
                        styles.dropzone,
                        isDraggingFiles ? styles.dropzoneActive : "",
                        "mt-3 space-y-2 rounded-2xl border border-dashed border-slate-300 bg-white/80 p-3 transition",
                      ].join(" ")}
                      onDragEnter={handleDropZoneDragEnter}
                      onDragOver={handleDropZoneDragOver}
                      onDragLeave={handleDropZoneDragLeave}
                      onDrop={handleDropZoneDrop}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={attachmentSlotsAvailable <= 0}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          Dohrát přílohu
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          onChange={(event) => handleFileAdd(event.target.files)}
                          className="hidden"
                        />
                        <span className="text-xs text-slate-500">
                          Volná místa: {attachmentSlotsAvailable}
                        </span>
                      </div>
                      <div className={styles.dropzoneHint}>
                        {attachmentSlotsAvailable <= 0
                          ? `Limit ${MAX_FILES} příloh je vyčerpaný.`
                          : isDraggingFiles
                            ? "Pusť soubory sem a přidám je k přílohám."
                            : "Přetáhni nové soubory sem nebo klikni na Dohrát přílohu."}
                      </div>

                      {files.length > 0 ? (
                        <div className="space-y-2">
                          {files.map((file, index) => {
                            const key = filePreviewKey(file, index);
                            const previewUrl = filePreviewUrls[key];
                            const showPreview = isPreviewableImage(file) && !!previewUrl;

                            return (
                              <div key={key} className="rounded-xl border border-slate-300 bg-white p-2 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="truncate font-semibold text-slate-800">{file.name}</div>
                                    <div className="text-slate-500">{formatBytes(file.size)}</div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveFile(index)}
                                    className="rounded-lg border border-slate-300 p-1 text-slate-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                                    aria-label={`Odebrat soubor ${file.name}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>

                                {showPreview ? (
                                  <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={previewUrl}
                                      alt={`Náhled ${file.name}`}
                                      className="h-32 w-full object-cover"
                                    />
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500">Zatím nejsou vybrané nové přílohy.</div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-xs text-slate-600">PNG/JPG/JPEG zobrazí náhled přímo ve formuláři.</p>

                    <div
                      className={[
                        styles.dropzone,
                        isDraggingFiles ? styles.dropzoneActive : "",
                        "mt-3 space-y-2 rounded-2xl border border-dashed border-slate-300 bg-white/80 p-3 transition",
                      ].join(" ")}
                      onDragEnter={handleDropZoneDragEnter}
                      onDragOver={handleDropZoneDragOver}
                      onDragLeave={handleDropZoneDragLeave}
                      onDrop={handleDropZoneDrop}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-500 hover:bg-slate-100"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          Přidat soubor
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          onChange={(event) => handleFileAdd(event.target.files)}
                          className="hidden"
                        />
                        <span className="text-xs text-slate-500">Max {MAX_FILES} souborů</span>
                      </div>
                      <div className={styles.dropzoneHint}>
                        {isDraggingFiles
                          ? "Pusť soubory sem a přidám je do příloh."
                          : "Přetáhni soubory sem nebo klikni na Přidat soubor."}
                      </div>

                      {files.length > 0 ? (
                        <div className="space-y-2">
                          {files.map((file, index) => {
                            const key = filePreviewKey(file, index);
                            const previewUrl = filePreviewUrls[key];
                            const showPreview = isPreviewableImage(file) && !!previewUrl;

                            return (
                              <div key={key} className="rounded-xl border border-slate-300 bg-white p-2 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="truncate font-semibold text-slate-800">{file.name}</div>
                                    <div className="text-slate-500">{formatBytes(file.size)}</div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveFile(index)}
                                    className="rounded-lg border border-slate-300 p-1 text-slate-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                                    aria-label={`Odebrat soubor ${file.name}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>

                                {showPreview ? (
                                  <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={previewUrl}
                                      alt={`Náhled ${file.name}`}
                                      className="h-32 w-full object-cover"
                                    />
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500">Zatím bez příloh.</div>
                      )}
                    </div>
                  </>
                )}

                <div className="mt-5 border-t border-slate-200 pt-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.13em] text-slate-500">
                        <Link2 className="h-4 w-4" />
                        Zdroje
                      </h4>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        Přidej odkazy, ze kterých příspěvek čerpá.
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-500">
                      {postSources.length}/{INTRANET_WALL_MAX_SOURCES}
                    </span>
                  </div>

                  {postSources.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {postSources.map((source, index) => (
                        <div key={`post-source-${index}`} className="flex items-center gap-2">
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-sky-50 text-xs font-bold text-sky-700">
                            {index + 1}
                          </span>
                          <input
                            type="url"
                            inputMode="url"
                            autoComplete="url"
                            value={source}
                            maxLength={INTRANET_WALL_SOURCE_MAX_URL_LENGTH}
                            onChange={(event) => updatePostSource(index, event.target.value)}
                            placeholder="https://www.example.cz/clanek"
                            aria-label={`Zdroj ${index + 1}`}
                            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
                          />
                          <button
                            type="button"
                            onClick={() => removePostSource(index)}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100"
                            aria-label={`Odebrat zdroj ${index + 1}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white/70 px-3 py-2.5 text-xs text-slate-500">
                      Zatím bez zdrojů.
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={addPostSource}
                    disabled={postSources.length >= INTRANET_WALL_MAX_SOURCES}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 transition hover:border-sky-300 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Přidat zdroj
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
