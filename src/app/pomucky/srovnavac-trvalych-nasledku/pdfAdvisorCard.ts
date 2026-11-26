import { auth } from "@/app/firebase-auth";
import { readAdminImpersonationState } from "@/app/lib/adminImpersonation";
import { getUserProfileCached } from "@/app/lib/userProfileCache";
import { contactQr, createQrSymbol, onlineCardUrl, type QrSymbol } from "../tvorba/contactQr";

export type PdfAdvisorDetails = {
  fullName: string;
  title: string;
  phone: string;
  email: string;
};

export type PdfAdvisorCard = PdfAdvisorDetails & {
  url: string;
  qr: QrSymbol;
};

export type PdfAdvisorDraft = { overrides: Partial<PdfAdvisorDetails>; assertSession: () => void };

export class PdfAdvisorCardError extends Error {}

const publicCardOrigin = "https://bohemka.app";
const text = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";

export async function loadPdfAdvisorDetails() {
  const user = auth.currentUser;
  if (!user) throw new PdfAdvisorCardError("Pro přípravu klientského PDF se přihlas.");

  const impersonation = readAdminImpersonationState();
  const assertSession = () => {
    const current = readAdminImpersonationState();
    if (auth.currentUser !== user || current?.email !== impersonation?.email || current?.startedAtMs !== impersonation?.startedAtMs) {
      throw new PdfAdvisorCardError("Přihlášení se během přípravy změnilo. Otevři export znovu.");
    }
  };

  try {
    const { profile, hasProfile } = await getUserProfileCached(user, { force: true });
    assertSession();
    const onlineCard = profile?.onlineCard;
    const card = hasProfile !== false && onlineCard && typeof onlineCard === "object" && !Array.isArray(onlineCard)
      ? onlineCard as Record<string, unknown>
      : {};
    const slug = card.slug;
    const fullName = text(card.fullName, 120);
    const isPublic = card.enabled === true && Boolean(fullName) && typeof slug === "string" &&
      slug.length >= 3 && slug.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
    const details: PdfAdvisorDetails = {
      fullName: isPublic ? fullName : "",
      title: isPublic ? text(card.title, 120) : "",
      phone: isPublic ? text(card.phone, 80) : "",
      email: isPublic ? text(card.email, 160) : "",
    };
    return { details, url: isPublic ? onlineCardUrl({ onlineCard: card }, publicCardOrigin) : "", assertSession };
  } catch {
    assertSession();
    throw new PdfAdvisorCardError("Vizitku poradce se nepodařilo načíst. Zkus to znovu.");
  }
}

export async function createPdfAdvisorCard(source: PdfAdvisorDetails, url: string): Promise<PdfAdvisorCard | null> {
  const fullName = text(source.fullName, 120);
  const title = text(source.title, 120);
  const phone = text(source.phone, 80);
  const email = text(source.email, 160);
  if (!fullName && !title && !phone && !email) return null;
  if (!fullName) throw new PdfAdvisorCardError("Doplň jméno do vizitky poradce.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PdfAdvisorCardError("Zkontroluj e-mail ve vizitce poradce.");

  const contact = contactQr({ fullName, jobTitle: title, phone, email, companyId: "", officeAddress: "" }, url);
  if (!contact) return null;
  const qr = await createQrSymbol(contact.payload);
  return { fullName, title, phone, email, url, qr };
}

export async function loadPdfAdvisorCard(draft?: PdfAdvisorDraft | null) {
  draft?.assertSession();
  const { details, url, assertSession } = await loadPdfAdvisorDetails();
  draft?.assertSession();
  const advisor = await createPdfAdvisorCard({ ...details, ...draft?.overrides }, url);
  assertSession();
  return { advisor, assertSession };
}
