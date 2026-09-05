import { beforeEach, describe, expect, it, vi } from "vitest";

const { decode } = vi.hoisted(() => ({ decode: vi.fn() }));
vi.mock("sharp", () => ({ default: decode }));
import { prepareProfileAvatarFile } from "./profileAvatarUpload";

describe("avatar input rejected before native image decoding", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["avif", "photo.avif", "image/avif"],
    ["avis", "photo.avif", "image/avif"],
    ["heic", "photo.heic", "image/heic"],
    ["heif", "photo.heif", "image/heif"],
    ["avif", "photo.jpg", "image/jpeg"],
    ["avif", "photo", "application/octet-stream"],
  ])("does not decode ISO container %s (%s, %s)", async (brand, name, type) => {
    // Only an inert format header, never an exploit or malformed decoder input.
    const header = new Uint8Array(24);
    header[3] = 24;
    header.set(new TextEncoder().encode(`ftyp${brand}`), 4);
    const result = await prepareProfileAvatarFile(new File([header], name, { type }));
    expect(result.ok).toBe(false);
    expect(decode).not.toHaveBeenCalled();
  });
});
