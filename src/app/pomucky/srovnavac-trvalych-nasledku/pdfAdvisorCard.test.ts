import { beforeEach, describe, expect, it, vi } from "vitest";
import { contactQr, createQrSymbol } from "../tvorba/contactQr";
import { loadPdfAdvisorCard, loadPdfAdvisorDetails } from "./pdfAdvisorCard";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as { uid: string } | null },
  impersonation: null as { email: string; startedAtMs: number } | null,
  profile: vi.fn(),
}));
vi.mock("@/app/firebase-auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/adminImpersonation", () => ({ readAdminImpersonationState: () => mocks.impersonation }));
vi.mock("@/app/lib/userProfileCache", () => ({ getUserProfileCached: mocks.profile }));

const user = { uid: "advisor-a" };
const publicCard = {
  enabled: true,
  slug: "testovaci-poradce",
  fullName: "Testovací poradce",
  title: "Finanční poradce",
  email: "kontakt@example.test",
  phone: "+420 123 456 789",
};
const profile = { email: "interni@example.test", phoneNumber: "interní kontakt", onlineCard: publicCard };

beforeEach(() => {
  mocks.auth.currentUser = user;
  mocks.impersonation = null;
  mocks.profile.mockReset();
  mocks.profile.mockResolvedValue({ profile });
});

describe("advisor card for the permanent injury PDF", () => {
  it("loads the current authorized profile and encodes its published link in the QR", async () => {
    const { advisor, assertSession } = await loadPdfAdvisorCard();
    const url = "https://bohemka.app/vizitka/testovaci-poradce";
    expect(mocks.profile).toHaveBeenCalledWith(user, { force: true });
    expect(advisor).toEqual({
      fullName: publicCard.fullName, title: publicCard.title, phone: publicCard.phone, email: publicCard.email,
      url, qr: await createQrSymbol(url),
    });
    expect(assertSession).not.toThrow();
  });

  it.each([{ enabled: false }, { slug: "../cizi" }, { fullName: "" }])("omits an unavailable card with %j", async (change) => {
    mocks.profile.mockResolvedValue({ profile: { ...profile, onlineCard: { ...publicCard, ...change } } });
    expect((await loadPdfAdvisorCard()).advisor).toBeNull();
  });

  it("does not fill missing public contacts with internal profile fields", async () => {
    mocks.profile.mockResolvedValue({ profile: { ...profile, onlineCard: { ...publicCard, email: "", phone: "" } } });
    expect((await loadPdfAdvisorCard()).advisor).toMatchObject({ email: "", phone: "" });
  });

  it("rejects unauthenticated access and keeps a rejected API response out of the PDF", async () => {
    mocks.auth.currentUser = null;
    await expect(loadPdfAdvisorCard()).rejects.toThrow("přihlas");
    expect(mocks.profile).not.toHaveBeenCalled();
    mocks.auth.currentUser = user;
    mocks.profile.mockRejectedValue(new Error("403: internal details"));
    await expect(loadPdfAdvisorCard()).rejects.toThrow("Vizitku poradce se nepodařilo načíst");
  });

  it("drops an in-flight profile response when the signed-in user changes", async () => {
    let finish!: (value: { profile: typeof profile }) => void;
    mocks.profile.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const pending = loadPdfAdvisorCard();
    mocks.auth.currentUser = { uid: "advisor-b" };
    finish({ profile });
    await expect(pending).rejects.toThrow("Přihlášení se během přípravy změnilo");
  });

  it("invalidates a prepared export when the impersonated account changes", async () => {
    const { assertSession } = await loadPdfAdvisorCard();
    mocks.impersonation = { email: "other@example.test", startedAtMs: 100 };
    expect(assertSession).toThrow("Přihlášení se během přípravy změnilo");
  });

  it("uses edited fields in the PDF with the verified link and refreshes other contact fields", async () => {
    const { assertSession } = await loadPdfAdvisorDetails();
    mocks.profile.mockResolvedValue({ profile: { onlineCard: { ...publicCard, title: "Specialista" } } });
    const { advisor } = await loadPdfAdvisorCard({ assertSession, overrides: { fullName: "Jméno pro PDF", phone: "" } });
    expect(advisor).toMatchObject({ fullName: "Jméno pro PDF", title: "Specialista", phone: "", url: "https://bohemka.app/vizitka/testovaci-poradce" });
  });

  it("can make a contact QR from explicitly entered data when the online card is disabled", async () => {
    mocks.profile.mockResolvedValue({ profile: { ...profile, onlineCard: { ...publicCard, enabled: false } } });
    const { details, assertSession } = await loadPdfAdvisorDetails();
    expect(details).toEqual({ fullName: "", title: "", phone: "", email: "" });
    const overrides = { fullName: "Jméno pro PDF", email: "kontakt-pdf@example.test" };
    const contact = contactQr({ ...details, ...overrides, jobTitle: "", companyId: "", officeAddress: "" })!;
    const { advisor } = await loadPdfAdvisorCard({ assertSession, overrides });
    expect(advisor).toMatchObject({ ...overrides, url: "", phone: "", qr: await createQrSymbol(contact.payload) });
    await expect(loadPdfAdvisorCard({ assertSession, overrides: { ...overrides, email: "neplatny" } })).rejects.toThrow("Zkontroluj e-mail");
  });

  it("does not apply contact overrides to a different account", async () => {
    const { assertSession } = await loadPdfAdvisorDetails();
    const draft = { assertSession, overrides: { fullName: "Jméno pro PDF" } };
    mocks.profile.mockClear();
    mocks.auth.currentUser = { uid: "advisor-b" };
    await expect(loadPdfAdvisorCard(draft)).rejects.toThrow("Přihlášení");
    expect(mocks.profile).not.toHaveBeenCalled();
  });
});
