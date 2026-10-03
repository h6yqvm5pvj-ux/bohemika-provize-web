import { CuzkHouse } from "../cuzk/CuzkHouse";
import type { ToolHubToolKey } from "./toolHub";
import styles from "./ToolIllustration.module.css";
import { ToolSceneDrawing } from "./ToolSceneDrawing";

type PreservedScene = "house" | "radar" | "documents";

const PRESERVED_SCENES: Partial<Record<ToolHubToolKey, PreservedScene>> = {
  zaznam: "documents", katastr: "house", "radar-vyroci": "radar", tvorba: "documents",
};

function Paper({ x = 43, y = 25 }: { x?: number; y?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="m0 9 39-9 23 13v59l-62 14Z" fill="#fff" stroke="#dcd4e8" />
      <path d="m39 0 23 13-21 5Z" fill="var(--scene-light)" />
      <path d="m12 30 32-7m-32 18 32-7m-32 18 21-5" stroke="var(--scene-mid)" strokeWidth="3" strokeLinecap="round" />
      <path d="m12 67 17-4" stroke="var(--scene-color)" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

function PreservedDrawing({ scene }: { scene: PreservedScene }) {
  switch (scene) {
    case "house":
      return <>
        <path d="m20 90 64-35 59 32-65 39Z" fill="var(--scene-light)" stroke="var(--scene-mid)" strokeDasharray="3 3" />
        <g transform="translate(-15 -7) scale(.42)"><CuzkHouse /></g>
        <g transform="translate(27 73)"><path d="M0 4v24" stroke="#98a99f" strokeWidth="3" /><ellipse cy="1" rx="9" ry="14" fill="#b8cfc2" /></g>
        <g className={styles.detail}><ellipse cx="111" cy="47" rx="10" ry="4" fill="var(--scene-mid)" opacity=".3" /><path d="M111 45s-10-11-10-18a10 10 0 0 1 20 0c0 7-10 18-10 18Z" fill="var(--scene-color)" stroke="#fff" strokeWidth="2" /><circle cx="111" cy="27" r="3" fill="#fff" /></g>
      </>;
    case "radar":
      return <>
        <path d="m35 39 73-19 13 8v83l-73 18-13-8Z" fill="var(--scene-mid)" />
        <path d="m35 39 73-19v83l-73 18Z" fill="#fff" stroke="var(--scene-mid)" />
        <path d="m35 39 73-19v22l-73 19Z" fill="var(--scene-color)" />
        <path d="M52 27v17m37-27v17" stroke="var(--scene-mid)" strokeWidth="5" strokeLinecap="round" />
        {[0, 1].map(row => [0, 1, 2].map(col => <path key={`${row}-${col}`} d={`m${48 + col * 19} ${73 + row * 19 - col * 5} 9-2v9l-9 2Z`} fill="var(--scene-light)" />))}
        <g className={styles.detail}>
          <circle cx="116" cy="99" r="20" fill="#fff" stroke="var(--scene-color)" strokeWidth="2" />
          {scene === "radar" ? <><circle cx="116" cy="99" r="12" stroke="var(--scene-mid)" /><path d="m116 99 9-13" stroke="var(--scene-color)" strokeWidth="2" /><circle cx="108" cy="103" r="3" fill="var(--scene-color)" /></> : <path d="M116 87v13l9 5" stroke="var(--scene-color)" strokeWidth="2" strokeLinecap="round" />}
        </g>
      </>;
    case "documents":
      return <>
        <g transform="translate(-8 9)"><Paper /></g><Paper />
        <g className={styles.detail}><path d="m102 105 16-62 8 3-16 62-8 8Z" fill="var(--scene-color)" /><path d="m118 43 2-7 8 3-2 7Z" fill="var(--scene-mid)" /><path d="m102 105 8 2-8 8Z" fill="#d6c5b5" /></g>
      </>;
  }
}

export function ToolIllustration({ toolKey }: { toolKey: ToolHubToolKey }) {
  const preservedScene = PRESERVED_SCENES[toolKey];
  const scene = preservedScene ?? toolKey;
  return (
    <svg className={styles.scene} data-scene={scene} viewBox="0 0 160 145" fill="none" aria-hidden="true">
      <path d="m9 98 73-41 70 38-73 43Z" fill="var(--scene-surface)" />
      <path d="m9 105 70 39 73-42" stroke="var(--scene-mid)" strokeOpacity=".35" strokeDasharray="2 4" />
      <ellipse cx="80" cy="113" rx="46" ry="13" fill="var(--scene-color)" opacity=".07" />
      <>{preservedScene ? <PreservedDrawing scene={preservedScene} /> : <ToolSceneDrawing toolKey={toolKey} />}</>
    </svg>
  );
}
