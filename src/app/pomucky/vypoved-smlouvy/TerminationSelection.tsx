import { Building2, CalendarDays, Check, ChevronLeft, ChevronRight, FileCheck2, FilePenLine, FileText, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PartnerLogoSculpture } from "@/components/PartnerLogoSculpture";
import { institutionLogoImageClass, institutionLogoKeyFromPath } from "@/app/lib/institutionLogoDisplay";
import type { InsuranceType, TerminationReason, TerminationReasonOption } from "./universalTermination";
import styles from "./termination.module.css";

type StepId = "insurer" | "type" | "reason";
type Props<Insurer extends string> = {
  step: number;
  steps: readonly { id: StepId; label: string }[];
  completed: boolean;
  insurer: Insurer | null;
  insuranceType: InsuranceType | null;
  reason: TerminationReason | null;
  insurers: readonly { label: Insurer; logoPath: string; logoClass: string }[];
  insuranceTypes: readonly { id: InsuranceType; label: string; description: string; icon: LucideIcon }[];
  reasons: readonly TerminationReasonOption[];
  error: string | null;
  onInsurerChange: (insurer: Insurer) => void;
  onInsuranceTypeChange: (type: InsuranceType) => void;
  onReasonChange: (reason: TerminationReason) => void;
  onPrevious: () => void;
  onNext: () => void;
};

const STEP_COPY: Record<StepId, { title: string; description: string }> = {
  insurer: { title: "U které pojišťovny je smlouva?", description: "Vyber pojišťovnu. Podle ní připravíme dostupné možnosti ukončení." },
  type: { title: "Jaký typ pojištění ukončuješ?", description: "Zvol druh smlouvy, pro kterou chceš připravit výpověď." },
  reason: { title: "Jak chceš smlouvu ukončit?", description: "Vyber variantu výpovědi podle konkrétní smlouvy a situace klienta." },
};
const REASON_ICONS: Record<TerminationReason, LucideIcon> = {
  anniversary: CalendarDays, periodEnd: CalendarDays, twoMonths: FileText,
  agreement: FileCheck2, postClaim: ShieldCheck, otherReason: FilePenLine,
};

export function TerminationSelection<Insurer extends string>({
  step, steps, completed, insurer, insuranceType, reason, insurers, insuranceTypes, reasons,
  error, onInsurerChange, onInsuranceTypeChange, onReasonChange, onPrevious, onNext,
}: Props<Insurer>) {
  const currentStep = steps[step]?.id ?? "insurer";
  const copy = STEP_COPY[currentStep];
  const selectedType = insuranceTypes.find(item => item.id === insuranceType);
  const selectedReason = reasons.find(item => item.id === reason);
  const selectedInsurer = insurers.find(item => item.label === insurer);
  const summary = [
    { label: "Pojišťovna", value: insurer, icon: Building2 },
    { label: "Typ pojištění", value: selectedType?.label, icon: ShieldCheck },
    ...(steps.some(item => item.id === "reason") ? [{ label: "Varianta výpovědi", value: selectedReason?.label, icon: CalendarDays }] : []),
  ];

  return <section className={styles.selection} aria-label="Výběr výpovědi">
    <ol className={styles.steps} aria-label="Postup přípravy výpovědi">
      {steps.map((item, index) => {
        const done = step > index || completed;
        return <li key={item.id} data-active={step === index && !completed} data-done={done} aria-current={step === index && !completed ? "step" : undefined}>
          <span className={styles.stepNumber}>{done ? <Check size={15} aria-hidden="true" /> : String(index + 1).padStart(2, "0")}</span>
          <span><small>{done ? "Vybráno" : step === index ? "Právě vybíráš" : "Další krok"}</small><strong>{item.label}</strong></span>
          {index < steps.length - 1 && <ChevronRight className={styles.stepArrow} size={16} aria-hidden="true" />}
        </li>;
      })}
    </ol>

    <div className={styles.selectionLayout}>
      <div className={styles.choicePanel}>
        <div className={styles.stepIntro}>
          <p className={styles.eyebrow}>Krok {step + 1} z {steps.length}</p>
          <h2 id="termination-selection-heading">{copy.title}</h2>
          <p>{copy.description}</p>
        </div>

        {currentStep === "insurer" && <div className={styles.insurerGrid} role="group" aria-labelledby="termination-selection-heading">
          {insurers.map((item, index) => <button key={item.label} type="button" className={styles.insurerCard} data-selected={insurer === item.label}
            aria-label={`Vybrat pojišťovnu ${item.label}`} aria-pressed={insurer === item.label} onClick={() => onInsurerChange(item.label)}>
            <span className={styles.choiceCheck} aria-hidden="true">{insurer === item.label && <Check size={12} />}</span>
            <span className={styles.insurerLogo} aria-hidden="true"><PartnerLogoSculpture
              src={item.logoPath} label={item.label} index={index}
              imageClassName={`${styles.logoArtwork} ${institutionLogoImageClass(institutionLogoKeyFromPath(item.logoPath))}`}
            /></span>
            {item.label === "Direct" && <span className={styles.onlineBadge}>Online · bez podpisu</span>}
          </button>)}
        </div>}

        {currentStep === "type" && <div className={styles.typeGrid} role="group" aria-labelledby="termination-selection-heading">
          {insuranceTypes.map(item => {
            const Icon = item.icon;
            return <button key={item.id} type="button" className={styles.typeCard} data-selected={insuranceType === item.id}
              aria-pressed={insuranceType === item.id} onClick={() => onInsuranceTypeChange(item.id)}>
              <span className={styles.typeIcon}><Icon size={25} strokeWidth={1.5} aria-hidden="true" /></span>
              <span className={styles.choiceCheck} aria-hidden="true">{insuranceType === item.id && <Check size={12} />}</span>
              <strong>{item.label}</strong><span>{item.description}</span>
              <span className={styles.cardAction}>{insuranceType === item.id ? "Vybráno" : "Vybrat pojištění"}<ChevronRight size={14} aria-hidden="true" /></span>
            </button>;
          })}
        </div>}

        {currentStep === "reason" && <div className={styles.reasonGrid} role="group" aria-labelledby="termination-selection-heading">
          {reasons.map(item => {
            const Icon = REASON_ICONS[item.id];
            return <button key={item.id} type="button" className={styles.reasonCard} data-selected={reason === item.id}
              aria-pressed={reason === item.id} onClick={() => onReasonChange(item.id)}>
              <span className={styles.reasonIcon}><Icon size={21} strokeWidth={1.6} aria-hidden="true" /></span>
              <span>{item.label}</span>
              <span className={styles.reasonCheck} aria-hidden="true">{reason === item.id ? <Check size={14} /> : <ChevronRight size={15} />}</span>
            </button>;
          })}
        </div>}

        {error && <p className={styles.formError} role="alert">{error}</p>}
        {completed && <p className={styles.completedNote} role="status"><Check size={15} aria-hidden="true" />Výběr je připravený pro další krok.</p>}

        <div className={styles.selectionFooter}>
          <span className={styles.footerHint}><FileText size={15} aria-hidden="true" />Údaje klienta doplníš v dokumentu</span>
          <div className={styles.navigation}>
            {step > 0 && <button type="button" className={styles.secondaryButton} onClick={onPrevious}><ChevronLeft size={16} aria-hidden="true" />Zpět</button>}
            <button type="button" className={styles.primaryButton} onClick={onNext}>{step < steps.length - 1 ? "Pokračovat" : "Dokončit výběr"}<ChevronRight size={16} aria-hidden="true" /></button>
          </div>
        </div>
      </div>

      <aside className={styles.summary} aria-label="Shrnutí výběru">
        <div className={styles.summaryHeading}><span><FileText size={18} strokeWidth={1.7} aria-hidden="true" /></span><div><p className={styles.eyebrow}>Průběžný přehled</p><h3>Tvoje výpověď</h3></div></div>
        <div className={styles.summaryDocument} aria-hidden="true">
          <span className={styles.documentFold} />
          {selectedInsurer ? <span className={styles.summaryLogo}><PartnerLogoSculpture
            src={selectedInsurer.logoPath} label={selectedInsurer.label} index={0}
            imageClassName={`${styles.logoArtwork} ${institutionLogoImageClass(institutionLogoKeyFromPath(selectedInsurer.logoPath))}`}
          /></span> : <span className={styles.documentLabel}>VÝPOVĚĎ SMLOUVY</span>}
          <i /><i /><i /><span className={styles.documentSignature} />
        </div>
        <dl className={styles.summaryList}>{summary.map(({ label, value, icon: Icon }) => <div key={label} data-filled={!!value}>
          <dt><Icon size={14} strokeWidth={1.7} aria-hidden="true" />{label}</dt><dd>{value || "Zatím nevybráno"}</dd>
        </div>)}</dl>
        <div className={styles.summaryNote}><FilePenLine size={17} aria-hidden="true" /><p>Po dokončení výběru doplníš údaje a připravíš dokument k tisku nebo stažení.</p></div>
      </aside>
    </div>
  </section>;
}
