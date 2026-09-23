import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ load: vi.fn(), portrait: vi.fn() }));
vi.mock("@/lib/server/onlineCard", () => ({ loadOnlineCardBySlug: mocks.load, ONLINE_CARD_SLUG_RE: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ }));
vi.mock("@/lib/server/onlineCardShareImage", () => ({ onlineCardSharePortrait: mocks.portrait }));
import { GET } from "./route";
const request = (slug = "advisor") => GET(new Request("https://bohemka.app"), { params: Promise.resolve({ slug }) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue({ fullName: "Jiří Černý", title: "Pojištění a investice", location: "Kadaň a okolí", profileAvatar: "managed-avatar" });
  mocks.portrait.mockResolvedValue(null);
});
describe("public sharing image", () => {
  it("renders a 1200 × 630 PNG with Czech text when the photo is missing", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(await sharp(Buffer.from(await response.arrayBuffer())).metadata()).toMatchObject({ width: 1200, height: 630, format: "png" });
  });
  it("renders an available portrait and long profile fields", async () => {
    const png = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#123456" } }).png().toBuffer();
    mocks.portrait.mockResolvedValue(`data:image/png;base64,${png.toString("base64")}`);
    mocks.load.mockResolvedValue({ fullName: "Alexandra Anna Novotná Černá", title: "Životní pojištění, investice a hypotéky", location: "Praha a Středočeský kraj", profileAvatar: "managed-avatar" });
    const response = await request();
    expect(await sharp(Buffer.from(await response.arrayBuffer())).metadata()).toMatchObject({ width: 1200, height: 630 });
    expect(mocks.portrait).toHaveBeenCalledWith("managed-avatar");
  });
  it("does not publish missing, disabled or invalid profiles", async () => {
    mocks.load.mockResolvedValue(null);
    expect((await request()).status).toBe(404);
    expect((await request("../private")).status).toBe(404);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.portrait).not.toHaveBeenCalled();
  });
});
