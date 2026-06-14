"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

import { OnlineCardMeetingStepper } from "@/components/OnlineCardMeetingStepper";

type MeetingEmbedClientProps = {
  slug: string;
  advisorName: string;
};

export default function MeetingEmbedClient({ slug, advisorName }: MeetingEmbedClientProps) {
  const [submitted, setSubmitted] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_15%_12%,#271245_0%,#110a21_36%,#080715_72%,#05040f_100%)] px-3 py-4 text-white sm:px-4 sm:py-6">
      <div className="pointer-events-none fixed -left-20 top-8 h-72 w-72 rounded-full bg-violet-500/22 blur-[96px] vizitka-ambient-float" />
      <div className="pointer-events-none fixed -right-24 bottom-[-80px] h-80 w-80 rounded-full bg-indigo-500/18 blur-[110px] vizitka-ambient-float [animation-delay:-4.5s]" />

      <section className="relative z-10 mx-auto w-full max-w-xl rounded-[28px] border border-violet-300/25 bg-[radial-gradient(circle_at_80%_0%,rgba(167,139,250,0.24),transparent_34%),linear-gradient(155deg,#160c2a_0%,#100b21_100%)] p-4 shadow-[0_34px_90px_rgba(7,6,25,0.7),inset_0_1px_0_rgba(196,181,253,0.2)] sm:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-200/80">
            Sjednat schůzku
          </p>
          <h1 className="mt-1 text-xl font-bold tracking-[-0.02em] text-white">
            Domluvte si termín
          </h1>
          <p className="mt-1 text-sm text-violet-100/75">
            Vyplňte kontakt a zprávu. {advisorName} se vám v nejbližší době ozve.
          </p>
        </div>

        {submitted ? (
          <div className="mt-5 rounded-2xl border border-emerald-300/35 bg-emerald-400/14 px-4 py-4 text-emerald-50">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Žádost byla odeslána.</p>
                <p className="mt-1 text-sm text-emerald-50/82">
                  Děkujeme, brzy se vám ozveme.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setFormKey((prev) => prev + 1);
                setSubmitted(false);
              }}
              className="mt-4 inline-flex rounded-full border border-emerald-100/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/16"
            >
              Odeslat další žádost
            </button>
          </div>
        ) : (
          <OnlineCardMeetingStepper
            key={formKey}
            slug={slug}
            onSubmitted={() => setSubmitted(true)}
          />
        )}
      </section>
    </main>
  );
}
