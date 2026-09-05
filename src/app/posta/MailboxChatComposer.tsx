"use client";

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import Image from "next/image";
import { FileText, ImageIcon, Loader2, Paperclip, Send, Smile, X } from "lucide-react";

import { COMPOSE_FILES_MAX_COUNT, COMPOSE_MESSAGE_MAX_LEN, QUICK_EMOJIS } from "./postaConstants";
import { formatFileSize } from "./postaHelpers";

const fileKey = (file: File) => `${file.name}-${file.size}-${file.lastModified}`;
const isImageFile = (file: File) =>
  file.type.startsWith("image/") || /\.(avif|gif|jpe?g|png|webp)$/i.test(file.name);

function LocalAttachmentThumbnail({ file }: { file: File }) {
  const [previewUrl] = useState(() =>
    isImageFile(file) && typeof URL.createObjectURL === "function"
      ? URL.createObjectURL(file)
      : ""
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <span className={`relative inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg ${isImageFile(file) ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"}`}>
      {previewUrl ? (
        <Image src={previewUrl} alt="" fill unoptimized sizes="36px" className="object-cover" />
      ) : isImageFile(file) ? (
        <ImageIcon className="h-3.5 w-3.5" />
      ) : (
        <FileText className="h-3.5 w-3.5" />
      )}
    </span>
  );
}

export function MailboxChatComposer({
  recipientName,
  text,
  files,
  submitting,
  error,
  success,
  onTextChange,
  onFilesAdded,
  onRemoveFile,
  onSend,
  onTypingChange,
}: {
  recipientName: string;
  text: string;
  files: File[];
  submitting: boolean;
  error: string | null;
  success: string | null;
  onTextChange: (value: string) => void;
  onFilesAdded: (files: File[]) => void;
  onRemoveFile: (file: File) => void;
  onSend: () => void;
  onTypingChange?: (typing: boolean) => void;
}) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const emojiRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!emojiOpen) return;
    const close = (event: PointerEvent) => {
      if (!emojiRef.current?.contains(event.target as Node)) setEmojiOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [emojiOpen]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 42), 128)}px`;
  }, [text]);

  const addFiles = (nextFiles: File[]) => {
    if (nextFiles.length === 0) return;
    onFilesAdded(nextFiles);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? text.length;
    const end = textarea?.selectionEnd ?? text.length;
    onTextChange(`${text.slice(0, start)}${emoji}${text.slice(end)}`);
    setEmojiOpen(false);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (pastedFiles.length > 0) addFiles(pastedFiles);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    addFiles(Array.from(event.dataTransfer.files));
  };

  const canSend = !submitting && (text.trim().length > 0 || files.length > 0);

  return (
    <div
      className="relative border-t border-slate-200 bg-white px-3 py-3 shadow-[0_-10px_30px_rgba(15,23,42,0.06)] sm:px-4"
      onDragEnter={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false);
      }}
      onDrop={handleDrop}
    >
      {dragActive ? (
        <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-violet-500 bg-violet-50/95 text-sm font-bold text-violet-800">
          Pusť soubory sem
        </div>
      ) : null}

      {files.length > 0 ? (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {files.map((file) => (
            <span key={fileKey(file)} className="inline-flex max-w-[240px] shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5">
              <LocalAttachmentThumbnail file={file} />
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-semibold text-slate-700">{file.name}</span>
                <span className="block text-[10px] text-slate-500">{formatFileSize(file.size)}</span>
              </span>
              <button type="button" onClick={() => onRemoveFile(file)} disabled={submitting} aria-label={`Odebrat ${file.name}`} className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-2 rounded-[22px] border border-slate-200 bg-slate-50 p-1.5 transition focus-within:border-violet-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-violet-50">
        <label className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-500 transition hover:bg-violet-100 hover:text-violet-800" title="Přidat přílohu">
          <Paperclip className="h-5 w-5" />
          <input ref={fileInputRef} type="file" multiple accept=".pdf,image/png,image/jpeg,image/gif,image/webp,image/avif" onChange={(event) => addFiles(Array.from(event.target.files ?? []))} disabled={submitting || files.length >= COMPOSE_FILES_MAX_COUNT} className="hidden" />
        </label>

        <div ref={emojiRef} className="relative shrink-0">
          <button type="button" onClick={() => setEmojiOpen((current) => !current)} disabled={submitting} aria-label="Vybrat emoji" aria-expanded={emojiOpen} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition hover:bg-violet-100 hover:text-violet-800 disabled:opacity-50">
            <Smile className="h-5 w-5" />
          </button>
          {emojiOpen ? (
            <div className="absolute bottom-full left-0 z-30 mb-2 grid w-52 grid-cols-6 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_48px_rgba(15,23,42,0.2)]">
              {QUICK_EMOJIS.map((emoji) => (
                <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} className="grid h-8 w-8 place-items-center rounded-lg text-lg hover:bg-violet-50" aria-label={`Vložit emoji ${emoji}`}>
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(event) => {
            onTextChange(event.target.value);
            onTypingChange?.(event.target.value.trim().length > 0);
          }}
          onPaste={handlePaste}
          onFocus={() => onTypingChange?.(text.trim().length > 0)}
          onBlur={() => onTypingChange?.(false)}
          onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || !canSend) return;
            event.preventDefault();
            onTypingChange?.(false);
            onSend();
          }}
          placeholder={`Napsat ${recipientName}…`}
          maxLength={COMPOSE_MESSAGE_MAX_LEN}
          rows={1}
          className="max-h-32 min-h-[40px] min-w-0 flex-1 resize-none bg-transparent px-1 py-2.5 text-sm leading-5 text-slate-900 outline-none placeholder:text-slate-400"
        />

        <button type="button" onClick={onSend} disabled={!canSend} aria-label="Odeslat zprávu" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-700 !text-white shadow-[0_8px_18px_rgba(109,40,217,0.26)] transition hover:scale-[1.03] hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-40">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>

      <div className="mt-1.5 flex min-h-4 items-center justify-between gap-3 px-2 text-[10px]">
        <span className={error ? "font-semibold text-rose-700" : success ? "font-semibold text-emerald-700" : "text-slate-400"}>
          {error || success || "Enter odešle · Shift + Enter přidá řádek · obrázek můžeš i vložit ze schránky"}
        </span>
        <span className="shrink-0 text-slate-400">{text.length}/{COMPOSE_MESSAGE_MAX_LEN}</span>
      </div>
    </div>
  );
}
