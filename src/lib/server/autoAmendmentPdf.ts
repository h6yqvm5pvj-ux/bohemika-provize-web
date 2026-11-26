/** Parse untrusted amendments without evaluation; reject executable content and embedded files. */
export async function validateAutoAmendmentPdf(file: File): Promise<void> {
  if (file.size <= 0 || file.size > 12 * 1024 * 1024 || !/\.pdf$/i.test(file.name) ||
    !["", "application/pdf", "application/x-pdf"].includes(file.type.toLowerCase())) throw new Error("Invalid PDF");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!new TextDecoder("latin1").decode(bytes.slice(0, 1024)).includes("%PDF-")) throw new Error("Invalid PDF");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, enableXfa: false, verbosity: 0 });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        const document = await task.promise;
        if (document.numPages > 100 || document.isPureXfa || await document.hasJSActions() || Object.keys(await document.getAttachments() ?? {}).length) throw new Error("Unsafe PDF");
        const action = await document.getOpenAction();
        if (action && "action" in action) throw new Error("Unsafe PDF action");
        for (let index = 1; index <= document.numPages; index++) {
          const page = await document.getPage(index);
          if (Object.keys(await page.getJSActions() ?? {}).length) throw new Error("Unsafe PDF page");
          const annotations = await page.getAnnotations();
          if (annotations.some(annotation => annotation.file || annotation.actions || annotation.action || annotation.unsafeUrl && !/^https?:\/\//i.test(annotation.unsafeUrl))) throw new Error("Unsafe PDF annotation");
          page.cleanup();
        }
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("PDF validation timeout")), 10_000); }),
    ]);
  } finally {
    clearTimeout(timer);
    await task.destroy();
  }
}
