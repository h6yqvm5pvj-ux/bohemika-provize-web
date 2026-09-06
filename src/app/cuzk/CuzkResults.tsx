import { useState, type ReactNode } from "react";
import { Building2, CalendarDays, ChevronDown, Code2, ExternalLink, Grid2X2, Info, Layers3, Map, MapPin } from "lucide-react";
import { CuzkMeasureIllustration } from "./CuzkMeasureIllustration";
import { formatPropertyNumber, propertyMetrics, propertyNumber, propertyText, type DateInsight, type ParcelRow } from "./cuzkResultData";
import styles from "./cuzkResults.module.css";

type Props = {
  address: string;
  addressCode: string;
  buildingCode: string;
  building: Record<string, unknown> | null;
  technical: Record<string, unknown> | null;
  parcels: ParcelRow[];
  addresses: { adresa: string; ruian?: number }[];
  units: Record<string, unknown>[];
  dates: DateInsight[];
  links: { google: string | null; cadastral: string | null; registry: string | null; embed: string | null };
  rawData: unknown;
};

function Fields({ items }: { items: { label: string; value: unknown }[] }) {
  return <dl className={styles.fields}>{items.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{propertyText(value)}</dd></div>)}</dl>;
}

function DetailSection({ title, icon, count, children, open = false }: { title: string; icon: ReactNode; count?: number; children: ReactNode; open?: boolean }) {
  return <details className={styles.detailSection} open={open || undefined}><summary><span className={styles.sectionIcon}>{icon}</span><h3>{title}</h3>{count !== undefined && <span className={styles.count}>{count}</span>}<ChevronDown size={16} className={styles.chevron} aria-hidden="true" /></summary><div className={styles.sectionBody}>{children}</div></details>;
}

export function CuzkResults({ address, addressCode, buildingCode, building, technical, parcels, addresses, units, dates, links, rawData }: Props) {
  const [mapOpen, setMapOpen] = useState(false);
  const metrics = propertyMetrics(technical, parcels);
  const usage = propertyText(building?.zpusobVyuziti ?? building?.druhStavby);
  const town = propertyText(building?.obec);
  const subtitle = [usage, town].filter(value => value !== "Neuvedeno").join(" · ");
  const buildingFields = [
    { label: "Typ stavby", value: building?.typStavby },
    { label: "Způsob využití", value: building?.zpusobVyuziti ?? building?.druhStavby },
    { label: "Obec", value: building?.obec },
    { label: "Část obce", value: building?.castObce },
    { label: "Číslo domovní", value: Array.isArray(building?.cislaDomovni) ? building.cislaDomovni.join(", ") : building?.cisloDomovni ?? building?.cislodomovni },
    { label: "Číslo orientační", value: building?.cisloOrientacni ?? building?.cisloorientacni },
    { label: "Dočasná stavba", value: typeof building?.docasna === "boolean" ? building.docasna ? "Ano" : "Ne" : building?.docasna },
    { label: "Vazba na stavební objekt", value: building?.typVazby ?? building?.typyVazby ?? building?.vazba },
  ];
  return (
    <section className={styles.results} aria-label="Přehled nalezené nemovitosti">
      <header className={styles.overview}>
        <div className={styles.overviewTop}><span className={styles.eyebrow}><Building2 size={15} /> Přehled nemovitosti</span><span className={styles.source}>ČÚZK / RÚIAN</span></div>
        <h2>{address}</h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        <nav className={styles.links} aria-label="Mapy a zdrojová evidence">
          {links.cadastral && <a className={styles.primaryLink} href={links.cadastral} target="_blank" rel="noopener noreferrer"><Layers3 size={15} /> Katastrální mapa <ExternalLink size={12} /></a>}
          {links.google && <a href={links.google} target="_blank" rel="noopener noreferrer"><MapPin size={15} /> Google Mapy <ExternalLink size={12} /></a>}
          {links.registry && <a href={links.registry} target="_blank" rel="noopener noreferrer"><Building2 size={15} /> Detail v registru <ExternalLink size={12} /></a>}
        </nav>
      </header>

      <div className={styles.metricsHeading}><h2>Nemovitost v číslech</h2><p><Info size={13} /> Ilustrace vysvětlují údaje. Tvar a proporce domu jsou schematické.</p></div>
      <div className={styles.metrics}>
        {metrics.map(metric => <article className={styles.metric} data-kind={metric.kind} key={metric.kind}>
          <h3>{metric.label}</h3>
          <CuzkMeasureIllustration kind={metric.kind} className={styles.metricDrawing} />
          <div className={styles.metricValue} data-missing={metric.value === undefined}>{metric.value === undefined ? "Neuvedeno" : <>{formatPropertyNumber(metric.value)}{metric.unit && <span>{metric.unit}</span>}</>}</div>
          <p>{metric.explanation}</p>
        </article>)}
      </div>

      {dates.length > 0 && <section className={styles.timeline} aria-label="Data v evidenci"><h3><CalendarDays size={17} /> Důležitá data</h3><div className={styles.dates}>{dates.map(item => <div key={item.key}><span>{item.label}</span><strong>{item.date.toLocaleDateString("cs-CZ")}</strong><p>{item.hint}</p></div>)}</div></section>}

      <div className={styles.sectionHeading}><h2>Podrobnosti z registru</h2><span>Stavba a související záznamy</span></div>
      <div className={styles.detailColumns}>
        <div className={styles.column}>
          <DetailSection title="Údaje o stavbě" icon={<Building2 size={18} />} open><Fields items={buildingFields} /></DetailSection>
          <DetailSection title="Adresní místa" icon={<MapPin size={18} />} count={addresses.length}>
            {addresses.length ? <ul className={styles.recordList}>{addresses.map((item, index) => <li key={`${item.ruian}-${index}`}><strong>{item.adresa}</strong><span>RÚIAN: {item.ruian ?? "Neuvedeno"}</span></li>)}</ul> : <p className={styles.empty}>Adresní místa nejsou v odpovědi uvedena.</p>}
          </DetailSection>
          <DetailSection title="Jednotky v registru" icon={<Grid2X2 size={18} />} count={units.length}>
            {units.length ? <ul className={styles.recordList}>{units.map((unit, index) => <li key={`${String(unit.id)}-${index}`}><strong>{propertyText(unit.typJednotky) === "Neuvedeno" ? "Jednotka" : propertyText(unit.typJednotky)}</strong><span>ID: {propertyText(unit.id)}</span></li>)}</ul> : <p className={styles.empty}>V odpovědi nejsou uvedeny žádné jednotky. Počet bytů najdeš samostatně v přehledu výše.</p>}
          </DetailSection>
        </div>
        <div className={styles.column}>
          <DetailSection title="Parcely a pozemky" icon={<Layers3 size={18} />} count={parcels.length} open>
            {parcels.length ? <ul className={styles.parcels}>{parcels.map((parcel, index) => {
              const area = propertyNumber(parcel.vymeraM2);
              return <li key={`${parcel.id ?? parcel.parcela}-${index}`}>
                <div className={styles.parcelTop}><CuzkMeasureIllustration kind="land" className={styles.parcelDrawing} /><div><h4>Parcela {parcel.parcela || "bez uvedeného čísla"}</h4>{parcel.typParcely && <span>{parcel.typParcely}</span>}<p>{parcel.druh || "Druh pozemku neuveden"}</p></div></div>
                <div className={styles.parcelMeta}><span>Výměra pozemku</span><strong>{area === undefined ? "Neuvedeno" : `${formatPropertyNumber(area)} m²`}</strong></div>
                {(parcel.katUzemi || parcel.lv != null) && <div className={styles.parcelTags}>{parcel.katUzemi && <span>Katastrální území: {parcel.katUzemi}</span>}{parcel.lv != null && <span>List vlastnictví: {parcel.lv}</span>}</div>}
              </li>;
            })}</ul> : <p className={styles.empty}>V odpovědi nejsou uvedeny žádné parcely.</p>}
          </DetailSection>
          {links.embed && <details className={styles.detailSection} open={mapOpen} onToggle={event => setMapOpen(event.currentTarget.open)}>
            <summary><span className={styles.sectionIcon}><Map size={18} /></span><h3>Poloha na mapě</h3><ChevronDown size={16} className={styles.chevron} aria-hidden="true" /></summary>
            <div className={styles.mapBody}>
              {mapOpen && <iframe title={`Mapa: ${address}`} src={links.embed} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />}
              {links.google && <a className={styles.mapLink} href={links.google} target="_blank" rel="noopener noreferrer">Otevřít větší mapu <ExternalLink size={13} aria-hidden="true" /></a>}
            </div>
          </details>}
        </div>
      </div>
      <DetailSection title="Evidenční a technické údaje" icon={<Code2 size={17} />}>
        <Fields items={[
          { label: "RÚIAN adresní místo", value: addressCode }, { label: "Stavební objekt", value: buildingCode },
          { label: "ISKN budova ID", value: technical?.isknbudovaid }, { label: "Identifikační parcela (ID)", value: technical?.identifikacniparcela },
          { label: "Druh konstrukce (kód)", value: technical?.druhkonstrukcekod },
          { label: "Plocha geometrie (ST_Area)", value: propertyNumber(technical?.["st_area(shape)"]) === undefined ? undefined : `${formatPropertyNumber(propertyNumber(technical?.["st_area(shape)"])!)} m²` },
          { label: "Délka geometrie (ST_Length)", value: propertyNumber(technical?.["st_length(shape)"]) === undefined ? undefined : `${formatPropertyNumber(propertyNumber(technical?.["st_length(shape)"])!)} m` },
        ]} />
        <details className={styles.rawData}><summary>Zobrazit zdrojová data (JSON)</summary><pre>{JSON.stringify(rawData, null, 2)}</pre></details>
      </DetailSection>
    </section>
  );
}
