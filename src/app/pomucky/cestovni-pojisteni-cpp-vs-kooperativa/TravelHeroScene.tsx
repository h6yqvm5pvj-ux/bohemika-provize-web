"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TravelScene } from "./travelSceneRenderer";
import styles from "./travelScene.module.css";

function StaticIsland() {
  return <svg className={styles.fallback} viewBox="0 0 400 250" fill="none" aria-hidden="true">
    <ellipse cx="190" cy="191" rx="142" ry="36" fill="#228f9d" />
    <ellipse cx="186" cy="185" rx="97" ry="24" fill="#7bbfb6" />
    <path d="M113 183c5-20 29-28 70-27 42 0 70 12 77 29-27 24-120 26-147-2Z" fill="#eddbb4" />
    <path d="M168 175c-2-29-5-58-18-85M201 173c8-20 13-37 12-55" stroke="#c7ac80" strokeWidth="9" strokeLinecap="round" />
    <path d="M151 92c-31-24-55-9-68 14 28-12 48-9 68-14Zm0 0c-3-33-23-44-49-44 17 19 29 31 49 44Zm0 0c14-37 32-44 57-39-23 9-42 24-57 39Zm0 0c30-19 54-9 66 14-27-11-41-13-66-14Zm0 0c18 9 26 24 24 47-13-20-21-29-24-47Z" fill="#78af8a" />
    <path d="M213 118c-23-17-41-10-54 10 24-8 38-6 54-10Zm0 0c-4-24-15-36-34-39 10 20 21 30 34 39Zm0 0c13-24 32-32 49-22-19 4-31 12-49 22Zm0 0c24-8 38 1 44 18-17-8-31-10-44-18Z" fill="#4f9675" />
    <g transform="translate(298 64) rotate(-17)">
      <path d="m-5 7-46 13-5-7L-9-6l12-20 9 1-5 26 24 29-7 5L1 17l-6 14-7 1 7-25Z" fill="#e9eee5" />
      <path d="m3-21 4-1 2 8-7 1 1-8Z" fill="#2e4c5d" />
    </g>
    <path d="M257 106c-8 8-17 11-28 13" stroke="#9bbfbb" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 7" />
  </svg>;
}

export function TravelHeroScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<TravelScene | null>(null);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Load the renderer in the browser; the comparison content renders first.
    import("./travelSceneRenderer").then(({ createTravelScene }) => {
      if (cancelled || !canvasRef.current) return;
      try {
        sceneRef.current = createTravelScene(canvasRef.current, () => { if (!cancelled) setReady(false); });
        setReady(true);
      } catch {
        // The authored vector remains visible when WebGL is unavailable.
        setReady(false);
      }
    }).catch(() => { if (!cancelled) setReady(false); });
    return () => { cancelled = true; sceneRef.current?.dispose(); sceneRef.current = null; };
  }, []);

  useEffect(() => { sceneRef.current?.setPaused(paused); }, [paused]);

  return <div className={styles.scene} data-ready={ready}>
    {!ready && <StaticIsland />}
    <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
    {ready && <button
      type="button"
      className={styles.pause}
      aria-label={paused ? "Spustit animaci ostrova" : "Pozastavit animaci ostrova"}
      title={paused ? "Spustit animaci" : "Pozastavit animaci"}
      aria-pressed={paused}
      onClick={() => setPaused(value => !value)}
    >{paused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}</button>}
  </div>;
}
