// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as { uid: string; email: string } | null },
  impersonation: { email: "" }, profile: vi.fn(), create: vi.fn(), save: vi.fn(),
}));
vi.mock("@/app/firebase-auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/adminImpersonation", () => ({ readAdminImpersonationState: () => mocks.impersonation.email ? { email: mocks.impersonation.email } : null }));
vi.mock("@/app/lib/userProfileCache", () => ({ getUserProfileCached: mocks.profile }));
vi.mock("./comparisonPdf", () => ({ createComparisonPdf: mocks.create }));
import { downloadComparison } from "./downloadComparison";

const userA = { uid: "advisor-a", email: "a@example.test" }, userB = { uid: "advisor-b", email: "b@example.test" };
const settings = { selectedIds: ["U01"], insuredSum: 1_000_000, percent: 50 };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.currentUser = userA; mocks.impersonation.email = "";
  mocks.profile.mockResolvedValue({ hasProfile: true, profile: { fullName: "Poradce A", onlineCard: { enabled: false, slug: "unpublished-card" } } });
  mocks.save.mockResolvedValue(undefined); mocks.create.mockResolvedValue({ save: mocks.save });
});

describe("stažení s vizitkou aktuálního poradce", () => {
  it("nepřihlášený uživatel nevyžádá profil ani PDF", async () => {
    mocks.auth.currentUser = null;
    await expect(downloadComparison(settings)).rejects.toThrow("přihlas");
    expect(mocks.profile).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("použije autorizované načtení profilu a nezveřejní vypnutou online vizitku", async () => {
    await downloadComparison(settings);
    expect(mocks.profile).toHaveBeenCalledWith(userA, { force: true });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ ...settings, advisor: expect.objectContaining({ fullName: "Poradce A", cardUrl: "" }) }));
    expect(mocks.save).toHaveBeenCalledWith(expect.stringMatching(/^cpp-neon-life-vs-generali-bel-mondo-20-\d{4}-\d{2}-\d{2}\.pdf$/), { returnPromise: true });
  });
  it("při odmítnutém nebo chybějícím profilu neexportuje vizitku", async () => {
    mocks.profile.mockRejectedValueOnce(new Error("unauthorized"));
    await expect(downloadComparison(settings)).rejects.toThrow();
    mocks.profile.mockResolvedValueOnce({ hasProfile: false });
    await expect(downloadComparison(settings)).rejects.toThrow("Vizitku");
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each(["logout", "user-switch", "impersonation"])("při změně %s během načítání nevloží profil A do exportu B", async (change) => {
    const pending = deferred<{ profile: { fullName: string } }>(); mocks.profile.mockReturnValueOnce(pending.promise);
    const download = downloadComparison(settings); const assertion = expect(download).rejects.toThrow("Přihlášení");
    if (change === "logout") mocks.auth.currentUser = null;
    if (change === "user-switch") mocks.auth.currentUser = userB;
    if (change === "impersonation") mocks.impersonation.email = userB.email;
    pending.resolve({ profile: { fullName: "Poradce A" } }); await assertion;
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("zastaví uložení, když se účet změní při generování PDF", async () => {
    const pending = deferred<{ save: typeof mocks.save }>(); mocks.create.mockReturnValueOnce(pending.promise);
    const download = downloadComparison(settings); const assertion = expect(download).rejects.toThrow("Přihlášení");
    await vi.waitFor(() => expect(mocks.create).toHaveBeenCalled());
    mocks.auth.currentUser = userB; pending.resolve({ save: mocks.save }); await assertion;
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
