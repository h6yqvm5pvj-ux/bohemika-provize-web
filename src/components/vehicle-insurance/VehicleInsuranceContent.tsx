"use client";

import {
  ArrowDown, ArrowUpRight, BadgeCheck, CarFront, Check, CheckCircle2,
  CircleHelp, ClipboardCheck, CloudLightning, FileCheck2, KeyRound,
  LifeBuoy, MapPin, PawPrint, ScanLine, ShieldCheck, WalletCards, Wrench, X,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { OnlineCardMeetingForm } from "@/components/OnlineCardMeetingForm";
import type { OnlineCardLocale } from "@/lib/onlineCardI18n";
import themeStyles from "../life-insurance/lifeInsuranceTheme.module.css";
import styles from "./VehicleInsurance.module.css";
import { VEHICLE_COPY } from "./vehicleInsuranceCopy";

const GLASS_SOURCE_URL = "https://www.koop.cz/pojisteni/pojisteni-vozidel/pojisteni-automobilu/skla";
const WILDLIFE_SOURCE_URL = "https://www.generaliceska.cz/-/srna-index-v-nove-podobe-na-ceskych-silnicich-eviduje-historicky-nejvice-srazene-zvere";
const PROTECTION_ICONS = [ShieldCheck, ScanLine, PawPrint, LifeBuoy] as const;
const ASSISTANCE_ICONS = [Wrench, MapPin, CarFront, LifeBuoy, CloudLightning, KeyRound] as const;
const REVIEW_ICONS = [WalletCards, ShieldCheck, LifeBuoy] as const;

type VehicleInsuranceContentProps = {
  advisorSlug: string;
  theme: "dark" | "light";
  locale: OnlineCardLocale;
};

export function VehicleInsuranceContent({ advisorSlug, theme, locale }: VehicleInsuranceContentProps) {
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [meetingSubmitted, setMeetingSubmitted] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const copy = VEHICLE_COPY[locale];
  const hasAdvisor = /^[a-z0-9-]+$/i.test(advisorSlug);

  const openMeeting = (event: MouseEvent<HTMLButtonElement>) => {
    if (!hasAdvisor) return;
    triggerRef.current = event.currentTarget;
    setMeetingSubmitted(false);
    setMeetingModalOpen(true);
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!meetingModalOpen || !dialog) return;
    dialog.showModal();
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
      trigger?.focus({ preventScroll: true });
    };
  }, [meetingModalOpen]);

  return (
    <main data-theme={theme} className={`${themeStyles.theme} ${styles.content}`}>
      <article className={styles.article}>
        <header className={`${themeStyles.hero} ${styles.hero}`}>
          <div className={styles.heroLayout}>
            <div>
              <p className={styles.eyebrow}><CarFront aria-hidden="true" />{copy.category}</p>
              <h1 className={styles.heroTitle}>{copy.heroTitle}<span>{copy.heroAccent}</span></h1>
              <p className={styles.heroLead}>{copy.heroLead}</p>
              <div className={styles.heroActions}>
                {hasAdvisor ? <button type="button" onClick={openMeeting} className={`${styles.button} ${styles.heroButton}`}>
                  {copy.meetingCta}<ArrowUpRight aria-hidden="true" />
                </button> : null}
                <a href="#review" className={styles.textLink}>{copy.heroCta}<ArrowDown aria-hidden="true" /></a>
              </div>
            </div>
            <div className={styles.heroVisual}>
              <div className={styles.heroArtwork}>
                <Image src="/images/vehicle-insurance/vehicle-hero-v1.webp" alt={copy.vehicleAlt} width={768} height={768} sizes="(max-width: 639px) 280px, (max-width: 900px) 340px, 420px" priority />
              </div>
              <div className={styles.reviewBadge}><FileCheck2 aria-hidden="true" /><span>{copy.reviewKicker}</span></div>
              <ul className={styles.heroFeatures}>
                {copy.reviewFeatures.map((label, index) => {
                  const Icon = REVIEW_ICONS[index];
                  return <li key={label}><Icon aria-hidden="true" />{label}</li>;
                })}
              </ul>
            </div>
          </div>
        </header>

        <section id="review" className={styles.review} aria-labelledby="vehicle-review-title">
          <div>
            <p className={styles.eyebrow}><span>01</span><ClipboardCheck aria-hidden="true" />{copy.reviewKicker}</p>
            <h2 id="vehicle-review-title" className={styles.heading}>{copy.reviewTitle}</h2>
            <div className={styles.experience}>
              <BadgeCheck aria-hidden="true" />
              <div><p className={styles.experienceLabel}>{copy.experienceLabel}</p><p className={styles.experienceQuote}>{copy.reviewExperience}</p><p className={styles.experienceNote}>{copy.reviewNote}</p></div>
            </div>
          </div>
          <ol className={styles.reviewSteps}>
            {copy.reviewSteps.map(([title, detail], index) => <li key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span><div><h3>{title}</h3><p>{detail}</p></div>
            </li>)}
          </ol>
        </section>

        <section id="coverage" className={styles.section} aria-labelledby="vehicle-coverage-title">
          <div className={styles.sectionHead}>
            <div><p className={styles.eyebrow}><span>02</span><ShieldCheck aria-hidden="true" />{copy.coverageKicker}</p><h2 id="vehicle-coverage-title" className={styles.heading}>{copy.coverageTitle}</h2></div>
            <p className={styles.lead}>{copy.coverageLead}</p>
          </div>
          <div className={styles.coverageTable}>
            <table aria-labelledby="vehicle-coverage-title">
              <thead><tr><th scope="col">{copy.coverageHeadEvent}</th><th scope="col">{copy.coverageHeadBase}</th><th scope="col">{copy.coverageHeadBetter}</th></tr></thead>
              <tbody>{copy.coverageRows.map((row, index) => <tr key={row[0]}>
                <th scope="row">{row[0]}</th>
                <td><span className={styles.mobileLabel} aria-hidden="true">{copy.coverageHeadBase}</span><span className={styles.coverageValue}>
                  {index === 0 ? <Check className={styles.positive} aria-hidden="true" /> : index === 4 ? <CircleHelp aria-hidden="true" /> : <X className={styles.negative} aria-hidden="true" />}{row[1]}
                </span></td>
                <td><span className={styles.mobileLabel} aria-hidden="true">{copy.coverageHeadBetter}</span><span className={`${styles.coverageValue} ${styles.better}`}><Check aria-hidden="true" />{row[2]}</span></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className={styles.facts} role="group" aria-label={copy.factsLabel}>
            <div className={styles.fact}><ScanLine aria-hidden="true" /><div><p className={styles.factNumber}>{copy.factGlassNumber}</p><p className={styles.factDescription}>{copy.factGlassDetail}</p><a href={GLASS_SOURCE_URL} target="_blank" rel="noreferrer noopener">{copy.source}: Kooperativa<ArrowUpRight aria-hidden="true" /></a></div></div>
            <div className={styles.fact}><PawPrint aria-hidden="true" /><div><p className={styles.factNumber}>{copy.factWildlifeValue}</p><p className={styles.factDescription}>{copy.factWildlifeLabel}</p><a href={WILDLIFE_SOURCE_URL} target="_blank" rel="noreferrer noopener">{copy.source}: SRNA index<ArrowUpRight aria-hidden="true" /></a></div></div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="vehicle-protection-title">
          <p className={styles.eyebrow}><span>03</span><ShieldCheck aria-hidden="true" />{copy.protectionKicker}</p>
          <h2 id="vehicle-protection-title" className={styles.heading}>{copy.protectionTitle}</h2>
          <div className={styles.protectionGrid}>
            {copy.protectionCards.map(([title, detail, tip], index) => {
              const Icon = PROTECTION_ICONS[index];
              return <div key={title} className={styles.protectionCard}>
                <span className={styles.cardIcon}><Icon aria-hidden="true" /></span><h3>{title}</h3><p>{detail}</p><p className={styles.tip}>{tip}</p>
              </div>;
            })}
          </div>
        </section>

        <section className={`${styles.section} ${styles.assistance}`} aria-labelledby="vehicle-assistance-title">
          <div>
            <p className={styles.eyebrow}><span>04</span><LifeBuoy aria-hidden="true" />{copy.assistanceKicker}</p>
            <h2 id="vehicle-assistance-title" className={styles.heading}>{copy.assistanceTitle}</h2>
            <p className={styles.lead}>{copy.assistanceLead}</p>
            <div className={styles.question}><MapPin aria-hidden="true" /><p>{copy.assistanceQuestion}</p></div>
          </div>
          <ul className={styles.assistanceItems}>
            {copy.assistanceItems.map((item, index) => {
              const Icon = ASSISTANCE_ICONS[index];
              return <li key={item}><Icon aria-hidden="true" /><span>{item}</span></li>;
            })}
          </ul>
        </section>

        <section className={styles.contact} aria-labelledby="vehicle-contact-title">
          <div><p className={styles.eyebrow}><ClipboardCheck aria-hidden="true" />{copy.setupKicker}</p><h2 id="vehicle-contact-title" className={styles.heading}>{copy.setupTitle}</h2><p className={styles.lead}>{copy.setupText}</p></div>
          <div className={styles.contactAction}><p className={styles.contactStrong}>{copy.setupStrong}</p><p className={styles.prepare}><FileCheck2 aria-hidden="true" />{copy.reviewPrepare}</p>
            {hasAdvisor ? <button type="button" onClick={openMeeting} className={styles.button}>{copy.meetingCta}<ArrowUpRight aria-hidden="true" /></button> : null}
          </div>
        </section>
        <footer className={styles.footer}>{copy.footer}</footer>
      </article>
      {meetingModalOpen && hasAdvisor ? <dialog ref={dialogRef} aria-labelledby="vehicle-meeting-title" onCancel={() => setMeetingModalOpen(false)} className={`${themeStyles.meetingDialog} ${styles.dialog}`}>
        <div className={styles.dialogLayout}><div className={`${themeStyles.meetingPanel} ${styles.dialogPanel}`}>
          <div className={styles.dialogHeader}>
            <span className={`${themeStyles.meetingIcon} ${styles.dialogIcon}`}><CarFront aria-hidden="true" /></span>
            <div><p className={styles.eyebrow}>{copy.reviewKicker}</p><h2 id="vehicle-meeting-title" className={styles.dialogTitle}>{copy.meetingTitle}</h2><p className={styles.dialogDescription}>{copy.meetingDescription}</p></div>
            <button type="button" onClick={() => setMeetingModalOpen(false)} className={`${themeStyles.close} ${styles.close}`} aria-label={copy.closeForm}><X aria-hidden="true" /></button>
          </div>
          {meetingSubmitted ? <div className={`${themeStyles.success} ${styles.success}`} role="status"><CheckCircle2 aria-hidden="true" /><div><p>{copy.submitted}</p><p>{copy.thankYou}</p></div></div> : <OnlineCardMeetingForm slug={advisorSlug} locale={locale} palette="bohemika" initialSelectedTopics={["vehicle"]} onSubmitted={() => setMeetingSubmitted(true)} />}
        </div></div>
      </dialog> : null}
    </main>
  );
}
