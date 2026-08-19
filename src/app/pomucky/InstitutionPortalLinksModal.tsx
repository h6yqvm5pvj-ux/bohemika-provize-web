"use client";

import Image from "next/image";
import { ArrowUpRight, X } from "lucide-react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import styles from "./InstitutionPortalLinksModal.module.css";

type InstitutionPortalTarget = {
  key: string;
  label: string;
  href: string;
  logoPath: string;
  tintClass: string;
  logoScale?: number;
  ghostLogoClass?: string;
};

const INSTITUTION_PORTAL_TARGETS: InstitutionPortalTarget[] = [
  {
    key: "maxx",
    label: "Maxx",
    href: "https://sjednatel.bohemiaservis.cz/login",
    logoPath: "/icons/bohemika-chrome-symbol.png",
    logoScale: 1.08,
    ghostLogoClass: "p-1",
    tintClass:
      "bg-[radial-gradient(circle_at_20%_18%,rgba(37,99,235,0.22)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(6,182,212,0.16)_0%,transparent_66%)]",
  },
  {
    key: "bsf-aplikace",
    label: "BSF Aplikace",
    href: "https://bsfaplikace.cz/sign/",
    logoPath: "/icons/bohemika-chrome-symbol.png",
    logoScale: 1.08,
    ghostLogoClass: "p-1",
    tintClass:
      "bg-[radial-gradient(circle_at_20%_18%,rgba(79,70,229,0.22)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(34,197,94,0.16)_0%,transparent_66%)]",
  },
  {
    key: "cpp-sus",
    label: "ČPP SUS",
    href: "https://susp-landing-page.cpp.cz/",
    logoPath: "/icons/cpp.png",
    tintClass:
      "bg-[radial-gradient(circle_at_20%_18%,rgba(16,185,129,0.24)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(37,99,235,0.16)_0%,transparent_66%)]",
  },
  {
    key: "allianz-alfa",
    label: "Allianz Alfa",
    href: "https://allfa.allianz.cz/login/?ref=/homepage",
    logoPath: "/icons/allianz.png",
    tintClass:
      "bg-[radial-gradient(circle_at_20%_18%,rgba(37,99,235,0.24)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(99,102,241,0.16)_0%,transparent_66%)]",
  },
  {
    key: "uniqa-unihub",
    label: "UNIQA UniHub",
    href: "https://login.uniqa.cz/",
    logoPath: "/icons/uniqa.png",
    tintClass:
      "bg-[radial-gradient(circle_at_20%_18%,rgba(37,99,235,0.24)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(56,189,248,0.16)_0%,transparent_66%)]",
  },
  {
    key: "kooperativa-knz",
    label: "Kooperativa KNZ",
    href: "https://knz-landing-page.koop.cz/",
    logoPath: "/icons/koop.png",
    tintClass:
      "bg-[radial-gradient(circle_at_20%_18%,rgba(14,165,233,0.24)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(59,130,246,0.16)_0%,transparent_66%)]",
  },
  {
    key: "csob-zeus",
    label: "ČSOB Zeus",
    href: "https://cassell.csobpoj.cz/cas/login?service=https%3A%2F%2Fzeus.csobpoj.cz%2Fzeus%2Flogin%2Fcas",
    logoPath: "/icons/csb.png",
    tintClass:
      "bg-[radial-gradient(circle_at_20%_18%,rgba(245,158,11,0.24)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(234,179,8,0.16)_0%,transparent_66%)]",
  },
  {
    key: "maxima-secure2",
    label: "MAXIMA Secure2",
    href: "https://www.maximapojistovna.cz/pojistenionline/secure2/index.php",
    logoPath: "/icons/maxima.png",
    tintClass:
      "bg-[radial-gradient(circle_at_20%_18%,rgba(239,68,68,0.22)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(37,99,235,0.16)_0%,transparent_66%)]",
  },
  {
    key: "pillow-portal",
    label: "Pillow",
    href: "https://portal.pillow.cz/login",
    logoPath: "/icons/pillow.png",
    tintClass:
      "bg-[radial-gradient(circle_at_20%_18%,rgba(34,197,94,0.24)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(20,184,166,0.16)_0%,transparent_66%)]",
  },
  {
    key: "investika",
    label: "iNVESTiKA",
    href: "https://portal.investika.cz/login",
    logoPath: "/icons/invstk.png",
    tintClass:
      "bg-[radial-gradient(circle_at_20%_18%,rgba(168,85,247,0.24)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(236,72,153,0.16)_0%,transparent_66%)]",
  },
  {
    key: "conseq",
    label: "CONSEQ",
    href: "https://www.conseq.cz/my-conseq/login?returnurl=%2fmy-conseq%2f",
    logoPath: "/icons/conseq.png",
    tintClass:
      "bg-[radial-gradient(circle_at_20%_18%,rgba(37,99,235,0.22)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(239,68,68,0.14)_0%,transparent_66%)]",
  },
  {
    key: "comfort-commodity",
    label: "Comfort Commodity",
    href: "https://eshop.comfort-commodity.cz/#/",
    logoPath: "/icons/cclogo.png",
    logoScale: 1.08,
    ghostLogoClass: "p-3",
    tintClass:
      "bg-[radial-gradient(circle_at_20%_18%,rgba(14,116,144,0.22)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(8,145,178,0.16)_0%,transparent_66%)]",
  },
];

type InstitutionPortalLinksModalProps = {
  onClose: () => void;
};

const resetCardTilt = (card: HTMLAnchorElement) => {
  card.style.setProperty("--portal-card-rotate-x", "0deg");
  card.style.setProperty("--portal-card-rotate-y", "0deg");
  card.style.setProperty("--portal-card-light-x", "50%");
  card.style.setProperty("--portal-card-light-y", "24%");
};

const handleCardPointerMove = (event: ReactPointerEvent<HTMLAnchorElement>) => {
  if (event.pointerType === "touch") return;

  const card = event.currentTarget;
  const bounds = card.getBoundingClientRect();
  const x = Math.min(Math.max((event.clientX - bounds.left) / bounds.width, 0), 1);
  const y = Math.min(Math.max((event.clientY - bounds.top) / bounds.height, 0), 1);

  card.style.setProperty("--portal-card-rotate-x", `${((0.5 - y) * 8).toFixed(2)}deg`);
  card.style.setProperty("--portal-card-rotate-y", `${((x - 0.5) * 10).toFixed(2)}deg`);
  card.style.setProperty("--portal-card-light-x", `${(x * 100).toFixed(1)}%`);
  card.style.setProperty("--portal-card-light-y", `${(y * 100).toFixed(1)}%`);
};

export function InstitutionPortalLinksModal({ onClose }: InstitutionPortalLinksModalProps) {
  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Odkazy na portály institucí"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/58 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Zavřít dialog"
      />

      <div className="pomucky-modal-panel relative z-10 my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[30px] border border-white/75 bg-[linear-gradient(160deg,rgba(255,255,255,0.97)_0%,rgba(248,250,252,0.97)_100%)] p-5 shadow-[0_32px_90px_rgba(2,6,23,0.38)] sm:max-h-[calc(100dvh-3rem)] sm:p-7">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
          aria-label="Zavřít"
        >
          <X className="h-4.5 w-4.5" />
        </button>

        <div className="pr-12">
          <p className="pomucky-modal-category text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-700">
            Obecné
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-slate-950 sm:text-3xl">
            Odkazy
          </h2>
          <p className="mt-2 text-sm text-slate-600 sm:text-base">
            Odkazy na portály institucí.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          {INSTITUTION_PORTAL_TARGETS.map((target) => (
            <a
              key={target.key}
              href={target.href}
              target="_blank"
              rel="noreferrer"
              className={`${styles.portalCard} pomucky-portal-card group relative isolate min-h-[154px] overflow-hidden rounded-2xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/80`}
              onPointerMove={handleCardPointerMove}
              onPointerLeave={(event) => resetCardTilt(event.currentTarget)}
              onPointerCancel={(event) => resetCardTilt(event.currentTarget)}
              onClick={onClose}
            >
              <Image
                src={target.logoPath}
                alt={`Logo ${target.label}`}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                style={{ "--portal-logo-scale": target.logoScale ?? 1 } as CSSProperties}
                className={`${styles.ghostLogo} pointer-events-none object-contain opacity-[0.44] saturate-0 contrast-150 ${target.ghostLogoClass ?? "p-4"}`}
              />
              <div
                className={`${styles.tint} pomucky-portal-tint pointer-events-none absolute inset-0 ${target.tintClass}`}
              />

              <div className={`${styles.content} relative flex h-full flex-col justify-between`}>
                <h3 className="max-w-[calc(100%-3rem)] text-2xl font-bold tracking-[-0.015em] text-slate-900">
                  {target.label}
                </h3>

                <div className="flex justify-end">
                  <span
                    className={`${styles.arrow} pomucky-portal-arrow inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300/90 bg-white/90 text-slate-700 transition group-hover:border-indigo-300 group-hover:bg-indigo-700 group-hover:text-white`}
                  >
                    <ArrowUpRight className="h-4.5 w-4.5" />
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
