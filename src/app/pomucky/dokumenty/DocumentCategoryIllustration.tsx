export type DocumentCategoryKey = "zivotni" | "majetek" | "auto" | "investice";

export function DocumentCategoryIllustration({ category }: { category: DocumentCategoryKey }) {
  return (
    <svg viewBox="0 0 180 108" fill="none" aria-hidden="true" focusable="false">
      <ellipse cx="90" cy="57" rx="72" ry="44" fill="var(--tint)" />
      <ellipse cx="90" cy="94" rx="48" ry="6" fill="currentColor" opacity=".1" />
      {category === "zivotni" && (
        <>
          <path d="m92 17 36 13v28c0 20-17 33-36 40-19-7-36-20-36-40V30l36-13Z" fill="currentColor" opacity=".18" />
          <path d="m86 12 36 13v28c0 20-17 33-36 40-19-7-36-20-36-40V25l36-13Z" fill="#fff" stroke="currentColor" strokeWidth="1.5" />
          <path d="m86 20 28 10v23c0 15-13 26-28 32-15-6-28-17-28-32V30l28-10Z" fill="var(--tint)" />
          <path d="M86 65 70 50c-11-12 5-25 16-13 11-12 27 1 16 13L86 65Z" fill="currentColor" opacity=".72" />
          <path d="M66 49h12l5-9 7 19 5-10h12" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="135" cy="73" r="16" fill="#fff" stroke="currentColor" strokeOpacity=".3" />
          <path d="m128 73 5 5 9-10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M36 31h8m-4-4v8M139 35h6m-3-3v6" stroke="currentColor" strokeOpacity=".4" strokeLinecap="round" />
        </>
      )}
      {category === "majetek" && (
        <>
          <path d="m47 46 43-27 43 27v39l-43 17-43-17V46Z" fill="currentColor" opacity=".14" />
          <path d="M91 29 132 49v34L91 98V29Z" fill="currentColor" opacity=".24" />
          <path d="M48 48 91 29v69L48 82V48Z" fill="#fff" stroke="currentColor" strokeWidth="1.2" />
          <path d="m39 49 34-34 26 12-8 35-18-31-26 24-8-6Z" fill="currentColor" opacity=".8" />
          <path d="m73 15 35-8 34 35-43 20-26-47Z" fill="currentColor" opacity=".55" />
          <path d="m99 62 43-20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="m63 64 14 5v24l-14-5V64Z" fill="var(--tint)" stroke="currentColor" strokeOpacity=".4" />
          <path d="m104 58 15-6v15l-15 6V58Z" fill="#fff" opacity=".9" />
          <path d="m111 55 1 15m-8-5 15-6" stroke="currentColor" strokeOpacity=".45" />
          <path d="M121 19V9l9-2v22" fill="currentColor" opacity=".65" />
          <path d="M31 83v-9m-4 4h8" stroke="currentColor" strokeOpacity=".4" strokeLinecap="round" />
        </>
      )}
      {category === "auto" && (
        <>
          <path d="m35 55 14-6 13-22h53l20 21 14 7v26l-34 12-80-20V55Z" fill="currentColor" opacity=".2" />
          <path d="m30 52 15-7 14-21h53l19 20 15 7-36 17-80-16Z" fill="currentColor" opacity=".65" />
          <path d="m30 52 80 16v22L30 71V52Z" fill="#fff" stroke="currentColor" strokeWidth="1.3" />
          <path d="m110 68 36-17v24l-36 15V68Z" fill="currentColor" opacity=".4" />
          <path d="m63 29 22 1 10 23-43-9 11-15Z" fill="#fff" opacity=".9" />
          <path d="m90 30 20-1 16 17-26 8-10-24Z" fill="#fff" opacity=".75" />
          <path d="m62 30-8 15M71 59l14 3M121 72l16-7" stroke="currentColor" strokeOpacity=".55" strokeWidth="1.5" strokeLinecap="round" />
          <ellipse cx="51" cy="72" rx="9" ry="13" transform="rotate(-12 51 72)" fill="currentColor" />
          <ellipse cx="51" cy="72" rx="4" ry="6" transform="rotate(-12 51 72)" fill="#fff" opacity=".85" />
          <ellipse cx="98" cy="83" rx="9" ry="13" transform="rotate(-12 98 83)" fill="currentColor" />
          <ellipse cx="98" cy="83" rx="4" ry="6" transform="rotate(-12 98 83)" fill="#fff" opacity=".85" />
          <path d="m33 57 10 2v6l-10-2v-6Z" fill="var(--tint)" stroke="currentColor" strokeOpacity=".35" />
          <path d="M136 24h8m-4-4v8" stroke="currentColor" strokeOpacity=".4" strokeLinecap="round" />
        </>
      )}
      {category === "investice" && (
        <>
          <rect x="51" y="19" width="84" height="64" rx="8" fill="currentColor" opacity=".16" />
          <rect x="45" y="13" width="84" height="64" rx="8" fill="#fff" stroke="currentColor" strokeWidth="1.3" />
          <path d="M58 65h56M58 29v36" stroke="currentColor" strokeOpacity=".25" strokeLinecap="round" />
          <path d="m63 52 14-11 13 6 21-22m-11 0h11v11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M69 53v8m14-11v11m14-20v20m14-25v25" stroke="currentColor" strokeWidth="7" strokeOpacity=".18" />
          <path d="M36 77v14c0 5 9 9 20 9s20-4 20-9V77" fill="currentColor" opacity=".45" />
          <ellipse cx="56" cy="77" rx="20" ry="8" fill="var(--tint)" stroke="currentColor" strokeWidth="1.3" />
          <path d="M36 84c0 5 9 8 20 8s20-3 20-8" stroke="#fff" strokeOpacity=".65" />
          <path d="M92 85v9c0 4 8 7 18 7s18-3 18-7v-9" fill="currentColor" opacity=".65" />
          <ellipse cx="110" cy="85" rx="18" ry="7" fill="var(--tint)" stroke="currentColor" strokeWidth="1.3" />
          <path d="M145 40h8m-4-4v8" stroke="currentColor" strokeOpacity=".4" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
