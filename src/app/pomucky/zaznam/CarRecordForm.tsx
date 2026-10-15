// src/app/pomucky/zaznam/CarRecordForm.tsx
"use client";

import styles from "./record.module.css";
import carStyles from "./carRecordForm.module.css";
import { CarRecordIllustration } from "./CarRecordIllustration";
import type { ClientGender } from "./recordClientTexts";

import { useId, useState } from "react";
import {
  ArrowRight, CarFront, Check, CloudLightning, FileCheck2, Gauge, KeyRound,
  Luggage, PawPrint, ShieldCheck, SprayCan, Truck, Wrench, type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { writeMeetingRecord, type MeetingRecordContext } from "@/app/lib/meetingRecordPrivacy";

type Mode = "srovnavac" | "portal";

const LIABILITY_LIMITS = [
  "50 / 50 mil. Kč",
  "70 / 70 mil. Kč",
  "100 / 100 mil. Kč",
  "150 / 150 mil. Kč",
  "200 / 200 mil. Kč",
  "250 / 250 mil. Kč",
];

const ANNUAL_MILEAGE = [
  "Do 5 000",
  "6 000",
  "7 000",
  "8 000",
  "9 000",
  "10 000",
  "11 000",
  "12 000",
  "13 000",
  "14 000",
  "15 000",
  "16 000",
  "17 000",
  "18 000",
  "19 000",
  "20 000",
  "21 000",
  "22 000",
  "23 000",
  "24 000",
  "25 000",
  "Nad 25 000",
];

const DEDUCTIBLES = [
  "2 000 Kč",
  "3 000 Kč",
  "5 000 Kč",
  "10 000 Kč",
  "20 000 Kč",
  "25 000 Kč",
  "50 000 Kč",
  "2 % min. 2 000 Kč",
  "3 % min. 3 000 Kč",
  "5 % min. 5 000 Kč",
  "10 % min. 10 000 Kč",
  "15 % min. 15 000 Kč",
  "20 % min. 20 000 Kč",
  "20 % min. 50 000 Kč",
  "30 % min. 50 000 Kč",
];

type CoverageOption = {
  id: string;
  label: string;
  icon: LucideIcon;
  enabled: boolean;
  onChange: (value: boolean) => void;
};

function CoverageTile({ label, icon: Icon, enabled, onChange }: CoverageOption) {
  return (
    <div className={carStyles.coverageTile} data-active={enabled} role="group" aria-label={label}>
      <button type="button" aria-label={label} aria-pressed={enabled}
        onClick={() => onChange(!enabled)} className={carStyles.coverageToggle}>
        <span className={carStyles.coverageIcon}><Icon size={19} strokeWidth={1.6} aria-hidden="true" /></span>
        <span>{label}</span>
        <span className={carStyles.checkMark} aria-hidden="true">{enabled && <Check size={11} strokeWidth={3} />}</span>
      </button>
    </div>
  );
}

function AmountField({ id, label, value, onChange }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={carStyles.field} htmlFor={id}>
      <span>{label}</span>
      <span className={carStyles.amountInput}>
        <input id={id} type="text" inputMode="decimal" value={value}
          placeholder="0" onChange={event => onChange(event.target.value)} />
        <span aria-hidden="true">Kč</span>
      </span>
    </label>
  );
}

export function CarRecordForm({ owner, clientGender = "male" }: { owner: MeetingRecordContext; clientGender?: ClientGender }) {
  const router = useRouter();
  const formId = useId();

  const [mode, setMode] = useState<Mode>("srovnavac");

  const [hasLiability, setHasLiability] = useState(true);
  const [liabilityLimit, setLiabilityLimit] = useState<string | null>(
    "100 / 100 mil. Kč"
  );

  const [hasCasco, setHasCasco] = useState(false);
  const [cascoAmount, setCascoAmount] = useState("");
  const [cascoWithVat, setCascoWithVat] = useState<"sDPH" | "bezDPH">("sDPH");
  const [cascoDeductible, setCascoDeductible] = useState<string | null>(null);

  const [annualMileage, setAnnualMileage] = useState<string | null>(null);

  const [collisionAnimal, setCollisionAnimal] = useState(false);

  const [animalDamage, setAnimalDamage] = useState(false);

  const [naturalHazard, setNaturalHazard] = useState(false);

  const [glass, setGlass] = useState(false);

  const [theft, setTheft] = useState(false);

  const [vandalism, setVandalism] = useState(false);

  const [replacementCar, setReplacementCar] = useState(false);

  const [assistance, setAssistance] = useState(false);

  const [luggage, setLuggage] = useState(false);

  const [ownDamage, setOwnDamage] = useState(false);

  // slevy
  const [discountCppProfi, setDiscountCppProfi] = useState(false);
  const [discountKoopSupport, setDiscountKoopSupport] = useState(false);
  const [discountOnlyCz, setDiscountOnlyCz] = useState(false);
  const [discountCsobBa, setDiscountCsobBa] = useState(false);
  const [discountSlaviaEmail, setDiscountSlaviaEmail] = useState(false);
  const [discountPillowGarage, setDiscountPillowGarage] = useState(false);
  const [discountUniqaNonOemGlass, setDiscountUniqaNonOemGlass] =
    useState(false);

  const selectedCoverages = [
    collisionAnimal, animalDamage, naturalHazard, glass, theft, vandalism,
    replacementCar, assistance, luggage, ownDamage,
  ].filter(Boolean).length;
  const selectedDiscounts = [
    discountCppProfi, discountKoopSupport, discountOnlyCz, discountCsobBa,
    discountSlaviaEmail, discountPillowGarage, discountUniqaNonOemGlass,
  ].filter(Boolean).length;

  const handleGoToResults = () => {
    if (typeof window !== "undefined") {
      const payload = {
        clientGender,
        hasLiability,
        liabilityLimit,
        hasCasco,
        cascoDeductible,
        assistance,
        assistanceLevel: null,
        annualMileage,
        glass,
        collisionAnimal,
        naturalHazard,
        vandalism,
        animalDamage,
        theft,
        ownDamage,
        discountCppProfi,
        discountUniqaNonOemGlass,
      };
      if (!writeMeetingRecord("carResults", payload, owner)) return;
    }
    router.push("/pomucky/zaznam/vysledky-auto");
  };

  const coverages: CoverageOption[] = [
    { id: `${formId}-collision`, label: "Střet se zvěří", icon: PawPrint, enabled: collisionAnimal, onChange: setCollisionAnimal },
    { id: `${formId}-animal`, label: "Poškození zvířetem", icon: PawPrint, enabled: animalDamage, onChange: setAnimalDamage },
    { id: `${formId}-hazard`, label: "Živel", icon: CloudLightning, enabled: naturalHazard, onChange: setNaturalHazard },
    { id: `${formId}-glass-cover`, label: "Skla", icon: CarFront, enabled: glass, onChange: setGlass },
    { id: `${formId}-theft-cover`, label: "Odcizení", icon: KeyRound, enabled: theft, onChange: setTheft },
    { id: `${formId}-vandalism-cover`, label: "Vandalismus", icon: SprayCan, enabled: vandalism, onChange: setVandalism },
    { id: `${formId}-replacement`, label: "Náhradní vozidlo", icon: CarFront, enabled: replacementCar, onChange: setReplacementCar },
    { id: `${formId}-assistance`, label: "Asistence", icon: Truck, enabled: assistance, onChange: setAssistance },
    { id: `${formId}-luggage-cover`, label: "Zavazadla", icon: Luggage, enabled: luggage, onChange: setLuggage },
    { id: `${formId}-own-damage`, label: "Poškození vlastního vozidla", icon: Wrench, enabled: ownDamage, onChange: setOwnDamage },
  ];
  const discounts = [
    { insurer: "ČPP", label: "Extrabenefit Profi", enabled: discountCppProfi, onChange: setDiscountCppProfi },
    { insurer: "Kooperativa", label: "Mimořádné zvýhodnění – podpora prodeje", enabled: discountKoopSupport, onChange: setDiscountKoopSupport },
    { insurer: "ČPP & Kooperativa", label: "Vozidlo provozováno jen v ČR", enabled: discountOnlyCz, onChange: setDiscountOnlyCz },
    { insurer: "ČSOB", label: "BA score", enabled: discountCsobBa, onChange: setDiscountCsobBa },
    { insurer: "Slavia", label: "Akceptace elektronické komunikace", enabled: discountSlaviaEmail, onChange: setDiscountSlaviaEmail },
    { insurer: "Pillow", label: "Garážované vozidlo", enabled: discountPillowGarage, onChange: setDiscountPillowGarage },
    { insurer: "UNIQA", label: "Sleva za neoriginální sklo", enabled: discountUniqaNonOemGlass, onChange: setDiscountUniqaNonOemGlass },
  ];

  return (
    <div className={carStyles.carForm}>
      <header className={carStyles.intro}>
        <div className={carStyles.introCopy}>
          <p className={carStyles.eyebrow}>Pojištění vozidel</p>
          <h2>Všechno důležité pro klidnou jízdu.</h2>
          <p>Vyber krytí, doplň limity a připrav si podklady pro záznam.</p>
          <div className={carStyles.modePicker} role="group" aria-label="Způsob sjednání">
            <button type="button" aria-pressed={mode === "srovnavac"} onClick={() => setMode("srovnavac")}>Srovnávač</button>
            <button type="button" aria-pressed={mode === "portal"} onClick={() => setMode("portal")}>Portál pojišťovny</button>
          </div>
        </div>
        <div className={carStyles.overviewArt}><CarRecordIllustration /></div>
        {mode === "portal" && <p className={carStyles.portalNote}>Pro portály pojišťoven připravujeme samostatné šablony. Zatím použij nastavení níže jako podklad pro záznam.</p>}
      </header>

      <section className={carStyles.baseSection} aria-labelledby={`${formId}-base-heading`}>
        <div className={carStyles.sectionHeading}>
          <div className={carStyles.headingCopy}><span className={carStyles.step}>01</span><h3 id={`${formId}-base-heading`}>Základ pojištění</h3></div>
          <span className={carStyles.sectionHint}>Krytí a roční nájezd</span>
        </div>
        <div className={carStyles.baseGrid}>
          <div className={carStyles.baseCard} data-active={hasLiability} role="group" aria-label="Povinné ručení">
            <button type="button" className={carStyles.baseToggle} aria-label="Sjednávám povinné ručení"
              aria-pressed={hasLiability} onClick={() => setHasLiability(value => !value)}>
              <span className={carStyles.baseIcon}><ShieldCheck size={21} strokeWidth={1.6} aria-hidden="true" /></span>
              <span>Povinné ručení<small>Škody na zdraví a majetku</small></span>
              <span className={carStyles.checkMark} aria-hidden="true">{hasLiability && <Check size={11} strokeWidth={3} />}</span>
            </button>
            {hasLiability && <label className={carStyles.field} htmlFor={`${formId}-liability-limit`}>
              <span>Limit plnění (zdraví / majetek)</span>
              <select id={`${formId}-liability-limit`} value={liabilityLimit ?? ""} onChange={event => setLiabilityLimit(event.target.value)}>
                {LIABILITY_LIMITS.map(option => <option key={option}>{option}</option>)}
              </select>
            </label>}
          </div>
          <div className={carStyles.baseCard} data-active={hasCasco} role="group" aria-label="Havarijní pojištění">
            <button type="button" className={carStyles.baseToggle} aria-label="Sjednávám havarijní pojištění"
              aria-pressed={hasCasco} onClick={() => setHasCasco(value => !value)}>
              <span className={carStyles.baseIcon}><CarFront size={21} strokeWidth={1.6} aria-hidden="true" /></span>
              <span>Havarijní pojištění<small>Ochrana vlastního vozidla</small></span>
              <span className={carStyles.checkMark} aria-hidden="true">{hasCasco && <Check size={11} strokeWidth={3} />}</span>
            </button>
            {hasCasco && <div className={carStyles.cascoFields}>
              <AmountField id={`${formId}-casco-amount`} label="Pojistná částka (Kč)" value={cascoAmount} onChange={setCascoAmount} />
              <div className={carStyles.options} role="group" aria-label="DPH pojistné částky">
                <button type="button" aria-pressed={cascoWithVat === "sDPH"} onClick={() => setCascoWithVat("sDPH")}>S DPH</button>
                <button type="button" aria-pressed={cascoWithVat === "bezDPH"} onClick={() => setCascoWithVat("bezDPH")}>Bez DPH</button>
              </div>
              <label className={carStyles.field} htmlFor={`${formId}-deductible`}>
                <span>Spoluúčast</span>
                <select id={`${formId}-deductible`} value={cascoDeductible ?? ""} onChange={event => setCascoDeductible(event.target.value || null)}>
                  <option value="">Vyber spoluúčast</option>
                  {DEDUCTIBLES.map(option => <option key={option}>{option}</option>)}
                </select>
              </label>
            </div>}
          </div>
          <div className={`${carStyles.baseCard} ${carStyles.mileageCard}`}>
            <div className={carStyles.baseToggle}>
              <span className={carStyles.baseIcon}><Gauge size={21} strokeWidth={1.6} aria-hidden="true" /></span>
              <span>Roční nájezd<small>Pro Allianz a Pillow</small></span>
            </div>
            <label className={carStyles.field} htmlFor={`${formId}-mileage`}>
              <span>Předpokládaný nájezd (km)</span>
              <select id={`${formId}-mileage`} value={annualMileage ?? ""} onChange={event => setAnnualMileage(event.target.value || null)}>
                <option value="">Nevybráno</option>
                {ANNUAL_MILEAGE.map(option => <option key={option} value={option}>{option} km</option>)}
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className={carStyles.panel} aria-labelledby={`${formId}-covers-heading`}>
        <header className={carStyles.illustratedHeading}>
          <div><div className={carStyles.headingCopy}><span className={carStyles.step}>02</span><h3 id={`${formId}-covers-heading`}>Doplňková krytí</h3><span className={carStyles.count} aria-label={`${selectedCoverages} z ${coverages.length} krytí vybráno`}>{selectedCoverages} / {coverages.length}</span></div><p>Zaškrtni rizika, která sjednáváš.</p></div>
          <CarRecordIllustration variant="coverage" className={carStyles.sectionArt} />
        </header>
        <div className={carStyles.coverageGrid}>
          {coverages.map(option => <CoverageTile key={option.id} {...option} />)}
        </div>
      </section>

      <section className={carStyles.panel} aria-labelledby={`${formId}-discounts-heading`}>
        <header className={carStyles.illustratedHeading}>
          <div><div className={carStyles.headingCopy}><span className={carStyles.step}>03</span><h3 id={`${formId}-discounts-heading`}>Slevy a zvýhodnění</h3><span className={carStyles.count} aria-label={`${selectedDiscounts} z ${discounts.length} slev vybráno`}>{selectedDiscounts} / {discounts.length}</span></div><p>Označ slevy uplatněné při sjednání.</p></div>
          <CarRecordIllustration variant="discounts" className={carStyles.sectionArt} />
        </header>
        <div className={carStyles.discountGrid}>
          {discounts.map(discount => <button key={discount.label} type="button" className={carStyles.discount}
            aria-label={discount.label} aria-pressed={discount.enabled} onClick={() => discount.onChange(!discount.enabled)}>
            <span className={carStyles.discountLabel}><small>{discount.insurer}</small><span>{discount.label}</span></span>
            <span className={carStyles.checkMark} aria-hidden="true">{discount.enabled && <Check size={11} strokeWidth={3} />}</span>
          </button>)}
        </div>
      </section>

      <div className={carStyles.actionBar}>
        <span className={carStyles.actionIcon}><FileCheck2 size={22} strokeWidth={1.5} aria-hidden="true" /></span>
        <div><strong>Podklady máš připravené.</strong><p>{[hasLiability && "Povinné ručení", hasCasco && "Havarijní pojištění"].filter(Boolean).join(" · ") || "Bez základního krytí"} · Krytí: {selectedCoverages} · Slevy: {selectedDiscounts}</p></div>
        <button type="button" onClick={handleGoToResults} className={styles.primaryAction}><span>Výsledky</span><ArrowRight size={16} aria-hidden="true" /></button>
      </div>
    </div>
  );
}

export default CarRecordForm;
