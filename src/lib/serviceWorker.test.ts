import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://bohemka.app";
const CACHE_NAME = "bohemika-pwa-v3";

type WorkerEvent = {
  request?: Request;
  respondWith: (response: Promise<Response>) => void;
  waitUntil: (work: Promise<unknown>) => void;
};

function worker() {
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const key = (input: string | Request) => new URL(
    typeof input === "string" ? input : input.url, ORIGIN
  ).href;
  const store = (name = CACHE_NAME) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name)!;
  };
  const fetch = vi.fn<(input: string | Request, init?: RequestInit) => Promise<Response>>()
    .mockImplementation(async () => new Response("network"));
  const caches = {
    keys: async () => [...stores.keys()],
    delete: vi.fn(async (name: string) => stores.delete(name)),
    open: vi.fn(async (name: string) => ({
      match: async (input: string | Request) => store(name).get(key(input))?.clone(),
      put: async (input: string | Request, response: Response) => {
        store(name).set(key(input), response.clone());
      },
      delete: async (input: string | Request) => store(name).delete(key(input)),
    })),
  };
  const claim = vi.fn(async () => undefined);
  runInNewContext(source, {
    URL, Response, Request, caches, fetch,
    self: {
      location: { origin: ORIGIN, hostname: "bohemka.app" },
      addEventListener: (name: string, handler: (event: WorkerEvent) => void) => handlers.set(name, handler),
      skipWaiting: vi.fn(),
      clients: { claim },
    },
  });

  function dispatch(path: string, init?: RequestInit, navigate = false) {
    const request = new Request(new URL(path, ORIGIN), init);
    if (navigate) Object.defineProperty(request, "mode", { value: "navigate" });
    let response: Promise<Response> | undefined;
    handlers.get("fetch")!({
      request,
      respondWith: (promise) => { response = promise; },
      waitUntil: () => undefined,
    });
    return { request, response };
  }
  async function request(path: string, init?: RequestInit, navigate = false) {
    const event = dispatch(path, init, navigate);
    return event.response ?? fetch(event.request);
  }
  async function lifecycle(name: "install" | "activate") {
    let pending: Promise<unknown> | undefined;
    handlers.get(name)!({
      respondWith: () => undefined,
      waitUntil: (promise) => { pending = promise; },
    });
    await pending;
  }
  return { fetch, caches, stores, store, claim, dispatch, request, lifecycle, key };
}

describe("service worker cache freshness", () => {
  it.each([
    ["/vizitka/advisor?_rsc=stable", undefined],
    ["/smlouvy", { RSC: "1" }],
    ["/icons/csb.png", { "Next-Router-Prefetch": "1" }],
    ["/_next/static/chunk.js", { "Next-Router-Segment-Prefetch": "/page" }],
    ["/vizitka/advisor", { Accept: "text/x-component" }],
  ] as const)("fetches fresh page data for %s", async (path, headers) => {
    const sw = worker();
    sw.store().set(sw.key(path), new Response("old page"));
    sw.fetch.mockResolvedValueOnce(new Response("revision 1"))
      .mockResolvedValueOnce(new Response("revision 2"));
    expect(await (await sw.request(path, { headers })).text()).toBe("revision 1");
    expect(await (await sw.request(path, { headers })).text()).toBe("revision 2");
    expect(sw.caches.open).not.toHaveBeenCalled();
  });

  it("does not cache document navigations and never restores private pages offline", async () => {
    const sw = worker();
    sw.store().set(sw.key("/smlouvy"), new Response("previous user's page"));
    sw.store().set(sw.key("/offline.html"), new Response("Offline notice"));
    sw.fetch.mockResolvedValueOnce(new Response("current page", {
      headers: { "Cache-Control": "private, no-store" },
    }));
    expect(await (await sw.request("/smlouvy", undefined, true)).text()).toBe("current page");
    expect(sw.fetch.mock.calls[0][1]?.cache).toBe("no-store");
    expect(await sw.store().get(sw.key("/smlouvy"))!.text()).toBe("previous user's page");
    sw.fetch.mockRejectedValueOnce(new Error("Offline"));
    expect(await (await sw.request("/smlouvy", undefined, true)).text()).toBe("Offline notice");
  });

  it("returns 503 offline when no offline notice was cached", async () => {
    const sw = worker();
    sw.fetch.mockRejectedValueOnce(new Error("Offline"));
    expect((await sw.request("/login", undefined, true)).status).toBe(503);
  });

  it("revalidates mutable assets online and uses the newest copy offline", async () => {
    const sw = worker();
    sw.fetch.mockResolvedValueOnce(new Response("old logo"))
      .mockResolvedValueOnce(new Response("new logo"))
      .mockRejectedValueOnce(new Error("Offline"));
    expect(await (await sw.request("/icons/csb.png")).text()).toBe("old logo");
    expect(await (await sw.request("/icons/csb.png")).text()).toBe("new logo");
    expect(await (await sw.request("/icons/csb.png")).text()).toBe("new logo");
    expect(sw.fetch.mock.calls.every(([, init]) => init?.cache === "no-cache")).toBe(true);
  });

  it("reuses immutable Next build assets", async () => {
    const sw = worker();
    const path = "/_next/static/chunks/1234.abcd.js";
    expect(await (await sw.request(path)).text()).toBe("network");
    expect(await (await sw.request(path)).text()).toBe("network");
    expect(sw.fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["public, max-age=10, no-store", 'PRIVATE="Set-Cookie"', "no-cache"])(
    "honors %s and removes previously cached copies", async (cacheControl) => {
      const sw = worker();
      const path = "/provize/conditions.pdf";
      sw.store().set(sw.key(path), new Response("old public content"));
      sw.fetch.mockResolvedValueOnce(new Response("restricted content", {
        headers: { "Cache-Control": cacheControl },
      })).mockRejectedValueOnce(new Error("Offline"));
      expect(await (await sw.request(path)).text()).toBe("restricted content");
      expect(sw.store().has(sw.key(path))).toBe(false);
      expect((await sw.request(path)).type).toBe("error");
    }
  );

  it("does not cache redirects, errors or RSC responses returned for an asset", async () => {
    const sw = worker();
    const redirect = new Response("login");
    Object.defineProperty(redirect, "redirected", { value: true });
    const responses = [redirect, new Response("missing", { status: 404 }),
      new Response("unexpected page", { headers: { "Content-Type": "text/html" } }),
      new Response("RSC", { headers: { "Content-Type": "text/x-component" } })];
    for (const response of responses) {
      sw.fetch.mockResolvedValueOnce(response);
      await sw.request("/icons/csb.png");
      expect(sw.store().size).toBe(0);
    }
  });

  it("leaves API, ordinary data requests, other origins, ranges and authenticated assets alone", () => {
    const sw = worker();
    expect(sw.dispatch("/api/contracts/list").response).toBeUndefined();
    expect(sw.dispatch("/smlouvy").response).toBeUndefined();
    expect(sw.dispatch("https://other.example/icons/csb.png").response).toBeUndefined();
    expect(sw.dispatch("/icons/csb.png", { headers: { Authorization: "Bearer test" } }).response).toBeUndefined();
    expect(sw.dispatch("/provize/conditions.pdf", { headers: { Range: "bytes=0-99" } }).response).toBeUndefined();
    expect(sw.dispatch("/icons/csb.png", { method: "POST" }).response).toBeUndefined();
    expect(sw.dispatch("/icons/csb.png", { cache: "no-store" }).response).toBeUndefined();
    expect(sw.caches.open).not.toHaveBeenCalled();
  });

  it("still returns network assets when cache storage is unavailable", async () => {
    const sw = worker();
    sw.caches.open.mockRejectedValue(new Error("Quota exceeded"));
    expect(await (await sw.request("/_next/static/chunks/hash.js")).text()).toBe("network");
    expect(await (await sw.request("/icons/csb.png")).text()).toBe("network");
  });

  it("precaches the offline notice while honoring response cache restrictions", async () => {
    const sw = worker();
    sw.fetch.mockImplementation(async (input) => new Response(String(input), {
      headers: String(input) === "/manifest.webmanifest" ? { "Cache-Control": "no-store" } : {},
    }));
    await sw.lifecycle("install");
    expect(sw.store().has(sw.key("/offline.html"))).toBe(true);
    expect(sw.store().has(sw.key("/manifest.webmanifest"))).toBe(false);
  });

  it("removes old app caches before claiming clients and keeps unrelated caches", async () => {
    const sw = worker();
    sw.store("bohemika-pwa-v1");
    sw.store("bohemika-pwa-v2").set(sw.key("/smlouvy?_rsc=old"), new Response("private old page"));
    sw.store();
    sw.store("unrelated-cache");
    await sw.lifecycle("activate");
    expect([...sw.stores.keys()]).toEqual([CACHE_NAME, "unrelated-cache"]);
    expect(sw.store().size).toBe(0);
    expect(sw.claim).toHaveBeenCalledOnce();
    expect(sw.claim.mock.invocationCallOrder[0]).toBeGreaterThan(sw.caches.delete.mock.invocationCallOrder[1]);
  });
});
