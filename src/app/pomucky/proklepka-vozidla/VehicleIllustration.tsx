"use client";

import { useId } from "react";
import styles from "./vehicleIllustration.module.css";

type WheelGeometry = { x: number; y: number; scale: number };
const WHEELS: readonly WheelGeometry[] = [
  { x: 88, y: 269, scale: .85 },
  { x: 258, y: 297, scale: 1 },
];
const wheelTransform = ({ x, y, scale }: WheelGeometry) =>
  `translate(${x} ${y}) rotate(-7) scale(${scale * .64} ${scale})`;

// The paint, body outline and wheel openings share one coordinate system.
const BODY_OUTLINE = "M56 185Q62 175 81 167L111 134Q133 111 161 106C203 97 259 100 300 104L350 108Q385 110 406 123L454 178Q512 189 558 214Q571 223 575 240Q582 265 579 291Q578 309 562 316L315 329Q302 331 295 325L112 294 61 279Q47 273 49 258L53 200Q53 190 56 185Z";
const WHEEL_OPENING = "M-60 90V0A60 60 0 0 1 60 0V90Z";
const WHEEL_LIP = "M-62 24V0A62 62 0 0 1 62 0V24";

const GRILLE_OUTLINE = "M406 228Q432 225 459 229L475 235 489 229Q512 226 535 227L536 246Q534 258 524 260L423 264Q413 264 409 255Z";
const GRILLE_OPENING = "M409 231Q434 228 458 232L475 238 490 232Q511 229 532 230L532 246Q530 255 522 257L424 261Q416 261 412 253Z";

function AlloyWheel({ wheel, id }: { wheel: WheelGeometry; id: string }) {
  return (
    <g transform={wheelTransform(wheel)}>
      <circle r="55" fill={`url(#${id}-tire)`} stroke="#313539" strokeWidth="1.4" />
      <circle r="48" stroke="#616970" strokeWidth=".7" />
      <path d="M-8-51C-32-48-49-24-48 1M14 50C36 42 48 22 48 1" stroke="#76818a" strokeWidth="1" opacity=".55" />
      <circle r="41" fill={`url(#${id}-chrome)`} />
      <circle r="35" fill="#4d545a" />
      <circle r="29" fill="#646d74" />
      {[0, 72, 144, 216, 288].map((angle) => (
        <g key={angle} transform={`rotate(${angle})`}>
          <path d="M-5-7-10-36-2-39 4-10Z" fill={`url(#${id}-chrome)`} />
          <path d="M2-9 9-37 16-35 10-5Z" fill="#d6d9dc" />
          <path d="M-6-9-8-33" stroke="#fbfbfb" strokeWidth="1" />
        </g>
      ))}
      <circle r="12" fill={`url(#${id}-chrome)`} stroke="#9da4ab" />
      {[0, 72, 144, 216, 288].map((angle) => <circle key={angle} cx="0" cy="-8.5" r="1.4" transform={`rotate(${angle})`} fill="#5c636a" />)}
      <circle r="5.6" fill="#5a6269" /><path d="M-3 0 1-3 3-1 3 2H-2Z" fill="#e5e7e9" />
    </g>
  );
}

/** Original vector illustration inspired by the pre-facelift Octavia III liftback. */
export function VehicleIllustration({ animated = false, className = "" }: { animated?: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  const fill = (name: string) => `url(#${id}-${name})`;
  return (
    <svg className={`${styles.illustration} ${animated ? styles.animated : ""} ${className}`} viewBox="0 0 520 440" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-platform`} x1="160" y1="195" x2="331" y2="368" gradientUnits="userSpaceOnUse"><stop stopColor="#faf8ff" /><stop offset="1" stopColor="#e9e1f5" /></linearGradient>
        <linearGradient id={`${id}-body`} x1="280" y1="109" x2="332" y2="329" gradientUnits="userSpaceOnUse"><stop stopColor="#e7ebee" /><stop offset=".42" stopColor="#bec5cb" /><stop offset=".72" stopColor="#929ba2" /><stop offset="1" stopColor="#6c7781" /></linearGradient>
        <linearGradient id={`${id}-side`} x1="177" y1="178" x2="151" y2="321" gradientUnits="userSpaceOnUse"><stop stopColor="#d5dbe0" /><stop offset=".3" stopColor="#afb7be" /><stop offset=".7" stopColor="#8e99a2" /><stop offset="1" stopColor="#bac2c9" /></linearGradient>
        <linearGradient id={`${id}-hood`} x1="363" y1="174" x2="418" y2="248" gradientUnits="userSpaceOnUse"><stop stopColor="#f2f5f7" /><stop offset=".5" stopColor="#d0d7dc" /><stop offset="1" stopColor="#a4afb8" /></linearGradient>
        <linearGradient id={`${id}-bumper`} x1="455" y1="243" x2="455" y2="327" gradientUnits="userSpaceOnUse"><stop stopColor="#c7cfd5" /><stop offset=".55" stopColor="#a9b4bd" /><stop offset=".85" stopColor="#c5cdd4" /><stop offset="1" stopColor="#83909a" /></linearGradient>
        <linearGradient id={`${id}-glass`} x1="266" y1="121" x2="335" y2="188" gradientUnits="userSpaceOnUse"><stop stopColor="#52606b" /><stop offset=".4" stopColor="#25313a" /><stop offset="1" stopColor="#34434d" /></linearGradient>
        <linearGradient id={`${id}-sideGlass`} x1="139" y1="115" x2="202" y2="182" gradientUnits="userSpaceOnUse"><stop stopColor="#71818c" /><stop offset=".4" stopColor="#435661" /><stop offset="1" stopColor="#283740" /></linearGradient>
        <linearGradient id={`${id}-chrome`} x1="-32" y1="-36" x2="28" y2="40" gradientUnits="userSpaceOnUse"><stop stopColor="#fbfcfd" /><stop offset=".3" stopColor="#d3dbe0" /><stop offset=".56" stopColor="#89969f" /><stop offset=".78" stopColor="#f1f4f6" /><stop offset="1" stopColor="#a2adb6" /></linearGradient>
        <linearGradient id={`${id}-tire`} x1="-44" y1="-30" x2="37" y2="45" gradientUnits="userSpaceOnUse"><stop stopColor="#414950" /><stop offset=".5" stopColor="#252a30" /><stop offset="1" stopColor="#30363c" /></linearGradient>
        <linearGradient id={`${id}-headlight`} x1="337" y1="220" x2="365" y2="252" gradientUnits="userSpaceOnUse"><stop stopColor="#758792" /><stop offset=".45" stopColor="#dde7ed" /><stop offset=".6" stopColor="#657a86" /><stop offset="1" stopColor="#cad6de" /></linearGradient>
        <linearGradient id={`${id}-grilleRim`} x1="414" y1="227" x2="528" y2="265" gradientUnits="userSpaceOnUse"><stop stopColor="#eaf0f4" /><stop offset=".3" stopColor="#a4b1bb" /><stop offset=".65" stopColor="#f7fafc" /><stop offset="1" stopColor="#b0bcc5" /></linearGradient>
        <radialGradient id={`${id}-projector`} cx="35%" cy="30%" r="70%"><stop stopColor="#9caebc" /><stop offset=".35" stopColor="#526a7b" /><stop offset=".65" stopColor="#293b4a" /><stop offset="1" stopColor="#172731" /></radialGradient>
        <linearGradient id={`${id}-scan`}><stop stopColor="#b596df" stopOpacity="0" /><stop offset=".7" stopColor="#af8bdf" stopOpacity=".08" /><stop offset="1" stopColor="#8e5dc8" stopOpacity=".27" /></linearGradient>
        <filter id={`${id}-shadow`} x="-30%" y="-70%" width="160%" height="240%"><feGaussianBlur stdDeviation="11" /></filter>
        <pattern id={`${id}-grid`} width="48" height="48" patternUnits="userSpaceOnUse" patternTransform="matrix(1 .3 -1 .3 260 60)"><path d="M48 0H0V48" stroke="#eae3f3" strokeWidth="1" /></pattern>
        <clipPath id={`${id}-bodyOutline`}><path d={BODY_OUTLINE} /></clipPath>
        <mask id={`${id}-wheelOpenings`} maskUnits="userSpaceOnUse" x="0" y="0" width="640" height="420">
          <rect width="640" height="420" fill="white" />
          {WHEELS.map((wheel) => <path key={wheel.x} d={WHEEL_OPENING} transform={wheelTransform(wheel)} fill="black" />)}
        </mask>
        <filter id={`${id}-contactShadow`} x="-50%" y="-150%" width="200%" height="400%"><feGaussianBlur stdDeviation="2.8" /></filter>
        <clipPath id={`${id}-grille`}><path d={GRILLE_OPENING} /></clipPath>
      </defs>

      <rect x="18" y="80" width="484" height="290" fill={fill("grid")} />
      <path d="M26 282 344 192 496 248 178 341Z" fill="#ddd3eb" opacity=".45" transform="translate(0 7)" />
      <path d="M26 282 344 192 496 248 178 341Z" fill={fill("platform")} stroke="#e0d5ed" strokeLinejoin="round" />
      <path d="M43 281 343 201 477 247 178 330Z" stroke="#cbb7e4" strokeDasharray="5 5" strokeOpacity=".6" />
      <path className={styles.track} d="m58 273 25-7m-11 25 25 9m336-54 25-7m-134-27 25-7" stroke="#bba5cf" strokeWidth="2.4" strokeLinecap="round" />
      <ellipse cx="268" cy="269" rx="181" ry="31" transform="rotate(-5 268 269)" fill="#5b3b7d30" filter={fill("shadow")} />

      <g fill="#584469" opacity=".25" filter={fill("contactShadow")}>
        <ellipse cx="96" cy="281" rx="24" ry="4" />
        <ellipse cx="285" cy="292" rx="30" ry="5" />
        <ellipse cx="409" cy="266" rx="25" ry="4" />
      </g>

      <g transform="translate(473 35) scale(-.73 .73)">
        {/* The far front tire is mostly hidden by the bumper. */}
        <g transform="translate(516 284) rotate(-7)">
          <ellipse rx="31" ry="54" fill={fill("tire")} stroke="#393e42" />
          <path d="M-22 23q5 22 19 28M-14 34q7 14 15 16M10 35q9-9 13-22" stroke="#5b6269" strokeWidth="1.2" opacity=".65" />
        </g>
        {WHEELS.map((wheel) => (
          <g key={wheel.x}>
            <path d="M-60 4V0A60 60 0 0 1 60 0V4Z" transform={wheelTransform(wheel)} fill="#586067" />
            <AlloyWheel wheel={wheel} id={id} />
          </g>
        ))}
        <g clipPath={fill("bodyOutline")} mask={fill("wheelOpenings")}>
          <path d={BODY_OUTLINE} fill={fill("body")} stroke="#a5abb1" strokeWidth="1.1" strokeLinejoin="round" />

          {/* Roof and the sloping rear pillars distinguish the Octavia liftback. */}
          <path d="m81 168 29-35q26-25 52-28 54-9 119-2l70 5q34 1 56 14l-181-5q-37-10-68-1-40 10-54 48Z" fill="#e7e9eb" />
          <path d="M115 134q22-23 51-26 43-7 83-4l101 6q25 1 46 9l-170-5q-35-10-69 0-24 6-42 20Z" fill="#fafafa" opacity=".68" />
          <path d="M105 168q-1-20 18-35 20-17 40-18l14 1-11 65-57-5q-5-1-4-8Z" fill={fill("sideGlass")} stroke="#9aa1a8" strokeWidth="1.5" />
          <path d="m183 116q25 0 35 16l24 56-70-7Z" fill={fill("sideGlass")} stroke="#9aa1a8" strokeWidth="1.5" />
          <path d="m173 115 10 1-11 65-8-1Z" fill="#4c5258" />
          <path d="m121 135 13-11-12 50-7-1Zm78-12 7 4 23 53-12-2Z" fill="#e5e7e8" opacity=".13" />
          <path d="M108 174 239 189M109 146q17-26 51-31" stroke="#eff0f1" strokeWidth="1.4" />
          <path d="M227 118q81-3 166 7l53 53q4 6-4 7l-184-3q-8-1-11-9Z" fill={fill("glass")} stroke="#b5bbc0" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M238 126q70-4 147 4l39 39q-75-34-178-18Z" fill="#aab0b6" opacity=".13" />
          <path d="m272 126 7 48m113-40 38 42" stroke="#c5c9cd" strokeWidth="1.5" opacity=".12" />
          <path d="m254 178 83 3m13-1 67 2" stroke="#25292c" strokeWidth="1.6" strokeLinecap="round" />
          <path d="m321 123 3 6 16 1 3-6" fill="#282b2e" opacity=".6" />

          {/* All side panels share the same silhouette and wheel cutouts. */}
          <path d="M80 182 109 179 240 191Q275 202 304 220L308 330 113 296 57 279Q49 268 50 255L55 199Q58 187 80 182Z" fill={fill("side")} />
          <path d="M62 194Q97 191 131 199L240 213 306 234" stroke="#f9f9f9" strokeWidth="1.7" opacity=".66" />
          <path d="M117 224 213 245M116 227 212 248" stroke="#9da4ab" strokeWidth="1.1" opacity=".18" />
          <path d="m112 276 100 24-1 8-97-23Z" fill="#eef0f1" opacity=".4" />
          <path d="M167 182 155 294M240 191Q243 205 234 231L217 302M108 179 104 216" stroke="#8f979e" strokeWidth=".9" opacity=".75" />
          <path d="M109 288 213 313" stroke="#949ca2" strokeWidth="1.1" />
          <path d="M112 290 213 315" stroke="#e1e3e5" strokeWidth="1.2" opacity=".65" />
          <path d="m122 204 12 2q4 1 1 4l-11-1q-4-1-2-5Zm60 11 13 2q4 1 0 5l-12-2q-4-1-1-5Z" fill="#e7e9eb" stroke="#9ea5ac" strokeWidth=".9" />
          <path d="m82 180-4 18-6 1 3-17Z" fill="#b85e65" />
          <path d="m73 190-9 4-4 14 8-3Z" fill="#cf9297" />
          <path d="M83 199q8 0 9 5l-1 12q-5 0-10-2l1-12Z" stroke="#a7adb3" strokeWidth=".8" />

          {/* Broad hood with the central crease leading into the Škoda-style grille. */}
          <path d="M247 184 445 185Q505 193 560 216L538 230 489 229 475 235 459 229 397 226 304 217Z" fill={fill("hood")} />
          <path d="m264 186 151 6 61 36-9 1-63-24Z" fill="#fbfbfb" opacity=".5" />
          <path d="m430 188 55 8 59 23-38-7Z" fill="#b5babf" opacity=".25" />
          <path d="M302 217 397 226 459 229 475 235 489 229 538 230 560 216" stroke="#9aa1a8" strokeWidth="1.2" />
          <path d="m309 213 95-17m72 32-48-38m63 34-19-32" stroke="#f7f8f9" strokeWidth="1.3" opacity=".8" />

          {/* Crystal-shaped headlamps, vertical grille slats and lower bumper. */}
          <path d="M305 221 399 229 408 256 538 252 571 244 579 289Q580 309 561 317L312 329Q304 329 304 320L307 278Q309 250 305 221Z" fill={fill("bumper")} />
          {/* The near lamp keeps its full width; the far lamp follows the receding corner. */}
          <path d="M313 222 391 230 400 252 318 248Z" fill="#34424d" stroke="#9fadb7" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M318 226 387 233 394 247 322 243Z" fill={fill("headlight")} />
          <path d="M358 231 365 243 372 244 369 233Z" fill="#c9d5de" opacity=".8" />
          <path d="m374 234 8 1 7 10-8-1Z" fill="#f0f5f8" opacity=".85" />
          <ellipse cx="343" cy="235.5" rx="9" ry="7.5" fill="#536572" stroke="#e4edf3" strokeWidth="1.7" />
          <ellipse cx="343" cy="235.5" rx="6.5" ry="5.7" fill={fill("projector")} />
          <ellipse cx="340.7" cy="233.6" rx="2.2" ry="1.2" fill="#e5f1f8" opacity=".9" />
          <path d="m323 229 3 10m5-10 2 10" stroke="#e0eaf0" strokeWidth="1.3" />
          <path d="m322 242 72 5-3-6" stroke="#f5fafc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M542 230 561 221Q563 220 564 223L572 242Q574 246 570 247L543 252Z" fill="#34424d" stroke="#9fadb7" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M546 233 561 226 568 241 546 247Z" fill={fill("headlight")} />
          <ellipse cx="556.5" cy="236.5" rx="4.9" ry="6" transform="rotate(-13 556.5 236.5)" fill="#647985" stroke="#e5edf2" strokeWidth="1.4" />
          <ellipse cx="556.5" cy="236.5" rx="3.2" ry="4.2" transform="rotate(-13 556.5 236.5)" fill={fill("projector")} />
          <ellipse cx="555.7" cy="234.2" rx="1.1" ry="1.5" fill="#ebf5fb" opacity=".85" />
          <path d="m548 234 1 8m14-13 4 10" stroke="#dce7ed" strokeWidth="1.2" />
          <path d="m547 247 22-4-3-8" stroke="#f5fafc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M562 225 569 240" stroke="#d9cbb3" strokeWidth=".7" opacity=".65" />

          <path d={GRILLE_OUTLINE} fill={fill("grilleRim")} stroke="#83939f" strokeWidth=".85" />
          <path d={GRILLE_OPENING} fill="#202b33" />
          <g clipPath={fill("grille")}>
            {Array.from({ length: 21 }, (_, index) => (
              <g key={index}>
                <path d={`M${409 + index * 6} 226l5 38`} stroke="#111c24" strokeWidth="3.5" />
                <path d={`M${408.4 + index * 6} 226l5 38`} stroke="#81919d" strokeWidth="1.6" />
                <path d={`M${407.9 + index * 6} 226l5 38`} stroke="#c1ccd4" strokeWidth=".55" />
              </g>
            ))}
            <path d="M410 232Q434 229 458 233L475 239 490 233Q514 230 533 231" stroke="#15222b" strokeWidth="1.3" opacity=".75" />
            <path d="M413 256Q422 263 439 259L526 256" stroke="#141e26" strokeWidth="1.2" />
          </g>
          <path d="M414 258Q419 263 427 262L523 259Q531 257 534 249" stroke="#f1f6fa" strokeWidth=".7" opacity=".85" />
          <ellipse cx="476" cy="223" rx="7.6" ry="6" fill="#eff0f1" stroke="#b3b8bd" strokeWidth="1.4" /><ellipse cx="476" cy="223" rx="5.6" ry="4.3" fill="#5a6168" />
          <path d="m472 222 4-2 3 2v3l-2-1-3 1-2-2Z" fill="#e8eaeb" />
          <path d="m317 280 253-6 1 28-252 20Z" fill="#4c5258" stroke="#a8afb5" strokeWidth="1.5" />
          <path d="m322 285 57 1-5 20-48 5Z" fill="#6f7981" /><path d="m329 288 38 2-4 9-30 4Z" fill="#c8cccf" /><ellipse cx="345" cy="296" rx="7" ry="4" fill="#e8eaec" />
          <path d="m543 282 23-2-1 17-24 4Z" fill="#6f7981" /><path d="m548 287 15-2-1 8-14 2Z" fill="#d7dadd" />
          <path d="m385 285 151-5m-152 12 151-6m-152 13 151-9m-152 16 151-10" stroke="#879097" strokeWidth="1.1" opacity=".65" />
          <path d="m320 325 241-15" stroke="#f1f2f3" strokeWidth="1.8" />
          <path d="m325 329 235-15-6 5-225 14Z" fill="#6a737b" />
          <path d="m438 265 71-2v20l-72 3Z" fill="#f2f3f3" stroke="#acb2b7" strokeWidth="1.3" />
          <path d="m438 265 6-.2v19l-7 .2Z" fill="#9ba2a9" />
          <g transform="translate(502 278) scale(-1 1) rotate(2)"><text fontSize="9.3" fontFamily="Arial, sans-serif" fontWeight="600" letterSpacing="1.1" fill="#6c757d">OCTAVIA</text></g>
          <circle cx="415" cy="274" r="2.4" stroke="#adb3b8" strokeWidth=".7" /><circle cx="533" cy="268" r="2" stroke="#adb3b8" strokeWidth=".7" />
          <path d="m324 256 16 2 2 6-16-2Z" stroke="#a7aeb4" strokeWidth=".8" />

          {WHEELS.map((wheel) => (
            <g key={wheel.x} transform={wheelTransform(wheel)}>
              <path d={WHEEL_LIP} stroke="#f0f1f2" strokeWidth="3.2" opacity=".85" />
              <path d="M-64 19V0A64 64 0 0 1 64 0V19" stroke="#9da4ab" strokeWidth=".9" opacity=".65" />
            </g>
          ))}
        </g>

        {/* Mirrors are painted last to sit in front of the window and hood. */}
        <path d="m198 170 21 5 8 13-8 2-23-9Z" fill="#545b61" />
        <path d="m182 160q18-15 36-4l12 10-6 11-36-4q-9-3-6-13Z" fill="#dcdfe1" stroke="#adb3b8" strokeWidth="1" />
        <path d="m184 169 40 4-2 4-33-3Z" fill="#77818a" /><path d="m187 168 34 3" stroke="#f9fafa" strokeWidth="1.1" />
        <path d="m449 169 9-14q8-5 19 5l-3 11-15 3Z" fill="#cfd3d6" stroke="#a1a8ae" strokeWidth="1" />
      </g>

      <g className={styles.scan}>
        <path d="m41 169 131 37v122L41 290Z" fill={fill("scan")} />
        <path d="M172 206V328" stroke="#9a69cd" strokeWidth="1.6" />
        <path d="m41 290 131 38" stroke="#b48cda" strokeWidth="1.3" />
        <circle cx="172" cy="328" r="2.8" fill="#a878d3" />
      </g>
      <g className={styles.callout}>
        <path d="M289 126V90l33-17" stroke="#bda4d6" strokeWidth="1.1" strokeDasharray="3 4" />
        <circle cx="289" cy="126" r="3.5" fill="#a980cf" stroke="#f8f4fc" strokeWidth="1.8" />
        <g transform="translate(321 47)"><rect width="52" height="42" rx="12" fill="white" stroke="#e5dced" /><path d="M15 13h22m-22 6h14m-14 6h18m-18 6h9" stroke="#b29bc9" strokeWidth="1.7" strokeLinecap="round" /><circle cx="39" cy="30" r="3.5" fill="#dbcee9" /></g>
      </g>
      <g className={styles.point}>
        <circle cx="81" cy="174" r="10" fill="#f5effc" stroke="#d9c7ed" />
        <circle cx="81" cy="174" r="2.8" fill="#a278c6" />
        <path d="m91 180 18 15" stroke="#c5afdc" strokeDasharray="3 3" />
      </g>
    </svg>
  );
}
