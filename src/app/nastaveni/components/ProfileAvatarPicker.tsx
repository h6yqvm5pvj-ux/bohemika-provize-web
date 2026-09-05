"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  ImagePlus,
  Loader2,
  Move,
  RotateCcw,
  Search,
  X,
} from "lucide-react";

import { ProfileAvatar } from "@/components/ProfileAvatar";

type ProfileAvatarPickerProps = {
  value: string;
  displayName: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onUpload: (file: File) => Promise<void>;
};

type CropDraft = {
  image: HTMLImageElement;
  zoom: number;
  offsetX: number;
  offsetY: number;
};

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const OUTPUT_SIZE = 512;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function drawCrop(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  zoom: number,
  offsetX: number,
  offsetY: number
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const safeZoom = Math.max(1, Math.min(2.5, zoom));
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight) / safeZoom;
  const maxOffsetX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
  const maxOffsetY = Math.max(0, (image.naturalHeight - sourceSize) / 2);
  const sourceX =
    (image.naturalWidth - sourceSize) / 2 +
    (Math.max(-100, Math.min(100, offsetX)) / 100) * maxOffsetX;
  const sourceY =
    (image.naturalHeight - sourceSize) / 2 +
    (Math.max(-100, Math.min(100, offsetY)) / 100) * maxOffsetY;

  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE
  );
}

function canvasFile(canvas: HTMLCanvasElement): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Výřez fotografie se nepodařilo vytvořit."));
          return;
        }
        resolve(new File([blob], "profilova-fotografie.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.94
    );
  });
}

export function ProfileAvatarPicker({
  value,
  displayName,
  disabled,
  onChange,
  onUpload,
}: ProfileAvatarPickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropUrlRef = useRef("");
  const [uploading, setUploading] = useState(false);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [cropDraft, setCropDraft] = useState<CropDraft | null>(null);
  const [error, setError] = useState("");

  const releaseCropUrl = useCallback(() => {
    if (!cropUrlRef.current) return;
    URL.revokeObjectURL(cropUrlRef.current);
    cropUrlRef.current = "";
  }, []);

  const closeEditor = useCallback(() => {
    if (uploading) return;
    setCropDraft(null);
    setLoadingEditor(false);
    releaseCropUrl();
  }, [releaseCropUrl, uploading]);

  useEffect(() => {
    if (!cropDraft || !previewCanvasRef.current) return;
    drawCrop(
      previewCanvasRef.current,
      cropDraft.image,
      cropDraft.zoom,
      cropDraft.offsetX,
      cropDraft.offsetY
    );
  }, [cropDraft]);

  useEffect(() => {
    if (!cropDraft) return;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !uploading) closeEditor();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [closeEditor, cropDraft, uploading]);

  useEffect(
    () => () => {
      if (cropUrlRef.current) URL.revokeObjectURL(cropUrlRef.current);
    },
    []
  );

  const openEditor = (file: File | null) => {
    if (!file || disabled || uploading) return;
    setError("");
    if (!ACCEPTED_TYPES.has(file.type)) {
      setError("Vyber fotografii ve formátu JPG, PNG nebo WEBP.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Fotografie je příliš velká. Maximum je 8 MB.");
      return;
    }

    releaseCropUrl();
    setLoadingEditor(true);
    const objectUrl = URL.createObjectURL(file);
    cropUrlRef.current = objectUrl;
    const image = new window.Image();
    image.onload = () => {
      if (cropUrlRef.current !== objectUrl) return;
      setCropDraft({ image, zoom: 1, offsetX: 0, offsetY: 0 });
      setLoadingEditor(false);
    };
    image.onerror = () => {
      if (cropUrlRef.current !== objectUrl) return;
      setLoadingEditor(false);
      setError("Fotografii se nepodařilo otevřít. Zkus jiný soubor.");
      releaseCropUrl();
    };
    image.src = objectUrl;
    if (inputRef.current) inputRef.current.value = "";
  };

  const confirmCrop = async () => {
    if (!cropDraft || uploading) return;
    setUploading(true);
    setError("");
    try {
      const output = document.createElement("canvas");
      drawCrop(
        output,
        cropDraft.image,
        cropDraft.zoom,
        cropDraft.offsetX,
        cropDraft.offsetY
      );
      const file = await canvasFile(output);
      await onUpload(file);
      setCropDraft(null);
      releaseCropUrl();
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message.trim()
          ? cause.message
          : "Fotografii se nepodařilo nahrát."
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <section className="relative overflow-hidden rounded-[22px] border border-violet-200/80 bg-[linear-gradient(145deg,#ffffff_0%,#faf5ff_100%)] p-4 shadow-[0_12px_34px_rgba(76,29,149,0.08)] sm:p-5">
      <div
        className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full bg-violet-200/45 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.17em] text-violet-700">
              <Camera size={13} strokeWidth={2.2} aria-hidden="true" />
              Profilová fotografie
            </div>
            <h3 className="mt-1.5 text-base font-black text-slate-950">
              {value ? "Vlastní fotografie" : "Výchozí avatar"}
            </h3>
          </div>
          <span className="rounded-full border border-violet-100 bg-white/80 px-2.5 py-1 text-[10px] font-bold text-slate-500">
            max. 8 MB
          </span>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <div className="relative shrink-0">
            <ProfileAvatar
              src={value}
              name={displayName}
              className="h-20 w-20 rounded-[24px] border-[3px] border-white text-[5rem] shadow-[0_14px_32px_rgba(76,29,149,0.22)] ring-1 ring-violet-200"
              sizes="80px"
            />
            <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-xl border-2 border-white bg-violet-700 text-white shadow-lg">
              <Camera size={12} strokeWidth={2.4} aria-hidden="true" />
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs leading-relaxed text-slate-500">
              Zobrazí se v týmu, poště, na intranetu a u tvého účtu.
            </p>
            <p className="mt-1 text-[10px] font-semibold text-slate-400">
              JPG, PNG nebo WEBP · vlastní výřez
            </p>
          </div>
        </div>

        <div className={`mt-4 grid gap-2 ${value ? "grid-cols-2" : "grid-cols-1"}`}>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading || loadingEditor}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-violet-700 bg-violet-700 px-3 text-xs font-bold text-white shadow-[0_10px_22px_rgba(109,40,217,0.20)] transition hover:-translate-y-0.5 hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {loadingEditor ? (
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
            ) : (
              <ImagePlus size={15} aria-hidden="true" />
            )}
            {loadingEditor ? "Otevírám…" : value ? "Změnit" : "Nahrát fotografii"}
          </button>

          {value ? (
            <button
              type="button"
              onClick={() => {
                setError("");
                onChange("");
              }}
              disabled={disabled || uploading}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800 disabled:opacity-50"
            >
              <RotateCcw size={14} aria-hidden="true" />
              Výchozí
            </button>
          ) : null}
        </div>

        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => openEditor(event.target.files?.[0] ?? null)}
          disabled={disabled || uploading}
        />

        {error && !cropDraft ? (
          <p
            className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
      </section>

      {cropDraft ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/75 backdrop-blur-md"
            onClick={closeEditor}
            aria-label="Zavřít editor fotografie"
            disabled={uploading}
          />
          <div
            className="relative z-10 max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-white/80 bg-white shadow-[0_36px_120px_rgba(2,6,23,0.55)] sm:rounded-[34px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-photo-editor-title"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-violet-700">
                  Profilová fotografie
                </p>
                <h3 id="profile-photo-editor-title" className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">
                  Nastav výřez fotografie
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Uprav přiblížení a posun. Náhled odpovídá výslednému obrázku.
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                disabled={uploading}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-white hover:text-slate-950 disabled:opacity-50"
                aria-label="Zavřít editor fotografie"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="grid gap-5 p-4 sm:p-6 md:grid-cols-[minmax(260px,1fr)_minmax(250px,0.85fr)] md:items-center">
              <div className="mx-auto w-full max-w-[380px]">
                <div className="relative aspect-square overflow-hidden rounded-[30px] bg-[linear-gradient(135deg,#ede9fe_0%,#f8fafc_50%,#ddd6fe_100%)] shadow-inner ring-1 ring-violet-200">
                  <canvas
                    ref={previewCanvasRef}
                    className="h-full w-full"
                    aria-label="Náhled oříznuté profilové fotografie"
                  />
                  <div className="pointer-events-none absolute inset-3 rounded-[23px] border border-dashed border-white/75 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.12)]" />
                </div>
                <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Výsledný čtvercový výřez
                </p>
              </div>

              <div className="space-y-5 rounded-[22px] border border-slate-200 bg-slate-50 p-4 sm:p-5">
                <label className="block">
                  <span className="mb-2 flex items-center justify-between gap-3 text-xs font-bold text-slate-700">
                    <span className="inline-flex items-center gap-2">
                      <Search size={14} className="text-violet-700" aria-hidden="true" />
                      Přiblížení
                    </span>
                    <span className="text-violet-700">{cropDraft.zoom.toFixed(1)}×</span>
                  </span>
                  <input
                    type="range"
                    min="1"
                    max="2.5"
                    step="0.05"
                    value={cropDraft.zoom}
                    onChange={(event) =>
                      setCropDraft((current) =>
                        current ? { ...current, zoom: Number(event.target.value) } : current
                      )
                    }
                    className="w-full accent-violet-700"
                    disabled={uploading}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                    <Move size={14} className="text-violet-700" aria-hidden="true" />
                    Posun do stran
                  </span>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    step="1"
                    value={cropDraft.offsetX}
                    onChange={(event) =>
                      setCropDraft((current) =>
                        current ? { ...current, offsetX: Number(event.target.value) } : current
                      )
                    }
                    className="w-full accent-violet-700"
                    disabled={uploading}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                    <Move size={14} className="rotate-90 text-violet-700" aria-hidden="true" />
                    Posun nahoru a dolů
                  </span>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    step="1"
                    value={cropDraft.offsetY}
                    onChange={(event) =>
                      setCropDraft((current) =>
                        current ? { ...current, offsetY: Number(event.target.value) } : current
                      )
                    }
                    className="w-full accent-violet-700"
                    disabled={uploading}
                  />
                </label>

                <button
                  type="button"
                  onClick={() =>
                    setCropDraft((current) =>
                      current
                        ? { ...current, zoom: 1, offsetX: 0, offsetY: 0 }
                        : current
                    )
                  }
                  disabled={uploading}
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:border-violet-200 hover:text-violet-800 disabled:opacity-50"
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  Vycentrovat výřez
                </button>
              </div>
            </div>

            {error ? (
              <p className="mx-4 mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 sm:mx-6" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button
                type="button"
                onClick={closeEditor}
                disabled={uploading}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={() => void confirmCrop()}
                disabled={uploading}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-violet-700 bg-violet-700 px-5 text-xs font-bold text-white shadow-[0_12px_26px_rgba(109,40,217,0.24)] transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uploading ? (
                  <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Check size={15} strokeWidth={2.4} aria-hidden="true" />
                )}
                {uploading ? "Nahrávám…" : "Použít fotografii"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
