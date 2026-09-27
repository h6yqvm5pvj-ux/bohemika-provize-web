import { auth } from "@/app/firebase";
import type { HomePerformanceSample, HomePerformanceStage } from "./homePerformanceProtocol";

type Reporter = { user: NonNullable<typeof auth.currentUser>; samples: HomePerformanceSample[]; timer: ReturnType<typeof setTimeout> };
let pending: Reporter | null = null;

function record(sample: HomePerformanceSample) {
  try {
    const key = "home.performance.v1";
    const previous = JSON.parse(sessionStorage.getItem(key) ?? "[]") as unknown;
    const rows = Array.isArray(previous) ? previous.slice(-59) : [];
    sessionStorage.setItem(key, JSON.stringify([...rows, sample]));
  } catch { /* Diagnostics never interrupt the page. */ }
  // Development and tests retain local timings without creating extra requests.
  if (process.env.NODE_ENV !== "production") return;
  const user = auth.currentUser;
  if (!user) return;
  if (pending?.user !== user) {
    if (pending) clearTimeout(pending.timer);
    const reporter: Reporter = { user, samples: [], timer: setTimeout(() => { void flush(reporter); }, 2_000) };
    pending = reporter;
  }
  if (pending.samples.length < 20) pending.samples.push(sample);
}

async function flush(reporter: Reporter) {
  if (pending !== reporter) return;
  pending = null;
  if (auth.currentUser !== reporter.user || document.visibilityState === "hidden") return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const token = await reporter.user.getIdToken();
    if (auth.currentUser !== reporter.user || controller.signal.aborted) return;
    await fetch("/api/home/performance", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1, samples: reporter.samples }), signal: controller.signal,
    });
  } catch { /* A failed diagnostic request must not trigger retries or UI errors. */ }
  finally { clearTimeout(timer); }
}

/** Measures data readiness, not paint time. Ignore time spent in a hidden tab. */
export function startHomeTiming(stage: HomePerformanceStage) {
  const user = auth.currentUser;
  const started = performance.now();
  let finished = false;
  let hidden = typeof document === "undefined" || document.visibilityState === "hidden";
  const onVisibility = () => { if (document.visibilityState === "hidden") hidden = true; };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
  return (outcome: HomePerformanceSample["outcome"]) => {
    if (finished) return;
    finished = true;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
    const durationMs = Math.round(performance.now() - started);
    if (auth.currentUser !== user || hidden || durationMs < 0 || durationMs > 180_000) return;
    record({ stage, durationMs, outcome, device: window.innerWidth < 768 ? "mobile" : "desktop" });
  };
}
