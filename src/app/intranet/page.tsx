"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { Space_Grotesk } from "next/font/google";
import type { LucideIcon } from "lucide-react";
import {
  CarFront,
  CircleHelp,
  Clock3,
  HeartPulse,
  Home,
  Image as ImageIcon,
  Landmark,
  Loader2,
  MessageSquare,
  Paperclip,
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
  Wrench,
  X,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import {
  INTRANET_SECTIONS,
  INTRANET_SECTION_LABEL_BY_KEY,
  type IntranetSectionKey,
} from "./sections";
import styles from "./intranetWallArt.module.css";

const wallFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

type WallAuthor = {
  uid: string;
  email: string;
  name: string;
};

type WallAttachment = {
  id: string;
  name: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  isImage: boolean;
  path: string;
};

type WallComment = {
  id: string;
  text: string;
  createdAtMs: number | null;
  author: WallAuthor;
};

type WallPost = {
  id: string;
  title: string;
  text: string;
  section: IntranetSectionKey;
  sectionLabel: string;
  createdAtMs: number | null;
  updatedAtMs: number | null;
  commentCount: number;
  author: WallAuthor;
  attachments: WallAttachment[];
  comments: WallComment[];
};

type WallApiResponse = {
  ok?: boolean;
  error?: string;
  posts?: WallPost[];
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

type WallCommentCreateResponse = {
  ok?: boolean;
  error?: string;
  commentId?: string;
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

const initialsFromName = (name: string): string => {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return "?";
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
};

export default function IntranetPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [selectedSection, setSelectedSection] = useState<IntranetSectionKey>("obecne");
  const [posts, setPosts] = useState<WallPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [postSection, setPostSection] = useState<IntranetSectionKey>("obecne");
  const [files, setFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [filePreviewUrls, setFilePreviewUrls] = useState<Record<string, string>>({});
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);

  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentPostingById, setCommentPostingById] = useState<Record<string, boolean>>({});
  const [commentErrorById, setCommentErrorById] = useState<Record<string, string | null>>({});
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setUser(fbUser);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!postModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPostModalOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [postModalOpen]);

  useEffect(() => {
    if (postModalOpen) return;
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
  }, [postModalOpen]);

  const loadPosts = async (currentUser: FirebaseUser, section: IntranetSectionKey) => {
    setLoadingPosts(true);
    setPostsError(null);
    try {
      const query = new URLSearchParams();
      query.set("section", section);
      query.set("limit", "40");
      const endpoint = `/api/intranet/wall${query.toString() ? `?${query.toString()}` : ""}`;
      const payload = await fetchAuthedJsonOrThrow<WallApiResponse>(currentUser, endpoint, {
        method: "GET",
      });
      if (!payload?.ok) {
        throw new Error(payload?.error || "Server nevrátil úspěšnou odpověď.");
      }
      setPosts(Array.isArray(payload.posts) ? payload.posts : []);
    } catch (error) {
      setPostsError(
        error instanceof Error ? error.message : "Nepodařilo se načíst příspěvky."
      );
      setPosts([]);
    } finally {
      setLoadingPosts(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setPosts([]);
      return;
    }
    void loadPosts(user, selectedSection);
  }, [user, selectedSection]);

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
    () => INTRANET_SECTION_LABEL_BY_KEY.get(selectedSection) ?? selectedSection,
    [selectedSection]
  );

  const selectedSectionVisual = SECTION_VISUALS[selectedSection];
  const selectedPostSectionVisual = SECTION_VISUALS[postSection];
  const SelectedFilterIcon = selectedSectionVisual.icon;
  const SelectedPostIcon = selectedPostSectionVisual.icon;

  const addEmojiToPost = (emoji: string) => {
    setText((prev) => `${prev}${emoji}`);
    setPostError(null);
  };

  const addEmojiToComment = (postId: string, emoji: string) => {
    setCommentDrafts((prev) => ({
      ...prev,
      [postId]: `${prev[postId] ?? ""}${emoji}`,
    }));
    setCommentErrorById((prev) => ({ ...prev, [postId]: null }));
  };

  const addFiles = (incoming: File[]) => {
    if (!incoming.length) return;
    setFiles((prev) => {
      const merged = [...prev, ...incoming];
      if (merged.length <= MAX_FILES) return merged;
      return merged.slice(0, MAX_FILES);
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

  const handleCreatePost = async () => {
    if (!user || posting) return;
    const trimmedTitle = title.trim();
    const trimmedText = text.trim();
    if (!trimmedTitle) {
      setPostError("Titulek je povinný.");
      return;
    }
    if (!trimmedText) {
      setPostError("Text příspěvku je povinný.");
      return;
    }

    setPosting(true);
    setPostError(null);

    try {
      const form = new FormData();
      form.set("title", trimmedTitle.slice(0, MAX_TITLE_LEN));
      form.set("text", trimmedText.slice(0, MAX_TEXT_LEN));
      form.set("section", postSection);
      files.forEach((file) => form.append("files", file));

      const payload = await fetchAuthedJsonOrThrow<WallCreateResponse>(
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
      setEmojiOpen(false);
      setPostModalOpen(false);
      await loadPosts(user, selectedSection);
    } catch (error) {
      setPostError(error instanceof Error ? error.message : "Nepodařilo se přidat příspěvek.");
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

  const handleCreateComment = async (postId: string) => {
    if (!user) return;
    const draft = (commentDrafts[postId] ?? "").trim();
    if (!draft) return;
    if (commentPostingById[postId]) return;

    setCommentPostingById((prev) => ({ ...prev, [postId]: true }));
    setCommentErrorById((prev) => ({ ...prev, [postId]: null }));

    try {
      const payload = await fetchAuthedJsonOrThrow<WallCommentCreateResponse>(
        user,
        `/api/intranet/wall/${encodeURIComponent(postId)}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ text: draft }),
        }
      );
      if (!payload?.ok) {
        throw new Error(payload?.error || "Server nevrátil úspěšnou odpověď.");
      }

      setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
      await loadPosts(user, selectedSection);
    } catch (error) {
      setCommentErrorById((prev) => ({
        ...prev,
        [postId]:
          error instanceof Error ? error.message : "Nepodařilo se uložit komentář.",
      }));
    } finally {
      setCommentPostingById((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const canDeletePost = (post: WallPost): boolean => {
    const me = normalizeEmail(user?.email);
    const author = normalizeEmail(post.author.email);
    return !!me && !!author && me === author;
  };

  return (
    <AppLayout active="intranet">
      <div className={`${wallFont.className} relative w-full overflow-hidden px-2 pb-10 pt-2 sm:px-3`}>
        <div className={styles.canvas} aria-hidden="true">
          <span className={`${styles.orb} ${styles.orbA}`} />
          <span className={`${styles.orb} ${styles.orbB}`} />
          <span className={`${styles.orb} ${styles.orbC}`} />
          <span className={styles.mesh} />
          <span className={styles.grain} />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl space-y-5">
          <section className={`${styles.heroPanel} rounded-[34px] border border-white/70 bg-white/72 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-xl sm:p-6`}>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">
                  <Sparkles className="h-3.5 w-3.5" />
                  Intranet Wall
                </div>

                <div>
                  <h1 className="text-3xl font-bold tracking-[-0.02em] text-slate-900 sm:text-4xl">
                    Týmová zeď, která má styl
                  </h1>
                  <p className="mt-2 max-w-3xl text-sm text-slate-700 sm:text-base">
                    Prostor pro informace, know-how a rychlou spolupráci. Každá sekce má svůj charakter, každý příspěvek jasný vizuální rytmus.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                  <span className="rounded-full border border-slate-300/80 bg-white/85 px-2.5 py-1">
                    Sekce: <strong>{currentSectionLabel}</strong>
                  </span>
                  <span className="rounded-full border border-slate-300/80 bg-white/85 px-2.5 py-1">
                    Příspěvky: <strong>{posts.length}</strong>
                  </span>
                </div>
              </div>

              <div className="flex justify-start xl:justify-end">
                <button
                  type="button"
                  onClick={() => setPostModalOpen(true)}
                  className={`${styles.createButton} inline-flex items-center gap-3 rounded-2xl border border-emerald-700/70 bg-[linear-gradient(135deg,#16a34a_0%,#047857_100%)] px-6 py-3.5 text-lg font-bold text-white shadow-[0_18px_44px_rgba(5,150,105,0.34)] transition hover:-translate-y-1 hover:shadow-[0_22px_52px_rgba(5,150,105,0.42)]`}
                >
                  <Plus className="h-5 w-5" />
                  Přidat příspěvek +
                </button>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2 px-1 pb-2 pt-1">
              {INTRANET_SECTIONS.map((section) => {
                const visual = SECTION_VISUALS[section.key];
                const SectionIcon = visual.icon;
                const isActive = selectedSection === section.key;

                return (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => setSelectedSection(section.key)}
                    className={[
                      styles.sectionChip,
                      "inline-flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-sm font-semibold transition",
                      isActive
                        ? `${visual.chipActive} ${visual.chipGlow}`
                        : "border-slate-300/90 bg-white/88 text-slate-700 hover:-translate-y-0.5 hover:border-slate-400 hover:bg-white",
                    ].join(" ")}
                  >
                    <SectionIcon className="h-4 w-4" />
                    {section.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/65 bg-white/70 p-4 shadow-[0_18px_52px_rgba(15,23,42,0.13)] backdrop-blur-xl sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold tracking-[-0.015em] text-slate-900">Zeď příspěvků</h2>
                <p className="mt-1 inline-flex items-center gap-2 text-sm text-slate-700">
                  <SelectedFilterIcon className="h-4 w-4" />
                  Sekce <strong>{currentSectionLabel}</strong>
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (user) void loadPosts(user, selectedSection);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300/80 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-500 hover:bg-white"
              >
                <RefreshCw className="h-4 w-4" />
                Obnovit
              </button>
            </div>
          </section>

          <section>
            {loadingPosts ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div
                    key={`wall-skeleton-${idx}`}
                    className="h-56 animate-pulse rounded-[28px] border border-slate-200/70 bg-white/75"
                  />
                ))}
              </div>
            ) : postsError ? (
              <div className="rounded-3xl border border-red-300/80 bg-red-50/90 px-4 py-4 text-sm text-red-700 shadow-[0_14px_34px_rgba(248,113,113,0.18)]">
                {postsError}
              </div>
            ) : posts.length === 0 ? (
              <div className="rounded-[30px] border border-slate-200/80 bg-white/80 px-6 py-10 text-center shadow-[0_20px_58px_rgba(15,23,42,0.1)] backdrop-blur-xl">
                <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-[0_12px_30px_rgba(16,185,129,0.2)]">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-2xl font-semibold text-slate-900">Tahle sekce čeká na první zprávu</h3>
                <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600 sm:text-base">
                  V sekci <strong>{currentSectionLabel}</strong> zatím nejsou žádné příspěvky. Přidej první inspiraci, tip nebo odpověď týmu.
                </p>
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => setPostModalOpen(true)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-emerald-700/70 bg-[linear-gradient(135deg,#16a34a_0%,#047857_100%)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(16,185,129,0.28)] transition hover:-translate-y-0.5"
                  >
                    <Plus className="h-4 w-4" />
                    Přidat první příspěvek
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {posts.map((post, index) => {
                  const visual = SECTION_VISUALS[post.section] ?? SECTION_VISUALS.obecne;
                  const SectionIcon = visual.icon;
                  const isDeletingThis = deletingPostId === post.id;

                  return (
                    <article
                      key={post.id}
                      className={`${styles.wallCard} relative overflow-hidden rounded-[30px] border border-white/75 bg-white/88 p-4 shadow-[0_18px_52px_rgba(15,23,42,0.14)] backdrop-blur-xl ring-1 ${visual.postAccent}`}
                      style={{ animationDelay: `${Math.min(index * 50, 240)}ms` }}
                    >
                      <div
                        className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${visual.rail}`}
                        aria-hidden="true"
                      />

                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xs font-bold shadow-inner ${visual.avatarBg}`}
                          >
                            {initialsFromName(post.author.name)}
                          </div>

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
                              <span className="truncate text-xs font-medium text-slate-600">
                                od <strong className="text-slate-800">{post.author.name}</strong>
                              </span>
                            </div>
                            <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-500">
                              <Clock3 className="h-3.5 w-3.5" />
                              {formatDateTime(post.createdAtMs)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                            {post.commentCount} komentářů
                          </span>
                          {canDeletePost(post) ? (
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
                          ) : null}
                        </div>
                      </div>

                      <h3 className="mt-4 text-xl font-bold leading-tight tracking-[-0.01em] text-slate-900">
                        {post.title}
                      </h3>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                        {post.text}
                      </p>

                      {post.attachments.length > 0 ? (
                        <div className="mt-4 rounded-2xl border border-slate-200/85 bg-slate-50/80 p-3">
                          <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">
                            <Paperclip className="h-3.5 w-3.5" />
                            Přílohy
                          </div>

                          <div className="space-y-2">
                            {post.attachments.map((attachment) => (
                              <div
                                key={attachment.id}
                                className="rounded-xl border border-slate-200 bg-white/95 p-2"
                              >
                                <a
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 underline-offset-2 hover:underline"
                                >
                                  {attachment.isImage ? (
                                    <ImageIcon className="h-3.5 w-3.5" />
                                  ) : (
                                    <Paperclip className="h-3.5 w-3.5" />
                                  )}
                                  {attachment.name}
                                </a>
                                <div className="mt-0.5 text-[11px] text-slate-500">
                                  {attachment.contentType} • {formatBytes(attachment.sizeBytes)}
                                </div>
                                {attachment.isImage ? (
                                  <a href={attachment.url} target="_blank" rel="noreferrer">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={attachment.url}
                                      alt={attachment.name}
                                      className="mt-2 max-h-80 w-full rounded-xl border border-slate-200 object-cover"
                                    />
                                  </a>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-4 rounded-2xl border border-slate-200/90 bg-[linear-gradient(150deg,rgba(248,250,252,0.95)_0%,rgba(255,255,255,0.95)_100%)] p-3">
                        <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">
                          <MessageSquare className="h-3.5 w-3.5" />
                          Komentáře
                        </div>

                        <div className="space-y-2">
                          {post.comments.length === 0 ? (
                            <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-500">
                              Zatím bez komentářů.
                            </div>
                          ) : (
                            post.comments.map((comment) => (
                              <div
                                key={comment.id}
                                className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2"
                              >
                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                  <span
                                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${visual.avatarBg}`}
                                  >
                                    {initialsFromName(comment.author.name)}
                                  </span>
                                  <span className="font-semibold text-slate-700">{comment.author.name}</span>
                                  <span>{formatDateTime(comment.createdAtMs)}</span>
                                </div>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                                  {comment.text}
                                </p>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="mt-3 space-y-2">
                          <textarea
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
                            {QUICK_EMOJIS.slice(0, 8).map((emoji) => (
                              <button
                                key={`${post.id}-${emoji}`}
                                type="button"
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

                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => void handleCreateComment(post.id)}
                              disabled={commentPostingById[post.id] || !user}
                              className="inline-flex items-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {commentPostingById[post.id] ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              )}
                              Odeslat komentář
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {postModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-3 py-4">
          <button
            type="button"
            className={`${styles.modalBackdrop} absolute inset-0 bg-slate-950/60 backdrop-blur-sm`}
            onClick={() => setPostModalOpen(false)}
            aria-label="Zavřít okno"
          />

          <div className={`${styles.modalPanel} relative z-10 w-full max-w-4xl overflow-hidden rounded-[32px] border border-white/80 bg-white/96 shadow-[0_34px_90px_rgba(2,6,23,0.48)] max-h-[92vh]`}>
            <div className="grid max-h-[92vh] overflow-y-auto lg:grid-cols-[1.1fr_0.9fr]">
              <div className="p-4 sm:p-5 lg:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-[0_12px_24px_rgba(16,185,129,0.2)]">
                      <Plus className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold tracking-[-0.01em] text-slate-900">Přidat příspěvek</h3>
                      <p className="text-xs text-slate-500">Sdílej update, otázku nebo tip.</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPostModalOpen(false)}
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

                  <label className="block space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">
                        Text
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {text.length}/{MAX_TEXT_LEN}
                      </span>
                    </div>
                    <textarea
                      value={text}
                      onChange={(event) => {
                        setText(event.target.value.slice(0, MAX_TEXT_LEN));
                        setPostError(null);
                      }}
                      placeholder="Napiš text příspěvku..."
                      rows={7}
                      className="w-full resize-y rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                    />
                  </label>

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

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">
                      <Smile className="h-3.5 w-3.5" />
                      Emoji
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(emojiOpen ? QUICK_EMOJIS : QUICK_EMOJIS.slice(0, 8)).map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => addEmojiToPost(emoji)}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm transition hover:border-slate-500 hover:bg-slate-100"
                        >
                          {emoji}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setEmojiOpen((prev) => !prev)}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-500 hover:bg-slate-100"
                      >
                        {emojiOpen ? "Méně" : "Více"}
                      </button>
                    </div>
                  </div>

                  {postError ? (
                    <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {postError}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleCreatePost}
                    disabled={posting || !user}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-700 bg-[linear-gradient(135deg,#16a34a_0%,#047857_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_42px_rgba(5,150,105,0.3)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_50px_rgba(5,150,105,0.36)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Publikovat příspěvek
                  </button>
                </div>
              </div>

              <div className="border-t border-slate-200/80 bg-[linear-gradient(160deg,#f8fafc_0%,#eef6ff_100%)] p-4 sm:p-5 lg:border-l lg:border-t-0 lg:p-6">
                <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white/85 border-slate-300">
                  <SelectedPostIcon className="h-3.5 w-3.5" />
                  {INTRANET_SECTION_LABEL_BY_KEY.get(postSection) ?? postSection}
                </div>

                <h4 className="text-sm font-semibold uppercase tracking-[0.13em] text-slate-500">Přílohy</h4>
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
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
