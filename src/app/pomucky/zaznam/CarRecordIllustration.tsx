import { useId } from "react";

type CarRecordIllustrationProps = {
  variant?: "overview" | "coverage" | "discounts";
  className?: string;
};

/** Decorative SVGs stay sharp in the compact form without loading image assets. */
export function CarRecordIllustration({
  variant = "overview",
  className,
}: CarRecordIllustrationProps) {
  const id = useId().replace(/:/g, "");

  if (variant === "coverage") {
    return (
      <svg className={className} viewBox="0 0 120 72" fill="none" aria-hidden="true" focusable="false">
        <ellipse cx="61" cy="64" rx="42" ry="5" fill="#E9E1F1" />
        <path d="M18 34a42 42 0 0 1 84 0c-7-5-14-5-21 0-7-5-14-5-21 0-7-5-14-5-21 0-7-5-14-5-21 0Z" fill="#E3D5F1" />
        <path d="M39 34c0-18 9-30 21-30s21 12 21 30" stroke="#C4AADA" strokeWidth="1.5" />
        <path d="M60 2v4m0 28v17" stroke="#8C6BA8" strokeWidth="2" strokeLinecap="round" />
        <path d="m31 47 9-12h26l12 12 14 4v10H25V51l6-4Z" fill="#9775B8" />
        <path d="m43 38-6 9h34l-8-9H43Z" fill="#F6F2FB" />
        <path d="M53 38v9" stroke="#CBB6DE" strokeWidth="2" />
        <rect x="25" y="55" width="67" height="6" rx="3" fill="#77568F" />
        <circle cx="39" cy="60" r="7" fill="#5F4A71" />
        <circle cx="39" cy="60" r="3" fill="#E4D8EE" />
        <circle cx="78" cy="60" r="7" fill="#5F4A71" />
        <circle cx="78" cy="60" r="3" fill="#E4D8EE" />
        <path d="M83 50h6l3 4h-9v-4Z" fill="#FAF6FF" />
        <circle cx="103" cy="48" r="11" fill="#E1EEE9" stroke="#BED8CD" />
        <path d="m98 48 3 3 6-7" stroke="#548272" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 15v6m-3-3h6" stroke="#BEA5D2" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (variant === "discounts") {
    return (
      <svg className={className} viewBox="0 0 120 72" fill="none" aria-hidden="true" focusable="false">
        <ellipse cx="63" cy="64" rx="40" ry="5" fill="#E9E1F1" />
        <circle cx="59" cy="34" r="29" fill="#F1EAF8" />
        <g transform="rotate(-14 55 37)">
          <path d="m32 22 19-10 26 11v34H32V22Z" fill="#D8C4E9" stroke="#C5ADD9" />
          <circle cx="51" cy="23" r="3" fill="#F7F3FC" />
        </g>
        <g transform="rotate(12 68 39)">
          <path d="m47 24 21-12 22 12v36H47V24Z" fill="#FBF8FE" stroke="#BA9CD2" strokeWidth="1.5" />
          <circle cx="68" cy="23" r="3" fill="#DCCBEA" />
          <path d="m59 50 18-18" stroke="#8D67AA" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="60" cy="35" r="4" stroke="#8D67AA" strokeWidth="2" />
          <circle cx="76" cy="48" r="4" stroke="#8D67AA" strokeWidth="2" />
        </g>
        <path d="M67 13C59 1 40 2 40 12c0 7 12 8 15 4" stroke="#B597CC" strokeWidth="2" strokeLinecap="round" />
        <circle cx="95" cy="54" r="10" fill="#E1EEE9" stroke="#BED8CD" />
        <path d="m91 54 3 3 5-6" stroke="#548272" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M103 15v8m-4-4h8M20 39v6m-3-3h6" stroke="#BEA5D2" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="27" cy="18" r="2" fill="#D1BDDF" />
      </svg>
    );
  }

  return (
    <svg className={className} viewBox="0 0 240 140" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-body`} x1="71" y1="57" x2="121" y2="105" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B699D0" />
          <stop offset="1" stopColor="#8C68AC" />
        </linearGradient>
        <linearGradient id={`${id}-glass`} x1="84" y1="48" x2="102" y2="72" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#DCD1ED" />
        </linearGradient>
      </defs>
      <ellipse cx="117" cy="77" rx="98" ry="58" fill="#F1EAF8" />
      <path d="M21 111h197" stroke="#DCCDE9" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M40 123h24m17 0h40m17 0h24m17 0h13" stroke="#E4D8ED" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="117" cy="105" rx="91" ry="8" fill="#DACBE7" opacity=".7" />
      <path d="m34 73 23-28a12 12 0 0 1 9-4h50c7 0 12 3 17 8l21 23 32 7c6 1 10 6 10 12v10l-14 7H39l-14-9V85c0-6 3-10 9-12Z" fill={`url(#${id}-body)`} stroke="#8865A5" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m62 48-18 24h99l-17-19a14 14 0 0 0-10-5H62Z" fill={`url(#${id}-glass)`} />
      <path d="M91 48v24m36-18-18 18" stroke="#A98AC2" strokeWidth="3" />
      <path d="m51 67 10-14m-4 14 10-14" stroke="white" strokeWidth="2" strokeLinecap="round" opacity=".7" />
      <path d="m144 73 40 8-26 7-17-6H31" stroke="#C6AEDD" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m158 88 37-5v18l-14 7h-27l4-20Z" fill="#76548F" />
      <path d="m168 89 20-3v7l-20 3v-7Z" fill="#F8F4FD" />
      <path d="m170 100 18-3" stroke="#C7B1D9" strokeWidth="2" strokeLinecap="round" />
      <path d="M29 96h123m-55-20v23" stroke="#7D5B97" strokeWidth="1.5" />
      <path d="M107 79h10M67 79h9" stroke="#E6D9F0" strokeWidth="2" strokeLinecap="round" />
      <path d="M142 67h9a4 4 0 0 1 4 4v3h-13v-7Z" fill="#78568F" />
      <rect x="27" y="82" width="6" height="8" rx="2" fill="#DECBEA" />
      {[62, 144].map((x) => (
        <g key={x}>
          <circle cx={x} cy="101" r="16" fill="#6A537B" />
          <circle cx={x} cy="101" r="10" fill="#E2D6EC" />
          <circle cx={x} cy="101" r="5" fill="#AA90BC" />
          <path d={`M${x} 92v4m0 10v4m-9-9h4m10 0h4`} stroke="#FAF7FD" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      ))}
      <path d="M190 23c8 6 15 7 23 8v17c0 12-10 21-23 26-13-5-23-14-23-26V31c8-1 15-2 23-8Z" fill="#FBFAFE" stroke="#CDB9DD" strokeWidth="1.5" />
      <path d="M190 30c6 4 11 5 17 6v12c0 8-7 15-17 20-10-5-17-12-17-20V36c6-1 11-2 17-6Z" fill="#E2EEE8" />
      <path d="m181 48 6 6 12-13" stroke="#658F7D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M34 35v10m-5-5h10M211 88v8m-4-4h8" stroke="#BEA4D1" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="151" cy="26" r="3" fill="#D7C4E6" />
      <circle cx="21" cy="70" r="2.5" fill="#D7C4E6" />
    </svg>
  );
}
