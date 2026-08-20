import type { Metadata } from "next";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Jakub Rauscher | Manažer",
  description:
    "Osobní vizitka Jakuba Rauschera. Specializace na komplexní pojištění, investice a drahé kovy.",
  alternates: {
    canonical: "/jakubrauscher",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    locale: "cs_CZ",
    url: "/jakubrauscher",
    title: "Jakub Rauscher | Manažer",
    description:
      "Osobní vizitka Jakuba Rauschera. Specializace na komplexní pojištění, investice a drahé kovy.",
  },
};

const highlightBadges = [
  "Komplexní pojištění",
  "Investiční strategie",
  "Zlato a stříbro",
] as const;

const specializations = [
  {
    title: "Komplexní pojištění",
    description:
      "Nastavení ochrany příjmů, majetku i odpovědnosti tak, aby krytí drželo i při zásadních životních změnách.",
    label: "01",
  },
  {
    title: "Investiční strategie",
    description:
      "Návrh dlouhodobé investiční cesty podle cílů, horizontu a rizikového profilu klienta.",
    label: "02",
  },
  {
    title: "Investice do zlata a stříbra",
    description:
      "Zařazení fyzických drahých kovů jako stabilizační složky portfolia a ochrany hodnoty majetku.",
    label: "03",
  },
] as const;

const processSteps = [
  {
    title: "Analýza",
    description:
      "Detailní mapování stávající situace, závazků, cílů a priorit.",
  },
  {
    title: "Strategie",
    description:
      "Návrh řešení s jasnou strukturou a důrazem na dlouhodobou udržitelnost.",
  },
  {
    title: "Servis",
    description:
      "Pravidelná revize nastavení, aktualizace podle změn v životě i trhu.",
  },
] as const;

export default function JakubRauscherPage() {
  return (
    <main className={styles.page}>
      <div aria-hidden className={styles.orbTop} />
      <div aria-hidden className={styles.orbBottom} />

      <div className={styles.shell}>
        <section className={styles.hero}>
          <div className={`${styles.heroContent} ${styles.reveal} ${styles.delayOne}`}>
            <p className={styles.eyebrow}>Osobní vizitka | Bohemika</p>

            <h1 className={styles.title}>
              Jakub Rauscher
              <span className={styles.role}>Manažer</span>
            </h1>

            <p className={styles.lead}>
              Specializace na komplexní pojištění a investice, investice do
              zlata a stříbra.
            </p>

            <ul className={styles.badges} aria-label="Hlavní zaměření">
              {highlightBadges.map((item) => (
                <li key={item} className={styles.badge}>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <aside className={`${styles.identityCard} ${styles.reveal} ${styles.delayTwo}`}>
            <p className={styles.cardOverline}>Osobní přístup</p>
            <h2 className={styles.cardTitle}>Strategie, které dávají smysl i za deset let</h2>
            <p className={styles.cardText}>
              Každý návrh stavím na propojení řízení rizik, tvorby rezerv a
              dlouhodobého růstu kapitálu.
            </p>
            <div className={styles.cardLine} />
            <ul className={styles.identityList}>
              <li>Komplexní ochrana majetku a příjmů</li>
              <li>Systematické budování finanční stability</li>
              <li>Důraz na srozumitelnost a dlouhodobý servis</li>
            </ul>
          </aside>
        </section>

        <section className={`${styles.section} ${styles.reveal} ${styles.delayThree}`}>
          <p className={styles.sectionKicker}>Specializace</p>
          <h2 className={styles.sectionTitle}>Oblasti, kde přináším největší hodnotu</h2>
          <div className={styles.pillarGrid}>
            {specializations.map((item) => (
              <article key={item.title} className={styles.pillarCard}>
                <span className={styles.pillarLabel}>{item.label}</span>
                <h3 className={styles.pillarTitle}>{item.title}</h3>
                <p className={styles.pillarText}>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={`${styles.section} ${styles.reveal} ${styles.delayFour}`}>
          <p className={styles.sectionKicker}>Pracovní model</p>
          <h2 className={styles.sectionTitle}>Jasný postup od prvního setkání po dlouhodobou péči</h2>
          <ol className={styles.processGrid}>
            {processSteps.map((step, index) => (
              <li key={step.title} className={styles.processCard}>
                <span className={styles.processIndex}>{String(index + 1).padStart(2, "0")}</span>
                <h3 className={styles.processTitle}>{step.title}</h3>
                <p className={styles.processText}>{step.description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={`${styles.signature} ${styles.reveal} ${styles.delayFive}`}>
          <p>
            Profesionální řešení vzniká tehdy, když se spojí precizní analýza,
            disciplína a dlouhodobé partnerství.
          </p>
        </section>
      </div>
    </main>
  );
}
