const paths = {
  assessment: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h3"/>',
  progression: '<path d="M4 20V4M4 20h17M8 16v-4h4V8h4V4h4"/>',
  payout: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2M7 6V4h11"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
} as const;

export const reportIcon = (name: keyof typeof paths) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#73518f" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;

/** Decorative vector artwork stays sharp in print and needs no external asset. */
export const reportIllustration = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 154" width="210" height="154" fill="none" aria-hidden="true">
  <ellipse cx="106" cy="79" rx="94" ry="68" fill="#f2edf7"/>
  <circle cx="179" cy="28" r="7" fill="#d9eee9"/><circle cx="26" cy="122" r="4" fill="#cab7db"/>
  <rect x="43" y="28" width="108" height="112" rx="12" fill="#e2d7ec" transform="rotate(-9 43 28)"/>
  <rect x="47" y="14" width="108" height="124" rx="12" fill="white" stroke="#cdbbdc" stroke-width="1.5"/>
  <path d="M66 35h45M66 43h28" stroke="#73518f" stroke-width="3" stroke-linecap="round"/>
  <rect x="66" y="61" width="69" height="9" rx="4.5" fill="#ebe3f2"/><rect x="66" y="61" width="52" height="9" rx="4.5" fill="#9473ad"/>
  <rect x="66" y="81" width="69" height="9" rx="4.5" fill="#ebe3f2"/><rect x="66" y="81" width="34" height="9" rx="4.5" fill="#b6a0ca"/>
  <path d="M66 112h20l12-12 12 5 22-15" stroke="#397b72" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="132" cy="90" r="4" fill="#397b72"/>
  <path d="m164 78 24 9v18c0 18-24 31-24 31s-24-13-24-31V87l24-9Z" fill="#dceee8" stroke="#76a99c" stroke-width="1.5"/>
  <path d="m153 105 8 8 14-17" stroke="#347b61" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M25 45v12m-6-6h12M184 53v8m-4-4h8" stroke="#ab91c0" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;
