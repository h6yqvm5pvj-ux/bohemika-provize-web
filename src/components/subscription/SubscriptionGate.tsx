"use client";

import type { ReactNode } from "react";

type SubscriptionAccessState = "none" | "active" | "grace" | "blocked";
type SubscriptionBlockReason = "none" | "unpaid" | "expired";

type SubscriptionGateProps = {
  children: ReactNode;
  subscriptionAccessState: SubscriptionAccessState;
  showPaywall: boolean;
  loadingProfile: boolean;
  hasUser: boolean;
  blockReason: SubscriptionBlockReason;
  graceUntilLabel: string;
  paidUntilLabel: string;
  onReloadSubscription: () => void;
  onLogout: () => void;
};

export function SubscriptionGate({
  children,
  subscriptionAccessState,
  showPaywall,
  loadingProfile,
  hasUser,
  blockReason,
  graceUntilLabel,
  paidUntilLabel,
  onReloadSubscription,
  onLogout,
}: SubscriptionGateProps) {
  const showGraceBanner =
    subscriptionAccessState === "grace" &&
    !showPaywall &&
    !loadingProfile &&
    Boolean(graceUntilLabel);

  if (loadingProfile && hasUser) {
    return (
      <>
        {showGraceBanner ? (
          <SubscriptionGraceBanner
            graceUntilLabel={graceUntilLabel}
            paidUntilLabel={paidUntilLabel}
          />
        ) : null}
        <div className="flex w-full min-h-[70vh] items-center justify-center">
          <div
            className="h-14 w-14 animate-spin rounded-full border-[4px] border-current border-t-transparent text-slate-700"
            role="status"
            aria-label="Načítám profil a předplatné"
          />
        </div>
      </>
    );
  }

  if (showPaywall) {
    return (
      <>
        {showGraceBanner ? (
          <SubscriptionGraceBanner
            graceUntilLabel={graceUntilLabel}
            paidUntilLabel={paidUntilLabel}
          />
        ) : null}
        <SubscriptionPaywall
          blockReason={blockReason}
          graceUntilLabel={graceUntilLabel}
          onReloadSubscription={onReloadSubscription}
          onLogout={onLogout}
        />
      </>
    );
  }

  return (
    <>
      {showGraceBanner ? (
        <SubscriptionGraceBanner
          graceUntilLabel={graceUntilLabel}
          paidUntilLabel={paidUntilLabel}
        />
      ) : null}
      {children}
    </>
  );
}

function SubscriptionGraceBanner({
  graceUntilLabel,
  paidUntilLabel,
}: {
  graceUntilLabel: string;
  paidUntilLabel: string;
}) {
  return (
    <div className="fixed bottom-5 right-5 z-40 max-w-md rounded-2xl border border-amber-300 bg-amber-50/95 px-4 py-3 text-sm text-amber-900 shadow-[0_16px_34px_rgba(15,23,42,0.2)] backdrop-blur">
      <p className="font-semibold">Předplatné vypršelo, uhraď prosím platbu.</p>
      <p className="mt-1 text-xs text-amber-800">
        Přístup běží v ochranné lhůtě do{" "}
        <span className="font-semibold">{graceUntilLabel}</span>. Poslední zaplacené období
        skončilo <span className="font-semibold">{paidUntilLabel}</span>.
      </p>
    </div>
  );
}

function SubscriptionPaywall({
  blockReason,
  graceUntilLabel,
  onReloadSubscription,
  onLogout,
}: {
  blockReason: SubscriptionBlockReason;
  graceUntilLabel: string;
  onReloadSubscription: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="w-full max-w-md rounded-3xl border border-white/15 bg-slate-950/90 backdrop-blur-2xl px-6 py-6 sm:px-8 sm:py-8 shadow-[0_24px_80px_rgba(0,0,0,0.9)] space-y-5 text-center">
      <h1 className="text-xl sm:text-2xl font-semibold">
        {blockReason === "unpaid" ? "Účet je nezaplacený" : "Předplatné vypršelo"}
      </h1>
      <p className="text-sm text-slate-200">
        {blockReason === "unpaid"
          ? "Účet je označený jako nezaplacený. Po úhradě platby klikni na načtení profilu."
          : `Ochranná 3denní lhůta už skončila${
              graceUntilLabel ? ` (${graceUntilLabel})` : ""
            }. Pro další používání je potřeba aktivní předplatné.`}
      </p>

      <div className="space-y-3">
        <button
          type="button"
          onClick={onReloadSubscription}
          className="ui-btn-secondary ui-focus w-full rounded-2xl border-white/30 bg-white/10 px-4 py-2.5 text-sm text-slate-50 hover:bg-white/15"
        >
          Mám zaplaceno, načíst znovu
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="ui-btn-secondary ui-focus w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-slate-900 hover:bg-slate-100"
        >
          Zpět na přihlášení
        </button>
      </div>

      <div className="pt-3 border-t border-white/10 text-xs text-slate-300 space-y-1">
        <p>Něco nehraje? Kontaktuj podporu:</p>
        <p>
          E-mail:{" "}
          <a
            href="mailto:jakub.rauscher@bohemika.eu"
            className="underline underline-offset-2"
          >
            jakub.rauscher@bohemika.eu
          </a>
        </p>
        <p>
          Telefon:{" "}
          <a href="tel:+420602127638" className="underline underline-offset-2">
            602 127 638
          </a>
        </p>
      </div>
    </div>
  );
}
