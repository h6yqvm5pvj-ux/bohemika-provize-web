export type PlacedImage = {
  id: string;
  src: string;
  alt: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DocumentPage = {
  id: string;
  /** Pages created by overflow share a flow; manually added pages start a new one. */
  flowId?: string;
  html: string;
  images: PlacedImage[];
  fontSize: number;
  fontKey: string;
  fontFamily: string;
  color: string;
};

export type PdfQualityPreset = "high" | "medium" | "low";

export const PDF_QUALITY_PRESETS = {
  high: { label: "Pro tisk", helperText: "Ostřejší text a detaily obrázků, větší soubor.", renderScale: 2.5, imageQuality: 0.9 },
  medium: { label: "Vyvážená", helperText: "Doporučeno pro běžné dokumenty i odeslání e-mailem.", renderScale: 2, imageQuality: 0.78 },
  low: { label: "Malý soubor", helperText: "Silnější komprese fotografií pro snadné sdílení.", renderScale: 1.5, imageQuality: 0.62 },
} satisfies Record<PdfQualityPreset, { label: string; helperText: string; renderScale: number; imageQuality: number }>;

export function pdfFilename(title: string): string {
  const clean = title.trim().replace(/\.pdf$/i, "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/\s+/g, " ").replace(/[. ]+$/g, "").slice(0, 100);
  return `${clean || "Dokument"}.pdf`;
}

export function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} kB`
    : `${(bytes / (1024 * 1024)).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} MB`;
}

export function fittedImageSize(width: number, height: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(1, maxWidth / Math.max(1, width), maxHeight / Math.max(1, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Decode once, limit pixel count, and keep the smaller encoding. All work stays in the browser. */
export async function optimizeImage(file: File) {
  if (!/^image\/(jpeg|png|webp|gif|avif|bmp)$/i.test(file.type)) {
    throw new Error("Použij obrázek ve formátu JPG, PNG, WebP, GIF nebo AVIF.");
  }
  if (file.size > 40 * 1024 * 1024) throw new Error("Obrázek je příliš velký. Vyber soubor do 40 MB.");
  const url = URL.createObjectURL(file);
  const img = new Image();
  try {
    img.src = url;
    await img.decode();
    const size = fittedImageSize(img.naturalWidth, img.naturalHeight, 2000, 2000);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Prohlížeč nepodporuje zpracování obrázků.");
    context.drawImage(img, 0, 0, size.width, size.height);
    // WebP retains transparency for logos; JPEG is more economical for photographs.
    const format = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
    let src = canvas.toDataURL(format, 0.82);
    let bytes = Math.floor((src.length - src.indexOf(",") - 1) * 0.75);
    const resized = size.width !== img.naturalWidth || size.height !== img.naturalHeight;
    if (!resized && bytes > file.size && file.type !== "image/gif") {
      src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Obrázek se nepodařilo načíst."));
        reader.readAsDataURL(file);
      });
      bytes = file.size;
    }
    canvas.width = canvas.height = 0;
    return { src, ...size, originalBytes: file.size, bytes };
  } finally {
    URL.revokeObjectURL(url);
  }
}
