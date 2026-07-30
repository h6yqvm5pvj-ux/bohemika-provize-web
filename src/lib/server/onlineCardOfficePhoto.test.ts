import { describe, expect, it } from "vitest";

import {
  prepareOnlineCardOfficePhotoFile,
  sanitizeOnlineCardOfficePhotoFileName,
} from "@/lib/server/onlineCardOfficePhoto";

const pngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);

const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const webpBytes = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

function imageFile(bytes: Buffer, name: string, type: string): File {
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  const fileBytes = new Uint8Array(arrayBuffer);
  fileBytes.set(bytes);
  return new File([fileBytes], name, { type });
}

describe("online card office photo upload preparation", () => {
  it("accepts a real JPEG and normalizes its storage metadata", async () => {
    const prepared = await prepareOnlineCardOfficePhotoFile(
      imageFile(jpegBytes, "Moje kancelář.jpeg", "image/jpeg")
    );

    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      expect(prepared.photo.contentType).toBe("image/jpeg");
      expect(prepared.photo.originalName).toBe("Moje kancelář.jpeg");
      expect(prepared.photo.safeFileName).toBe("Moje-kancelar.jpeg");
      expect(prepared.photo.bytes.equals(jpegBytes)).toBe(true);
    }
  });

  it("accepts PNG and WEBP signatures", async () => {
    await expect(
      prepareOnlineCardOfficePhotoFile(
        imageFile(pngBytes, "office.png", "image/png")
      )
    ).resolves.toMatchObject({ ok: true });

    await expect(
      prepareOnlineCardOfficePhotoFile(
        imageFile(webpBytes, "office.webp", "image/webp")
      )
    ).resolves.toMatchObject({ ok: true });
  });

  it("rejects a fake image with an allowed declared content type", async () => {
    await expect(
      prepareOnlineCardOfficePhotoFile(
        imageFile(Buffer.from("not an image"), "office.png", "image/png")
      )
    ).resolves.toMatchObject({
      ok: false,
      error:
        "Podporované formáty jsou JPG, PNG a WEBP. Soubor musí tomuto formátu skutečně odpovídat.",
    });
  });

  it("rejects mismatched image metadata", async () => {
    await expect(
      prepareOnlineCardOfficePhotoFile(
        imageFile(pngBytes, "office.jpg", "image/jpeg")
      )
    ).resolves.toMatchObject({ ok: false });
  });

  it("rejects image types outside the office-photo allowlist", async () => {
    const gifBytes = Buffer.from("GIF89a", "latin1");

    await expect(
      prepareOnlineCardOfficePhotoFile(
        imageFile(gifBytes, "office.gif", "image/gif")
      )
    ).resolves.toMatchObject({ ok: false });
  });

  it("adds a canonical extension when the file name has none", () => {
    expect(
      sanitizeOnlineCardOfficePhotoFileName({
        originalName: "kancelar",
        contentType: "image/webp",
      })
    ).toBe("kancelar.webp");
  });
});
