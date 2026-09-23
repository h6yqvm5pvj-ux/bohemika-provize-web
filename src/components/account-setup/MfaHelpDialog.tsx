"use client";

import Image from "next/image";
import { useEffect, useId, useRef } from "react";
import { Apple, CircleHelp, ExternalLink, Play, X } from "lucide-react";

const MICROSOFT_AUTHENTICATOR_APP_STORE_URL =
  "https://apps.apple.com/cz/app/microsoft-authenticator/id983156458";
const MICROSOFT_AUTHENTICATOR_GOOGLE_PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.azure.authenticator";

type MfaHelpDialogProps = {
  onClose: () => void;
};

export function MfaHelpDialog({ onClose }: MfaHelpDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div
      ref={dialogRef}
      onKeyDown={event => {
        if (event.key === "Escape") { event.stopPropagation(); onClose(); }
        if (event.key !== "Tab") return;
        const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button, a[href]") ?? []);
        if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === elements.at(-1)) { event.preventDefault(); elements[0]?.focus(); }
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 px-4 py-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="relative max-h-full w-full max-w-4xl overflow-y-auto rounded-[28px] border border-violet-200/25 bg-[linear-gradient(145deg,#1b1030_0%,#100a20_58%,#0b0717_100%)] p-4 text-white shadow-[0_32px_90px_rgba(4,3,18,0.72),inset_0_1px_0_rgba(255,255,255,0.13)] sm:p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/16 bg-white/[0.06] text-violet-100 transition hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200/80 sm:right-6 sm:top-6"
          aria-label="Zavřít nápovědu"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_252px] lg:items-start">
          <div className="pr-10 sm:pr-12 lg:pr-0">
            <div className="inline-flex self-start items-center gap-2 rounded-full border border-sky-200/30 bg-sky-300/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-100">
              <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
              Rychlá nápověda
            </div>
            <h4 id={titleId} className="mt-6 text-xl font-bold tracking-[-0.02em] text-white sm:text-2xl">
              Jak přidat Bohemka.App do Authenticatoru?
            </h4>
            <p className="mt-3 text-sm leading-relaxed text-violet-100/72">
              Otevři si v mobilu nebo stáhni aplikaci{" "}
              <strong className="font-semibold text-white">Microsoft Authenticator</strong>.
              {" "}Pravděpodobně ji už máš, pokud využíváš portál SUS ČPP nebo KNZ
              KOOPERATIVA.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={MICROSOFT_AUTHENTICATOR_APP_STORE_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-violet-50 transition hover:bg-white/[0.11]"
                aria-label="Otevřít Microsoft Authenticator v App Store"
              >
                <Apple className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                App Store
                <ExternalLink className="h-3 w-3" strokeWidth={2.2} aria-hidden="true" />
              </a>
              <a
                href={MICROSOFT_AUTHENTICATOR_GOOGLE_PLAY_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-violet-50 transition hover:bg-white/[0.11]"
                aria-label="Otevřít Microsoft Authenticator v Google Play"
              >
                <Play className="h-3.5 w-3.5" strokeWidth={2.2} fill="currentColor" aria-hidden="true" />
                Google Play
                <ExternalLink className="h-3 w-3" strokeWidth={2.2} aria-hidden="true" />
              </a>
            </div>

            <div className="mt-8 border-t border-white/10 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-200/70">
                Postup nastavení
              </p>
              <ol className="mt-3 space-y-3">
                <li className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-400/25 text-xs font-bold text-violet-50">
                    1
                  </span>
                  <p className="pt-0.5 text-sm leading-relaxed text-violet-100/82">
                    Otevři aplikaci. V jejím dolním pravém rohu najdi ikonu QR kódu.
                  </p>
                </li>
                <li className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-400/25 text-xs font-bold text-violet-50">
                    2
                  </span>
                  <p className="pt-0.5 text-sm leading-relaxed text-violet-100/82">
                    Klepni na ni a naskenuj QR kód na stránce Bohemka.App. Najdeš ho po zavření této nápovědy.
                  </p>
                </li>
                <li className="flex gap-3 rounded-2xl border border-emerald-200/20 bg-emerald-300/[0.08] p-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-400/25 text-xs font-bold text-emerald-50">
                    3
                  </span>
                  <p className="pt-0.5 text-sm leading-relaxed text-emerald-50/88">
                    V Authenticatoru otevři přidaný účet Bohemka.App. Jeho aktuální
                    šestimístný kód opiš do pole na stránce a klikni na „Potvrdit kód“.
                  </p>
                </li>
              </ol>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-violet-100/72">
              Nastavuješ účet na stejném telefonu? Pod QR kódem najdeš ruční zadání,
              zkopíruj klíč a vlož ho do Authenticatoru.
            </p>
            <button type="button" onClick={onClose}
              className="mt-5 rounded-xl border border-violet-200/30 bg-violet-500/30 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-500/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200/80">
              Zavřít návod a pokračovat
            </button>
          </div>

          <figure>
            <div className="flex h-[380px] items-center justify-center sm:h-[440px] lg:h-[470px]">
              <Image
                src="/icons/microsoft-authenticator-qr-help-purple.png"
                alt="Microsoft Authenticator s vyznačenou ikonou QR kódu v dolním pravém rohu"
                width={853}
                height={1844}
                className="h-full w-full object-contain"
              />
            </div>
            <figcaption className="px-1 pb-1 pt-2 text-center text-[11px] font-medium leading-relaxed text-violet-100/65">
              Ikona QR kódu v Microsoft Authenticatoru
            </figcaption>
          </figure>
        </div>
      </section>
    </div>
  );
}
