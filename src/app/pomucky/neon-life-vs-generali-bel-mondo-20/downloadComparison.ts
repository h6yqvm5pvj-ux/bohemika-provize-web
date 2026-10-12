import { auth } from "@/app/firebase-auth";
import { readAdminImpersonationState } from "@/app/lib/adminImpersonation";
import { getUserProfileCached } from "@/app/lib/userProfileCache";
import { reportAdvisorFromProfile } from "../neon-life-vs-metlife-oneguard/comparisonReportContent";
import type { ComparisonPdfSettings } from "./comparisonPdf";

function currentContext() {
  return JSON.stringify([auth.currentUser?.uid, auth.currentUser?.email, readAdminImpersonationState()?.email]);
}

export async function downloadComparison(settings: ComparisonPdfSettings) {
  const user = auth.currentUser;
  if (!user) throw new Error("Pro PDF s vizitkou se přihlas.");
  const context = currentContext();
  const assertSession = () => {
    if (context !== currentContext()) throw new Error("Přihlášení se během přípravy změnilo. Spusť stažení znovu.");
  };
  // The existing authenticated API authorizes profile access on the server.
  // No advisor profile is stored in the tool, a URL, or persistent browser storage.
  const payload = await getUserProfileCached(user, { force: true });
  assertSession();
  if (!payload.profile || payload.hasProfile === false) throw new Error("Vizitku se nepodařilo načíst. Zkontroluj svůj profil a zkus to znovu.");
  const advisor = reportAdvisorFromProfile(payload.profile, readAdminImpersonationState()?.email ?? user.email ?? "", window.location.origin);
  const { createComparisonPdf } = await import("./comparisonPdf");
  assertSession();
  const generatedAt = new Date();
  const pdf = await createComparisonPdf({ ...settings, advisor, generatedAt });
  assertSession();
  const date = generatedAt.toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
  await pdf.save(`cpp-neon-life-vs-generali-bel-mondo-20-${date}.pdf`, { returnPromise: true });
}
