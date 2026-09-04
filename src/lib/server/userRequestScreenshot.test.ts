import { describe, expect, it } from "vitest";

import {
  USER_REQUEST_SCREENSHOT_MAX_FILES,
  normalizeStoredUserRequestScreenshot,
  normalizeStoredUserRequestScreenshots,
  prepareUserRequestScreenshotFile,
  sanitizeUserRequestScreenshotName,
  toPublicUserRequestScreenshot,
} from "./userRequestScreenshot";

const pngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

describe("user request screenshots", () => {
  it("accepts a real PNG and sanitizes its name", async () => {
    const result = await prepareUserRequestScreenshotFile(
      new File([pngBytes], "Snímek obrazovky.png", { type: "image/png" })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.screenshot.originalName).toBe("Snimek-obrazovky.png");
    expect(result.screenshot.contentType).toBe("image/png");
    expect(result.screenshot.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a renamed non-image", async () => {
    const result = await prepareUserRequestScreenshotFile(
      new File(["not an image"], "fake.jpg", { type: "image/jpeg" })
    );
    expect(result).toMatchObject({ ok: false });
  });

  it("never exposes the storage location in the public payload", () => {
    const stored = normalizeStoredUserRequestScreenshot({
      kind: "userRequestScreenshot",
      id: "screen-1",
      bucketName: "private.appspot.com",
      storagePath: "private/path/screenshot.jpg",
      originalName: sanitizeUserRequestScreenshotName({
        fileName: "screen.jpeg",
        contentType: "image/jpeg",
      }),
      contentType: "image/jpeg",
      sizeBytes: 1234,
      sha256: "a".repeat(64),
      uploadedAtMs: 123456,
      uploadedBy: "user@example.com",
    });

    expect(stored).not.toBeNull();
    expect(toPublicUserRequestScreenshot(stored)).not.toHaveProperty("storagePath");
    expect(toPublicUserRequestScreenshot(stored)).not.toHaveProperty("bucketName");
  });

  it("keeps at most four valid screenshots", () => {
    const screenshots = normalizeStoredUserRequestScreenshots(
      Array.from({ length: 6 }, (_, index) => ({
        kind: "userRequestScreenshot",
        id: `screen-${index}`,
        bucketName: "private.appspot.com",
        storagePath: `private/path/screen-${index}.png`,
        originalName: `screen-${index}.png`,
        contentType: "image/png",
        sizeBytes: 1234,
        sha256: String(index).repeat(64),
        uploadedAtMs: 123456 + index,
        uploadedBy: "user@example.com",
      }))
    );

    expect(screenshots).toHaveLength(USER_REQUEST_SCREENSHOT_MAX_FILES);
  });
});
