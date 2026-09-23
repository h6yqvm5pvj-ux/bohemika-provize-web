import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { onlineCardShareImagePath, onlineCardSharePortrait } from "./onlineCardShareImage";

afterEach(() => vi.unstubAllGlobals());
const avatar = "https://firebasestorage.googleapis.com/v0/b/example/o/profile-avatars%2Fphoto.webp?alt=media";
describe("share image assets", () => {
  it("refreshes the image URL when public profile content changes", () => {
    const card = { fullName: "Jan Novák", title: "Poradce", bio: "Pojištění a investice", location: "Praha", profileAvatar: avatar };
    const before = onlineCardShareImagePath("jan-novak", card);
    expect(onlineCardShareImagePath("jan-novak", { ...card })).toBe(before);
    for (const key of ["fullName", "title", "bio", "location", "profileAvatar"] as const) {
      expect(onlineCardShareImagePath("jan-novak", { ...card, [key]: "changed" })).not.toBe(before);
    }
  });
  it("does not fetch arbitrary external or private image addresses", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    for (const url of ["", "http://127.0.0.1/private", "https://example.com/photo.png", "https://firebasestorage.googleapis.com/v0/b/example/o/private%2Ffile?alt=media"]) {
      expect(await onlineCardSharePortrait(url)).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("decodes a managed WebP photo and falls back when it cannot be read", async () => {
    const webp = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#345678" } }).webp().toBuffer();
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array(webp)));
    vi.stubGlobal("fetch", fetchMock);
    const portrait = await onlineCardSharePortrait(avatar);
    expect(portrait).toMatch(/^data:image\/png;base64,/);
    expect(fetchMock.mock.calls[0][1].redirect).toBe("error");
    fetchMock.mockRejectedValueOnce(new Error("Unavailable"));
    expect(await onlineCardSharePortrait(avatar)).toBeNull();
  });
});
