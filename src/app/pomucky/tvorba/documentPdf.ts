import { PDF_QUALITY_PRESETS, type DocumentPage, type PdfQualityPreset } from "./documentModel";
import { createQrSymbol, type ContactQr } from "./contactQr";

type ExportOptions = {
  source: HTMLElement;
  pages: DocumentPage[];
  title: string;
  author: string;
  quality: PdfQualityPreset;
  password?: string;
  contact?: ContactQr | null;
  onProgress: (done: number, total: number) => void;
};

export function preparePage(source: HTMLElement, page: DocumentPage, index: number, count: number) {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.style.transform = "none";
  clone.style.margin = "0";
  clone.style.boxShadow = "none";
  clone.querySelectorAll("[data-export-ignore]").forEach(node => node.remove());
  clone.querySelectorAll<HTMLElement>("[contenteditable]").forEach(node => {
    node.removeAttribute("contenteditable");
    node.style.caretColor = "transparent";
  });
  const editor = clone.querySelector<HTMLElement>("[data-editor-frame]");
  if (!editor) throw new Error("Chybí obsah stránky.");
  editor.innerHTML = page.html;
  Object.assign(editor.style, {
    fontSize: `${page.fontSize}px`, fontFamily: page.fontFamily, color: page.color,
    borderColor: "transparent", outline: "none", overflow: "hidden",
  });
  const layer = clone.querySelector<HTMLElement>("[data-image-layer]");
  if (layer) {
    layer.replaceChildren();
    page.images.forEach(image => {
      const img = document.createElement("img");
      img.src = image.src;
      img.alt = image.alt;
      Object.assign(img.style, {
        position: "absolute", left: `${image.x}px`, top: `${image.y}px`,
        width: `${image.width}px`, height: `${image.height}px`, objectFit: "contain",
      });
      layer.append(img);
    });
  }
  const pageNumber = clone.querySelector("[data-page-number]");
  if (pageNumber) pageNumber.textContent = `${index + 1} / ${count}`;
  return clone;
}

export async function createDocumentPdf({ source, pages, title, author, quality, password, contact, onProgress }: ExportOptions): Promise<Blob> {
  const template = source.cloneNode(true) as HTMLElement;
  const [{ default: capture }, { jsPDF }, qr] = await Promise.all([
    import("html2canvas-pro"), import("jspdf"), contact ? createQrSymbol(contact.payload) : Promise.resolve(null),
  ]);
  await document.fonts.ready;
  const pdf = new jsPDF({
    unit: "mm", format: "a4", orientation: "portrait", compress: true,
    ...(password ? { encryption: { userPassword: password, ownerPassword: password, userPermissions: ["print", "modify", "copy", "annot-forms"] as ("print" | "modify" | "copy" | "annot-forms")[] } } : {}),
  });
  pdf.setProperties({ title, author, creator: "Bohemika · Tvorba PDF" });
  const config = PDF_QUALITY_PRESETS[quality];
  const wrapper = document.createElement("div");
  wrapper.setAttribute("aria-hidden", "true");
  Object.assign(wrapper.style, { position: "fixed", left: "-12000px", top: "0", width: "210mm", pointerEvents: "none" });
  document.body.append(wrapper);
  try {
    for (const [index, page] of pages.entries()) {
      onProgress(index, pages.length);
      const clone = preparePage(template, page, index, pages.length);
      wrapper.replaceChildren(clone);
      await Promise.all(Array.from(clone.querySelectorAll("img")).map(async img => {
        try { await img.decode(); } catch { throw new Error(`Obrázek na straně ${index + 1} se nepodařilo načíst. Zkus jej vložit znovu.`); }
      }));
      const editor = clone.querySelector<HTMLElement>("[data-editor-frame]")!;
      if (editor.scrollHeight > editor.clientHeight + 2 || editor.scrollWidth > editor.clientWidth + 2) {
        throw new Error(`Text na straně ${index + 1} přesahuje formát A4. Přesuň část textu na další stranu nebo zmenši písmo.`);
      }
      const footer = clone.querySelector("footer");
      if (footer && footer.getBoundingClientRect().top < editor.getBoundingClientRect().bottom) {
        throw new Error("Vizitka je příliš vysoká a zasahuje do textu. Zkrať prosím údaje v nastavení vizitky.");
      }
      const qrElement = clone.querySelector<HTMLElement>("[data-contact-qr]");
      if (qr && !qrElement) throw new Error("V dokumentu chybí místo pro QR kód. Zkus export znovu.");
      const qrRect = qrElement?.getBoundingClientRect();
      const pageRect = clone.getBoundingClientRect();
      // The page is compressed as JPEG, but the QR is drawn separately as crisp vectors.
      if (qrElement) qrElement.style.visibility = "hidden";
      const canvas = await capture(clone, {
        scale: config.renderScale, backgroundColor: "#ffffff", useCORS: true, logging: false,
        width: clone.offsetWidth, height: clone.offsetHeight, windowWidth: 1200, windowHeight: 1200,
        scrollX: 0, scrollY: 0,
      });
      if (index) pdf.addPage();
      // JPEG quality is applied here, not only in a wrapper's unused image option.
      pdf.addImage(canvas.toDataURL("image/jpeg", config.imageQuality), "JPEG", 0, 0, 210, 297, undefined, "FAST");
      canvas.width = canvas.height = 0;
      if (qr && qrRect) {
        const x = (qrRect.left - pageRect.left) / pageRect.width * 210;
        const y = (qrRect.top - pageRect.top) / pageRect.height * 297;
        const width = qrRect.width / pageRect.width * 210;
        const height = qrRect.height / pageRect.height * 297;
        pdf.setFillColor("#ffffff");
        pdf.rect(x, y, width, height, "F");
        pdf.setFillColor("#102d40");
        for (const run of qr.runs) {
          pdf.rect(x + run.x * width / qr.size, y + run.y * height / qr.size, run.width * width / qr.size, height / qr.size, "F");
        }
        if (contact?.href) pdf.link(x, y, width, height, { url: contact.href });
      }
      onProgress(index + 1, pages.length);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    return pdf.output("blob");
  } finally {
    wrapper.remove();
  }
}

export function downloadPdfUrl(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}
