import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onlineCardShareImagePath, onlineCardSharePortrait } from "./onlineCardShareImage";

vi.mock("sharp", async importOriginal => {
  const original = await importOriginal<typeof import("sharp")>();
  return {default:Object.assign(vi.fn(original.default),original.default)};
});
beforeEach(() => {vi.mocked(sharp).mockClear();vi.stubEnv("FIREBASE_STORAGE_BUCKET", "example");});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const avatar = "https://firebasestorage.googleapis.com/v0/b/example/o/profile-avatars%2Fuser-1%2Fphoto.webp?alt=media";
describe("share image assets", () => {
  it.each(["image/svg+xml", "image/webp", "application/octet-stream"])("rejects SVG bytes even with declared content type %s", async contentType => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>';
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(svg, {headers:{"content-type":contentType}})));
    expect(await onlineCardSharePortrait(avatar)).toBeNull();
    expect(sharp).not.toHaveBeenCalled();
  });
  it.each([
    "https://firebasestorage.googleapis.com/v0/b/attacker/o/profile-avatars%2Fuser-1%2Fphoto.webp?alt=media",
    "https://firebasestorage.googleapis.com/v0/b/example/o/unrelated%2Fo%2Fprofile-avatars%2Fuser-1%2Fphoto.webp?alt=media",
  ])("does not fetch another bucket or a misleading path: %s", async url => {
    const fetchMock=vi.fn(); vi.stubGlobal("fetch",fetchMock);
    expect(await onlineCardSharePortrait(url)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
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
  it.each([undefined, "20"])("stops an oversized download even with an absent or false content-length (%s)", async contentLength => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(2_000_001));
        controller.enqueue(new Uint8Array(10));
        controller.close();
      },
      cancel,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, {
      headers: contentLength ? { "content-length": contentLength } : {},
    })));
    expect(await onlineCardSharePortrait(avatar)).toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("cancels a response rejected by its declared size without consuming the body", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, {
      headers: { "content-length": "2000001" },
    })));
    expect(await onlineCardSharePortrait(avatar)).toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
