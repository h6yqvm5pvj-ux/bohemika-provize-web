"use client";

import { type ReactNode, useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { PdfDocumentPreview } from "@/components/PdfDocumentPreview";
import styles from "./documents.module.css";

export function DocumentAttachmentPreview({ blob, url, loading, error, isImage, contentType, title }: {
  blob: Blob | null;
  url: string | null;
  loading: boolean;
  error: string | null;
  isImage: boolean;
  contentType: string;
  title: string;
}) {
  const [pdf, setPdf] = useState<{ blob: Blob; data: Uint8Array } | null>(null);
  const [readError, setReadError] = useState<Blob | null>(null);
  const isPdf = contentType === "application/pdf";

  useEffect(() => {
    let cancelled = false;
    if (blob && isPdf) {
      void blob.arrayBuffer()
        .then(buffer => {
          if (!cancelled) setPdf({ blob, data: new Uint8Array(buffer) });
        })
        .catch(() => {
          if (!cancelled) setReadError(blob);
        });
    }
    return () => { cancelled = true; };
  }, [blob, isPdf]);

  let content: ReactNode;
  if (error || (blob && readError === blob)) {
    content = <p className={styles.error} role="alert">
      {error || "Náhled se nepodařilo připravit. Přílohu můžeš stáhnout."}
    </p>;
  } else if (loading || (isPdf && (!pdf || pdf.blob !== blob))) {
    content = <div className={styles.attachmentLoading} role="status">
      <Loader2 size={20} className="animate-spin" aria-hidden="true" />Načítám náhled dokumentu…
    </div>;
  } else if (isPdf && pdf) {
    content = <PdfDocumentPreview pdfData={pdf.data} name={title} />;
  } else if (isImage && url) {
    // eslint-disable-next-line @next/next/no-img-element
    content = <img src={url} alt={title} className={styles.attachmentImage} />;
  } else {
    content = <div className={styles.attachmentLoading}>
      <FileText size={25} aria-hidden="true" />Přílohu si můžeš stáhnout tlačítkem nahoře.
    </div>;
  }

  return <section className={styles.attachment} aria-label="Náhled přílohy">{content}</section>;
}
