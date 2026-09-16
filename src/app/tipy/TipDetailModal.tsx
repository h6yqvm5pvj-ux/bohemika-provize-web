"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { TipDialog } from "./TipDialog";
import { isTipDetailMessage } from "./tipDetailMessages";
import styles from "./tipDialogs.module.css";

export function TipDetailModal({ id, client, onClose, onChanged }: {
  id: string;
  client: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const pageHref = `/tipy/${encodeURIComponent(id)}`;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      if (!isTipDetailMessage(event.data, id)) return;
      switch (event.data.action) {
        case "busy": setBusy(event.data.busy === true); break;
        case "changed": onChanged(); break;
        case "deleted": onChanged(); onClose(); break;
        case "close": if (!busy) onClose(); break;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [id, onChanged, onClose, busy]);

  return (
    <TipDialog
      title="Detail tipu"
      subtitle={client}
      onClose={onClose}
      busy={busy}
      actions={<a href={pageHref} target="_blank" rel="noopener noreferrer" className={styles.externalLink} aria-label="Otevřít detail tipu jako stránku"><ExternalLink size={15} /><span>Otevřít jako stránku</span></a>}
    >
      {loading ? <div className={styles.frameLoading} role="status"><Loader2 size={22} className={styles.spinning} /><span>Otevírám detail tipu…</span></div> : null}
      <iframe
        ref={frameRef}
        src={`${pageHref}?embedded=1`}
        title={`Detail tipu – ${client}`}
        className={styles.frame}
        onLoad={() => setLoading(false)}
      />
    </TipDialog>
  );
}
