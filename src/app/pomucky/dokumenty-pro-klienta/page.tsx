import Link from "next/link";
import { ArrowRight, HeartPulse } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { DocumentsHeader } from "../dokumenty/DocumentsUi";
import documentStyles from "../dokumenty/documents.module.css";
import styles from "./clientDocuments.module.css";

export default function ClientDocumentsPage() {
  return (
    <AppLayout active="tools">
      <div className={documentStyles.page}>
        <DocumentsHeader
          title="Dokumenty pro klienta"
          description="Připravte klientovi přehled, který si může odnést ze schůzky."
          kicker="Pomůcky"
          backHref="/pomucky"
          backLabel="Pomůcky"
        />
        <Link className={styles.documentLink} href="/pomucky/dokumenty-pro-klienta/pracovni-neschopnost">
          <span className={styles.documentIcon}><HeartPulse size={24} aria-hidden="true" /></span>
          <span>
            <strong>Pracovní neschopnost</strong>
            <span>Porovnejte plnění ze stávajícího pojištění a nového návrhu při různé délce neschopenky.</span>
          </span>
          <ArrowRight size={19} aria-hidden="true" />
        </Link>
      </div>
    </AppLayout>
  );
}
