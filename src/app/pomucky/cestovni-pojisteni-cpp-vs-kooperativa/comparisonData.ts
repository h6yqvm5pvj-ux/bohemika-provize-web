import { Activity, Anchor, Baby, Bike, Briefcase, BriefcaseMedical, CarFront, CircleAlert, Clock3, FileText, Globe2, HeartHandshake, Info, Luggage, PawPrint, Plane, ShieldAlert, ShieldCheck, Snowflake, Stethoscope, Trophy, Users } from "lucide-react";
import { buildMarineRows, MARINE_SECTION } from "./marineData";
import { CPP_RENTAL_CAR_CONFIRMATION } from "./comparisonSources";

export type CppVariantKey = "mini" | "opti" | "maxi";
export type KoopVariantKey = "klasik" | "plus";
export type AxaVariantKey = "reference" | "komfort" | "excelent";
export type InsurerTone = "cpp" | "koop" | "axa";
export type ComparisonSection =
  | "Obecné informace"
  | "Sport a vybavení"
  | "Plavby a jachting"
  | "Léčebné výlohy"
  | "Úrazové pojištění"
  | "Odpovědnost"
  | "Zavazadla"
  | "Let"
  | "Cesta a komplikace"
  | "Pracovní cesta a manuální práce"
  | "Terorismus"
  | "Veterinární léčba";
export type VerdictTone = InsurerTone | "balanced" | "attention";

export type Variant = {
  label: string;
  helper: string;
  treatment: number;
  rescue: number;
  teeth: number;
  companionTotal: number;
  companionDay: number;
  liability: number;
  legal: number | null;
  baggage: number;
  baggageValuables: number | null;
  death: number;
  permanentInjury: number;
  hospitalDay: number;
  hospitalTotal: number;
};

export type ProductValue = {
  headline: string;
  detail: string;
  source?: string;
  keyFact?: {
    label: string;
    value: string;
  };
  points?: string[];
  sections?: Array<{
    label: string;
    text?: string;
    items?: string[];
    emphasis?: "default" | "benefit" | "exclusion";
  }>;
  metric?: number | null;
  badge?: string;
  exclusions?: LiabilityExclusions;
  caution?: string;
};

type LiabilityExclusionGroup = {
  title: string;
  items: string[];
};

export type LiabilityExclusions = {
  insurer: "ČPP" | "Kooperativa" | "AXA";
  source: string;
  scope: string;
  interpretationNote?: string;
  groups: LiabilityExclusionGroup[];
  generalConditionsNote: string;
};

export type TermsDocument = {
  readonly id: string;
  readonly label: string;
  readonly code: string;
  readonly fileName: string;
};

export type ComparisonRow = {
  id: string;
  section: ComparisonSection;
  icon: typeof Stethoscope;
  title: string;
  description: string;
  verdict: {
    tone: VerdictTone;
    label: string;
    detail: string;
  };
  differences?: Array<{
    label: string;
    cpp: string;
    koop: string;
    axa: string;
    advantage: InsurerTone | "neutral";
  }>;
  sharedPoints?: string[];
  cpp: ProductValue;
  koop: ProductValue;
  axa: ProductValue;
};

export const CPP_VARIANTS: Record<CppVariantKey, Variant> = {
  mini: {
    label: "MINI",
    helper: "Základní limity",
    treatment: 2_500_000,
    rescue: 2_500_000,
    teeth: 7_000,
    companionTotal: 10_000,
    companionDay: 2_000,
    liability: 2_500_000,
    legal: 50_000,
    baggage: 15_000,
    baggageValuables: 5_000,
    death: 100_000,
    permanentInjury: 200_000,
    hospitalDay: 0,
    hospitalTotal: 0,
  },
  opti: {
    label: "OPTI",
    helper: "Střední varianta",
    treatment: 10_000_000,
    rescue: 10_000_000,
    teeth: 20_000,
    companionTotal: 20_000,
    companionDay: 2_500,
    liability: 5_000_000,
    legal: 200_000,
    baggage: 25_000,
    baggageValuables: 8_000,
    death: 200_000,
    permanentInjury: 400_000,
    hospitalDay: 0,
    hospitalTotal: 0,
  },
  maxi: {
    label: "MAXI",
    helper: "Nejvyšší limity",
    treatment: 100_000_000,
    rescue: 100_000_000,
    teeth: 30_000,
    companionTotal: 30_000,
    companionDay: 3_000,
    liability: 10_000_000,
    legal: 500_000,
    baggage: 50_000,
    baggageValuables: 10_000,
    death: 500_000,
    permanentInjury: 1_000_000,
    hospitalDay: 0,
    hospitalTotal: 0,
  },
};

export const KOOP_VARIANTS: Record<KoopVariantKey, Variant> = {
  klasik: {
    label: "KLASIK",
    helper: "Základní varianta",
    treatment: 10_000_000,
    rescue: 500_000,
    teeth: 20_000,
    companionTotal: 10_000,
    companionDay: 2_000,
    liability: 5_000_000,
    legal: null,
    baggage: 30_000,
    baggageValuables: null,
    death: 200_000,
    permanentInjury: 400_000,
    hospitalDay: 500,
    hospitalTotal: 7_500,
  },
  plus: {
    label: "PLUS",
    helper: "Vyšší varianta",
    treatment: 100_000_000,
    rescue: 1_000_000,
    teeth: 30_000,
    companionTotal: 15_000,
    companionDay: 3_000,
    liability: 8_000_000,
    legal: 200_000,
    baggage: 50_000,
    baggageValuables: null,
    death: 400_000,
    permanentInjury: 600_000,
    hospitalDay: 1_000,
    hospitalTotal: 15_000,
  },
};

export const AXA_VARIANTS: Record<AxaVariantKey, Variant> = {
  reference: {
    label: "REFERENCE",
    helper: "Základní zdravotní krytí",
    treatment: 2_500_000,
    rescue: 2_500_000,
    teeth: 6_000,
    companionTotal: 0,
    companionDay: 0,
    liability: 0,
    legal: null,
    baggage: 0,
    baggageValuables: null,
    death: 0,
    permanentInjury: 0,
    hospitalDay: 0,
    hospitalTotal: 0,
  },
  komfort: {
    label: "KOMFORT",
    helper: "Rozšířená varianta",
    treatment: 15_000_000,
    rescue: 15_000_000,
    teeth: 11_000,
    companionTotal: 0,
    companionDay: 0,
    liability: 5_000_000,
    legal: 20_000,
    baggage: 30_000,
    baggageValuables: null,
    death: 250_000,
    permanentInjury: 500_000,
    hospitalDay: 0,
    hospitalTotal: 0,
  },
  excelent: {
    label: "EXCELENT",
    helper: "Nejvyšší varianta",
    treatment: 500_000_000,
    rescue: 500_000_000,
    teeth: 20_000,
    companionTotal: 0,
    companionDay: 0,
    liability: 25_000_000,
    legal: 100_000,
    baggage: 60_000,
    baggageValuables: null,
    death: 500_000,
    permanentInjury: 1_000_000,
    hospitalDay: 0,
    hospitalTotal: 0,
  },
};

export const CPP_TERMS_DOCUMENTS = [
  { id: "cpp-travel-ipid-1-cp-cp2-2023", label: "Informační dokument IPID", code: "IPID 1/CP/CP2/2023", fileName: "IPID_Cestovni_pojisteni_CPP_1_23.pdf" },
  { id: "cpp-travel-vppcp", label: "Všeobecné podmínky", code: "VPPCP 1/18", fileName: "VPPCP.pdf" },
  { id: "cpp-travel-dppap", label: "Auto PLUS", code: "DPPAP 1/18", fileName: "DPPAP.pdf" },
  { id: "cpp-travel-dppcov-1-23", label: "Covid PLUS", code: "DPPCOV 1/23", fileName: "DPPCOV_1_23.pdf" },
  { id: "cpp-travel-dppcp-2022-06", label: "Cesta PLUS", code: "DPPCP 1/22", fileName: "DPPCP_2022_06.pdf" },
  { id: "cpp-travel-dppgp-2022-06", label: "Golf PLUS", code: "DPPGP 1/22", fileName: "DPPGP_2022_06.pdf" },
  { id: "cpp-travel-dppgup", label: "Guard PLUS", code: "DPPGUP 1/20", fileName: "DPPGUP.pdf" },
  { id: "cpp-travel-dppletp", label: "Let PLUS", code: "DPPLETP 1/18", fileName: "DPPLETP.pdf" },
  { id: "cpp-travel-dpplp-1-23", label: "Léto PLUS", code: "DPPLP 1/23", fileName: "DPPLP_1_23.pdf" },
  { id: "cpp-travel-dpplv-1-23", label: "Léčebné výlohy", code: "DPPLV 1/23", fileName: "DPPLV_1_23.pdf" },
  { id: "cpp-travel-dppodc", label: "Odpovědnost", code: "DPPODC 1/18", fileName: "DPPODC.pdf" },
  { id: "cpp-travel-dppstp-1-23", label: "Storno PLUS", code: "DPPSTP 1/23", fileName: "DPPSTP_1_23.pdf" },
  { id: "cpp-travel-dppurc-1-23", label: "Úrazové pojištění", code: "DPPURC 1/23", fileName: "DPPURC_1_23.pdf" },
  { id: "cpp-travel-dppzav-2022-06", label: "Zavazadla", code: "DPPZAV 1/22", fileName: "DPPZAV_2022_06.pdf" },
  { id: "cpp-travel-dppzp-1-23", label: "Zima PLUS", code: "DPPZP 1/23", fileName: "DPPZP_1_23.pdf" },
  { id: "cpp-travel-dppzvp", label: "Zvíře PLUS", code: "DPPZVP 1/18", fileName: "DPPZVP.pdf" },
] as const;

export const KOOP_TERMS_DOCUMENTS = [
  { id: "koop-travel-ipid-07-2023", label: "Informační dokument IPID", code: "KOLUMBUS · 07/2023", fileName: "IPID_Kolumbus_07_2023.pdf" },
  { id: "koop-travel-kolumbus-m750-23", label: "Kompletní podmínky KOLUMBUS", code: "M-750/23", fileName: "koopkolumbus.pdf" },
] as const;

export const AXA_TERMS_DOCUMENTS = [
  { id: "axa-travel-ipid", label: "Informační dokument IPID", code: "Cestovní pojištění 06/2026", fileName: "AXA_IPID.pdf" },
  { id: "axa-travel-vppcp-2026-06-15", label: "Všeobecné pojistné podmínky", code: "VPPCP 15. 6. 2026", fileName: "AXA_VPPCP_2026-06-15.pdf" },
  { id: "axa-travel-overview", label: "Základní informace a limity", code: "Přehled 05/2026", fileName: "AXA_Zakladni_informace.pdf" },
  { id: "axa-travel-cancellation", label: "Storno cesty", code: "Doplňkové pojištění", fileName: "AXA_Storno_cesty.pdf" },
  { id: "axa-travel-risk-sports", label: "Rizikové sporty", code: "Doplňkové pojištění", fileName: "AXA_Rizikove_sporty.pdf" },
  { id: "axa-travel-manual-work", label: "Manuální práce", code: "Doplňkové pojištění", fileName: "AXA_Manualni_prace.pdf" },
  { id: "axa-travel-flight", label: "Cestování letadlem", code: "Doplňkové pojištění", fileName: "AXA_Cestovani_letadlem.pdf" },
  { id: "axa-travel-pets", label: "Domácí mazlíčci", code: "Doplňkové pojištění", fileName: "AXA_Domaci_mazlicci.pdf" },
  { id: "axa-travel-drink", label: "Drink povolen", code: "Doplňkové pojištění", fileName: "AXA_Drink_povolen.pdf" },
  { id: "axa-travel-rental-car", label: "Půjčené vozidlo", code: "Doplňkové pojištění", fileName: "AXA_Pujcene_vozidlo.pdf" },
  { id: "axa-travel-auto-assistance", label: "Autoasistence", code: "Doplňkové pojištění", fileName: "AXA_Autoasistence.pdf" },
] as const;

export const DOCUMENT_GROUPS: ReadonlyArray<{
  tone: InsurerTone;
  insurer: string;
  logoPath: string;
  description: string;
  documents: readonly TermsDocument[];
}> = [
  {
    tone: "cpp",
    insurer: "ČPP",
    logoPath: "/icons/cpp.png",
    description: "1 IPID + 1 všeobecný + 14 doplňkových dokumentů",
    documents: CPP_TERMS_DOCUMENTS,
  },
  {
    tone: "koop",
    insurer: "Kooperativa",
    logoPath: "/icons/koop.png",
    description: "IPID + kompletní podmínky KOLUMBUS",
    documents: KOOP_TERMS_DOCUMENTS,
  },
  {
    tone: "axa",
    insurer: "AXA",
    logoPath: "/icons/axalogo.png",
    description: "IPID + úplné VPP + 9 tematických přehledů",
    documents: AXA_TERMS_DOCUMENTS,
  },
];

export const COMPARISON_SECTIONS: Array<{
  label: ComparisonSection;
  id: string;
  icon: typeof Stethoscope;
}> = [
  { label: "Léčebné výlohy", id: "lecebne-vylohy", icon: Stethoscope },
  { label: MARINE_SECTION, id: "plavby-a-jachting", icon: Anchor },
  { label: "Odpovědnost", id: "odpovednost", icon: ShieldCheck },
  { label: "Obecné informace", id: "obecne-informace", icon: Info },
  { label: "Úrazové pojištění", id: "urazove-pojisteni", icon: Activity },
  { label: "Zavazadla", id: "zavazadla", icon: Luggage },
  { label: "Let", id: "let", icon: Plane },
  { label: "Cesta a komplikace", id: "cesta-a-komplikace", icon: Clock3 },
  { label: "Sport a vybavení", id: "sport-a-vybaveni", icon: Bike },
  { label: "Veterinární léčba", id: "veterinarni-lecba", icon: PawPrint },
  {
    label: "Pracovní cesta a manuální práce",
    id: "pracovni-cesta-a-manualni-prace",
    icon: Briefcase,
  },
  { label: "Terorismus", id: "terorismus", icon: CircleAlert },
];

const CPP_LIABILITY_EXCLUSIONS: LiabilityExclusions = {
  insurer: "ČPP",
  source: "DPPODC 1/18, čl. 7; současně se použijí VPPCP 1/18 a pojistná smlouva",
  scope: "Kompletní přehled zvláštních výluk pojištění odpovědnosti podle čl. 7 DPPODC 1/18.",
  interpretationNote:
    `${CPP_RENTAL_CAR_CONFIRMATION.detail} Jde o zákonnou odpovědnost za škodu na samotné pronajaté věci; krytí zahrnuje i další movité věci od profesionální půjčovny, například sportovní vybavení. Výluka provozu vozidla se uplatní v rozsahu povinného pojištění. Nejde o automatickou úhradu každé smluvní spoluúčasti, pokuty nebo odpovědnosti převzaté nad rámec zákona. U plavidel se samostatně uplatní územní omezení a zvláštní výluky.`,
  groups: [
    {
      title: "Výluky podle čl. 7 odst. 1",
      items: [
        "a) Újma vzniklá uložením nebo uplatňováním finančních sankcí.",
        "b) Újma související s činností, kterou pojištěný vykonává neoprávněně.",
        "c) Újma související s činností, pro kterou zákon ukládá povinné pojištění odpovědnosti, s provozní činností nebo jinou výdělečnou činností.",
        "d) Újma z odpovědnosti převzaté nad rámec právních předpisů.",
        "e) Újma vzniklá prodlením se splněním smluvní povinnosti.",
        "f) Nárok z pojištění odpovědnosti zaměstnavatele při pracovním úrazu nebo nemoci z povolání.",
        "g) Újma na majetku, který pojištěný užívá neoprávněně.",
        "h) Újma způsobená postupným znečištěním životního prostředí.",
      ],
    },
    {
      title: "Vozidla, letadla a plavidla – čl. 7 odst. 2",
      items: [
        "a) Vlastnictví nebo provoz vozidla či plavidla, pokud je náhrada předmětem povinného pojištění odpovědnosti z jejich provozu.",
        "b) Vlastnictví nebo provoz letadel a vozidel na vzduchovém polštáři, včetně konstrukce, oprav nebo instalačních prací na letadlech.",
        "c) Vlastnictví nebo provoz ostatních plavidel.",
      ],
    },
    {
      title: "Další věci a činnosti – čl. 7 odst. 3",
      items: [
        "a) Držba zchátralé nebo neudržované nemovité věci sloužící k přechodnému pobytu během cesty.",
        "b) Újma na převzaté věci; výluka se nepoužije na krytou nemovitost sloužící k přechodnému pobytu, její movité vybavení ani na převzatou zapůjčenou věc.",
        "c) Ztráta, kromě ztráty vzniklé v důsledku smrti, ztráty vědomí nebo úrazu pojištěného.",
        "d) Újma způsobená plavidlem na jiném plavidle, na věcech přepravovaných plavidlem nebo při společné havárii plavidel.",
        "e) Vlastnictví nebo provoz rádiem řízených modelů na nevhodných plochách nebo plochách, které k tomu nejsou určeny.",
        "f) Provoz rádiem řízených modelů v rozporu s místními právními předpisy.",
        "g) Motoristická a letecká sportovní činnost nebo profesionální sportovní činnost.",
        "h) Poškození, zničení nebo pohřešování záznamů na zvukových, obrazových a datových nosičích.",
        "i) Újma na nehmotném majetku.",
        "j) Újma na přirozených právech člověka, která nesouvisí s ublížením na zdraví nebo usmrcením.",
      ],
    },
    {
      title: "Osoby a propojené společnosti – čl. 7 odst. 4",
      items: [
        "a) Újma vzniklá osobám blízkým pojištěnému a osobám jim blízkým.",
        "b) Újma vzniklá osobám zaměstnaným nebo vypomáhajícím v domácnosti pojištěného při výkonu této činnosti.",
        "c) Újma vzniklá právnické osobě, ve které má pojištěný nebo jeho blízcí majetkovou účast nebo ve které je pojištěný statutárním orgánem či společníkem.",
      ],
    },
    {
      title: "Mezinárodní sankce – čl. 7 odst. 5",
      items: [
        "ČPP neposkytne plnění, pokud by tím porušila právní předpisy nebo mezinárodní úmluvy upravující mezinárodní sankce na ochranu míru, bezpečnosti, základních lidských práv nebo boj proti terorismu.",
      ],
    },
  ],
  generalConditionsNote:
    "Vedle těchto zvláštních výluk se použijí také výluky ve VPPCP 1/18, ujednání pojistné smlouvy a právní předpisy.",
};

const KOOP_LIABILITY_EXCLUSIONS: LiabilityExclusions = {
  insurer: "Kooperativa",
  source: "M-750/23, Pojištění odpovědnosti, čl. 5, str. 39–40; obecné výluky str. 55–56",
  scope: "Kompletní přehled zvláštních výluk pojištění odpovědnosti podle čl. 5 podmínek M-750/23.",
  interpretationNote:
    "Výluku věcí, které klient užívá nebo má u sebe, je nutné číst společně s čl. 1: profesionálně pronajatá movitá věc je výslovně kryta do 10 000 Kč. Varianta PLUS navíc hradí do 10 000 Kč spoluúčast na vozidle pronajatém písemnou smlouvou od profesionální autopůjčovny; KLASIK toto krytí nemá.",
  groups: [
    {
      title: "Výluky podle čl. 5 odst. 1",
      items: [
        "a) Újma způsobená úmyslně, včetně svévole nebo škodolibosti.",
        "b) Újma na věci nebo zvířeti, které klient užívá neoprávněně.",
        "c) Újma na movité věci nebo zvířeti, které klient oprávněně užívá nebo má u sebe. Výluka se nepoužije na vymezené věci při praktickém vyučování či stáži, vybavení ubytovacího zařízení a při sjednání také na krytou spoluúčast u pronajatého vozidla.",
        "d) Újma na movité věci nebo zvířeti převzatém ke splnění závazku; výjimkou jsou vymezené věci při praktickém vyučování nebo stáži.",
        "e) Újma způsobená znečištěním životního prostředí.",
        "f) Újma z porušení právní povinnosti nebo jiné skutečnosti, o které klient při uzavření smlouvy věděl nebo mohl vědět.",
        "g) Újma při profesionální sportovní činnosti.",
        "h) Újma při výdělečné činnosti nebo v přímé souvislosti s ní.",
        "i) Pracovní úraz nebo nemoc z povolání, včetně vyjmenovaných náhrad zdravotnímu a nemocenskému pojištění.",
        "j) Újma související s požitím alkoholu nebo aplikací omamných či psychotropních látek.",
        "k) Újma z provozu motorového vozidla nebo plavidla, k jehož vedení je vyžadován průkaz způsobilosti.",
        "l) Újma související s létáním, včetně sportovních létajících zařízení, bezmotorových letadel, balonů, seskoků a letů s padákem.",
        "m) Újma související s činností nebo vztahem, pro které zákon ukládá povinné pojištění odpovědnosti, bez ohledu na vznik nároku z tohoto pojištění.",
        "n) Újma vzniklá zavlečením nebo rozšířením nakažlivé choroby lidí, zvířat nebo rostlin.",
        "o) Újma související s vlastnictvím nebo používáním zbraní, střeliva, pyrotechniky či výbušnin.",
        "p) Újma související s vlastnictvím nebo držbou nemovitosti.",
        "q) Újma způsobená zvířetem vyvezeným či získaným k podnikání nebo chovaným k výdělečným účelům.",
        "r) Újma způsobená divokým nebo exotickým zvířetem.",
        "s) Újma způsobená psem při výkonu práva myslivosti nebo služebním psem při služebním výkonu.",
      ],
    },
    {
      title: "Smluvně rozšířená odpovědnost a sankce – čl. 5 odst. 2",
      items: [
        "a) Újma, pokud klient převzal povinnost k náhradě v širším rozsahu než stanoví zákon, včetně smluvně prodloužené promlčecí lhůty nebo vzdání se námitky promlčení.",
        "b) Pokuty, penále a jiné smluvní, správní nebo trestní sankce či platby represivního, exemplárního nebo preventivního charakteru.",
      ],
    },
    {
      title: "Blízké osoby a propojené společnosti – čl. 5 odst. 3",
      items: [
        "a) Újma, kterou je klient povinen nahradit manželovi, registrovanému partnerovi, sourozenci, příbuzným v přímé řadě nebo osobám žijícím s ním ve společné domácnosti.",
        "b) Újma, kterou je klient povinen nahradit právnické osobě, se kterou je majetkově propojen.",
      ],
    },
    {
      title: "Další výluky – čl. 5 odst. 4",
      items: [
        "Použít se mohou také další výluky uvedené v pojistné smlouvě, ostatních částech pojistných podmínek nebo vyplývající z právních předpisů.",
      ],
    },
  ],
  generalConditionsNote:
    "Zvláštní výluky odpovědnosti neruší obecné výluky M-750/23. Ty se použijí vedle nich, pokud zvláštní ustanovení neurčí jinak.",
};

const AXA_LIABILITY_EXCLUSIONS: LiabilityExclusions = {
  insurer: "AXA",
  source: "AXA VPPCP ze dne 15. 6. 2026, část II čl. 9 a část III oddíl C čl. 2, str. 7–8 a 12–13",
  scope: "Úplný přehled zvláštních výluk odpovědnosti podle oddílu C doplněný o obecné výluky, které se použijí současně.",
  interpretationNote:
    "Základní odpovědnost AXA výslovně vylučuje škodu na vypůjčené, najaté, svěřené nebo za úplatu užívané věci. Škodu na půjčeném sportovním vybavení může při vyjmenovaném nebezpečí řešit pojištění zavazadel; spoluúčast na vozidle z oficiální zahraniční půjčovny řeší samostatné připojištění Půjčené vozidlo do 60 000 Kč.",
  groups: [
    {
      title: "Činnosti, osoby a smluvní závazky",
      items: [
        "Újma související s výkonem povolání, výdělečné či odborné činnosti, studijní stáže nebo dobrovolnictví bez ohledu na odměnu.",
        "Újma rodinným příslušníkům, osobám ve společné domácnosti a spolucestujícím.",
        "Újma z porušení smluvních povinností nebo ze záruk převzatých nad rámec právních předpisů.",
        "Újma související s porušením povinnosti předcházet vzniku újmy a minimalizovat ji.",
      ],
    },
    {
      title: "Vozidla, věci a majetek",
      items: [
        "Újma související s používáním motorových i nemotorových vozidel včetně elektrokoloběžek, plavidel, letadel, modelů a dronů; výjimkou jsou běžné koloběžky, jízdní kola a elektrokola.",
        "Újma na přepravovaném nákladu nebo hotovosti.",
        "Újma na věci vypůjčené, najaté, svěřené, předané k úschově, držení, přepravě či zpracování nebo užívané za úplatu; výjimkou jsou věci ubytovacího zařízení a samotné ubytovací zařízení.",
        "Újma na věci užívané bez právního titulu, proti vůli nebo bez vědomí vlastníka.",
        "Újma související s vlastnictvím, držením, nájmem, správou nebo neoprávněným užíváním nemovitosti včetně svépomocných prací.",
      ],
    },
    {
      title: "Životní prostředí, nemoci, zbraně a zvířata",
      items: [
        "Ekologická újma na životním prostředí.",
        "Újma související s přenesením nebo rozšířením nakažlivé choroby na lidi, zvířata nebo rostliny.",
        "Újma související s vlastnictvím, držením, údržbou nebo používáním zbraní a újma při lovu či výkonu práva myslivosti.",
        "Újma způsobená zvířetem, které klient vlastní nebo s ním cestuje; tato výluka se neuplatní pro psa či kočku při sjednaném připojištění domácích mazlíčků.",
      ],
    },
    {
      title: "Obecné výluky důležité pro odpovědnost",
      items: [
        "Předvídatelná nebo před sjednáním známá újma, úmysl, sebevražda či pokus, výtržnost nebo trestný čin a porušení místních právních předpisů.",
        "Nedodržení bezpečnostních nařízení a doporučení nebo nepoužití předepsaných ochranných pomůcek.",
        "Válka, mise, bojové akce, vzpoura, nepokoje, stávka či zásah veřejné moci; radioaktivní záření a chemická nebo biologická kontaminace.",
        "Epidemie či pandemie s výjimkou covidu-19 a cesta do oblasti, před kterou varuje MZV, WHO nebo obdobná instituce; u varianty EXCELENT se výjimka týká pouze varování kvůli covidu-19.",
        "Souvislost s alkoholem; připojištění Drink povolen odstraňuje tuto výluku pouze u léčebných výloh, nikoli u odpovědnosti. Dále drogy, závislost a psychické poruchy.",
        "Profesionální sport; rizikový sport nebo soutěž a trénink bez příslušného připojištění; manuální práce bez připojištění. Připojištění manuální práce však odpovědnost nerozšiřuje.",
        "Expedice do extrémních či odlehlých oblastí, pyrotechnika, výkon činnosti bezpečnostních a záchranných sborů a řízení bez platného českého oprávnění pro danou kategorii.",
      ],
    },
  ],
  generalConditionsNote:
    "Vedle uvedených bodů se použijí další výluky a povinnosti ve VPPCP, konkrétní pojistné smlouvě a právních předpisech. Tabulka plnění a oddíl K řadí do připojištění rizikových sportů také odpovědnost, ale obecná výluka v části II čl. 9 písm. q) výslovně zmiňuje její neuplatnění pouze u léčebných výloh a úrazu. Pro odpovědnost při rizikovém sportu je proto vhodné vyžádat písemné potvrzení AXA. Manuální práce ani Drink povolen odpovědnost nerozšiřují.",
};

const moneyFormatter = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 0,
});

export function formatMoney(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 1 }).format(millions)} mil. Kč`;
  }
  return moneyFormatter.format(value).replace(/\sKč$/, " Kč");
}

function limitVerdict(cppValue: number, koopValue: number, axaValue: number): ComparisonRow["verdict"] {
  const values = [
    { tone: "cpp" as const, label: "ČPP", value: cppValue },
    { tone: "koop" as const, label: "Kooperativa", value: koopValue },
    { tone: "axa" as const, label: "AXA", value: axaValue },
  ];
  const highest = Math.max(...values.map((entry) => entry.value));
  const winners = values.filter((entry) => entry.value === highest);

  if (winners.length === 1) {
    const winner = winners[0];
    return {
      tone: winner.tone,
      label: `Vyšší limit ${winner.label}`,
      detail: `${formatMoney(winner.value)}; ostatní zvolené varianty mají ${values
        .filter((entry) => entry !== winner)
        .map((entry) => `${entry.label} ${formatMoney(entry.value)}`)
        .join(" a ")}.`,
    };
  }

  if (winners.length === values.length) {
    return {
      tone: "balanced",
      label: "Shodný limit",
      detail: `Všechny zvolené varianty mají limit ${formatMoney(highest)}.`,
    };
  }

  return {
    tone: "balanced",
    label: "Nejvyšší limit je shodný",
    detail: `${winners.map((entry) => entry.label).join(" a ")} mají ${formatMoney(highest)}.`,
  };
}

export function buildRows(cpp: Variant, koop: Variant, axa: Variant): ComparisonRow[] {
  const cppAnimalLimit = cpp.label === "MINI" ? 10_000 : cpp.label === "OPTI" ? 20_000 : 40_000;
  const cppQuarantinePartLimit = cpp.label === "MINI" ? 10_000 : cpp.label === "OPTI" ? 15_000 : 25_000;
  const cppQuarantineTotalLimit = cppQuarantinePartLimit * 2;
  const cppCovidTreatmentLimit = cpp.label === "MINI" ? 200_000 : cpp.label === "OPTI" ? 300_000 : 500_000;
  const cppTerrorismTreatmentLimit = cpp.label === "MINI" ? 200_000 : cpp.label === "OPTI" ? 300_000 : 500_000;
  const cppBorrowedThingLimit = Math.min(cpp.liability * 0.1, 500_000);
  const axaHasExtendedCover = axa.label !== "REFERENCE";
  const axaHasExcelentCover = axa.label === "EXCELENT";
  const axaQuarantineLimit = axa.label === "EXCELENT" ? 60_000 : axa.label === "KOMFORT" ? 30_000 : 0;
  const axaCompanionNight = axa.label === "EXCELENT" ? 200 : axa.label === "KOMFORT" ? 150 : 100;

  const rows: ComparisonRow[] = [
    ...buildMarineRows(cpp, koop, axa, formatMoney),
    {
      id: "territorial-scope",
      section: "Obecné informace",
      icon: Globe2,
      title: "Kam klient cestuje",
      description: "Územní varianta musí být uvedena v pojistné smlouvě. Rozdíl je hlavně ve střední světové zóně.",
      verdict: {
        tone: "koop",
        label: "Kooperativa zahrnuje Kanadu už bez USA",
        detail: "Kooperativa ve variantě Svět bez USA nevylučuje Kanadu. ČPP i AXA mají střední světovou zónu bez USA a Kanady.",
      },
      cpp: {
        headline: "ČR · Evropa · svět bez USA a Kanady · svět",
        detail: "Rozhoduje územní varianta uvedená ve smlouvě",
        source: "ČPP IPID 1/CP/CP2/2023, str. 2; VPPCP 1/18, čl. 3",
        badge: "Obecné informace IPID",
        points: ["Pro cestu do Kanady nestačí varianta Svět mimo USA a Kanadu."],
        metric: null,
      },
      koop: {
        headline: "ČR · Evropa · svět bez USA · svět včetně USA",
        detail: "Kanada spadá už do varianty Svět bez USA",
        source: "Kooperativa IPID KOLUMBUS 07/2023, str. 2; M-750/23, str. 51–52",
        badge: "Obecné informace IPID",
        points: [
          "Evropa zahrnuje také Azory, Madeiru, Baleáry, Kanárské ostrovy, Egypt, Izrael, Jordánsko, Kapverdy, Kypr, Maroko, Tunisko a Turecko.",
          "U některých pojištění nelze zvolit územní platnost ČR; přesný výčet stanoví podmínky.",
        ],
        metric: null,
      },
      axa: {
        headline: "Evropa · svět bez USA a Kanady · svět",
        detail: "Česká republika je s přesně vymezenými výjimkami mimo územní rozsah",
        source: "AXA VPPCP 15. 6. 2026, část II čl. 7, str. 7",
        badge: "Územní zóny",
        points: [
          "Evropa zahrnuje také Izrael, Turecko, Tunisko, Gruzii, Kanárské ostrovy, Egypt a Maroko.",
          "V ČR mohou platit storno, zmeškaný odjezd, vybraná letecká rizika a autoasistence při cestě do zahraničí nebo návratu.",
        ],
        metric: null,
      },
    },
    {
      id: "insurance-duration",
      section: "Obecné informace",
      icon: Clock3,
      title: "Klient potřebuje dlouhou nebo opakovanou ochranu",
      description: "Jednorázové pojištění je nutné odlišit od ročního produktu pro opakované výjezdy.",
      verdict: {
        tone: "balanced",
        label: "Jednorázově téměř rok u všech tří",
        detail: "ČPP uvádí nejvýše 365 dní, KOLUMBUS jeden rok a AXA podle VPP dobu kratší než 365 dní. U opakovaných cest se liší maximální délka jednoho výjezdu.",
      },
      cpp: {
        headline: "až 365 dní",
        detail: "Dlouhodobá nepřetržitá cesta",
        source: "ČPP IPID 1/CP/CP2/2023, str. 2; VPPCP 1/18, čl. 16",
        badge: "Jednorázové pojištění",
        points: ["Pojištění se sjednává na dobu určitou podle potřeb klienta, maximálně 365 dní."],
        metric: null,
      },
      koop: {
        headline: "KOLUMBUS až 1 rok",
        detail: "ABONENT: každá jednotlivá cesta nejvýše 45 dní",
        source: "Kooperativa IPID KOLUMBUS 07/2023, str. 1; M-750/23, str. 7–8 a 51",
        badge: "Jednorázové i roční pojištění",
        points: [
          "Jednorázový KOLUMBUS lze sjednat maximálně na jeden rok.",
          "KOLUMBUS ABONENT a ABONENT RODINA umožňují neomezený počet výjezdů během roku, ale každý nejvýše na 45 po sobě jdoucích kalendářních dní.",
        ],
        metric: null,
      },
      axa: {
        headline: "méně než 365 dní",
        detail: "Opakované výjezdy: každá cesta nejvýše 90 po sobě jdoucích dní",
        source: "AXA VPPCP 15. 6. 2026, část II čl. 1 a 5, str. 1 a 5–6; Základní informace 05/2026",
        badge: "Jednorázové i opakované výjezdy",
        points: [
          "VPP definují jednorázové pojištění jako dobu kratší než 365 dní; stručný přehled používá formulaci od jednoho dne až do jednoho roku.",
          "Opakované výjezdy jsou na dobu neurčitou a umožňují neomezený počet cest, každou maximálně na 90 dní.",
          "Po jednorázové smlouvě delší než 180 dní lze další jednorázové pojištění sjednat nejdříve 30 dní po jejím konci.",
        ],
        metric: null,
      },
    },
    {
      id: "payment-and-cover-start",
      section: "Obecné informace",
      icon: FileText,
      title: "Klient potřebuje vědět, kdy zaplatit a kdy začíná krytí",
      description: "Lhůta k úhradě a okamžik počátku pojištění nejsou totéž. Rozhodující údaje musí být v konkrétní smlouvě.",
      verdict: {
        tone: "attention",
        label: "Zkontrolovat platbu i počátek ve smlouvě",
        detail: "AXA smlouva vzniká zaplacením a při sjednání s počátkem ve stejný den běží čtyřhodinová čekací doba. U všech tří je nutné ověřit údaje konkrétní smlouvy.",
      },
      cpp: {
        headline: "platbu odeslat do 24 hodin",
        detail: "Od vytvoření návrhu pojistné smlouvy",
        source: "ČPP IPID 1/CP/CP2/2023, str. 2",
        badge: "Platba a počátek",
        points: [
          "Datum a čas vytvoření návrhu i lhůta pro přijetí platby jsou uvedeny ve smlouvě.",
          "Pojištění začíná dnem a hodinou počátku uvedenými ve smlouvě, není-li ujednáno jinak.",
        ],
        metric: null,
      },
      koop: {
        headline: "splatné v den uzavření smlouvy",
        detail: "Jednorázové pojistné se hradí na účet a způsobem uvedeným ve smlouvě",
        source: "Kooperativa IPID KOLUMBUS 07/2023, str. 2",
        badge: "Platba a počátek",
        points: [
          "Cestovní pojištění začíná datem a časem počátku uvedenými ve smlouvě.",
          "Pojištění STORNO vzniká až dnem následujícím po úplném zaplacení pojistného.",
        ],
        metric: null,
      },
      axa: {
        headline: "smlouva vzniká zaplacením",
        detail: "Při počátku ve stejný den krytí nejdříve za 4 hodiny",
        source: "AXA IPID, str. 2; VPPCP 15. 6. 2026, část II čl. 3 a 5, str. 5–6",
        badge: "Platba a počátek",
        points: [
          "Běžně jednorázové pojištění začíná v 00:01 dne počátku uvedeného ve smlouvě, pokud bylo pojistné zaplaceno.",
          "Storno a zmeškaný odjezd vznikají u jednorázového pojištění okamžikem zaplacení a končí nástupem cesty.",
        ],
        metric: null,
      },
    },
    {
      id: "general-exclusions-and-duties",
      section: "Obecné informace",
      icon: ShieldAlert,
      title: "Klient potřebuje znát obecné výluky a povinnosti",
      description: "Nejdřív jsou vedle sebe jen skutečné rozdíly. Společné body neopakujeme ve všech třech sloupcích.",
      verdict: {
        tone: "attention",
        label: "Rozhodují čtyři hlavní rozdíly",
        detail: "Nejvýraznější je čekací doba po odjezdu a rozdílný přístup k alkoholu. IPID je však jen souhrn; úplný rozsah určují podmínky konkrétního krytí.",
      },
      differences: [
        {
          label: "Sjednání až po odjezdu",
          cpp: "Bez plnění první 3 kalendářní dny.",
          koop: "Bez plnění prvních 24 hodin.",
          axa: "Při počátku ve stejný den začíná nejdříve 4 hodiny po sjednání. VPP však nemají samostatné ustanovení, které by výslovně potvrzovalo sjednání až po odjezdu.",
          advantage: "neutral",
        },
        {
          label: "Alkohol a návykové látky",
          cpp: "Může krátit plnění až o polovinu; platí výjimka pro řádně předepsaný lék bez varování.",
          koop: "Léčebné výlohy a odpovědnost mají výluku. U běžného úrazového plnění lze krátit až na polovinu; zvláštní dopravní úraz má další výluky.",
          axa: "Obecná výluka; připojištění Drink povolen obnoví jen léčebné výlohy, při nejvýše 0,8 ‰ naměřených do 2 hodin.",
          advantage: "neutral",
        },
        {
          label: "Potíže vzniklé před odjezdem",
          cpp: "DPPLV vylučují známou příčinu onemocnění či změny zdravotního stavu před uzavřením smlouvy, s výjimkou stabilizovaného chronického stavu.",
          koop: "Dřívější úraz, nemoc či příznaky jsou vyloučeny. Výjimkou je akutní zhoršení stabilizovaného chronického onemocnění ohrožující zdraví nebo život, pokud nebyla zanedbána léčba.",
          axa: "Vylučuje dřívější projevené zdravotní potíže; stabilizované chronické onemocnění má vymezenou výjimku, EXCELENT navíc sublimit chronického onemocnění.",
          advantage: "neutral",
        },
        {
          label: "Dlouhá cesta",
          cpp: "Jednorázové pojištění lze sjednat až na 365 dní.",
          koop: "Jednorázový KOLUMBUS až na 1 rok; u ABONENTU neplní od 46. dne jedné cesty.",
          axa: "VPP: jednorázově méně než 365 dní; opakované výjezdy nejvýše 90 dní na jednu cestu.",
          advantage: "neutral",
        },
      ],
      sharedPoints: [
        "Všechny tři produkty vylučují úmyslné jednání a vymezují válečné události.",
        "Všechny tři omezují události spojené s jadernou energií; přesné znění dalších kontaminačních výluk se liší.",
        "U všech rozhoduje sjednaný limit, konkrétní smlouva a zvláštní podmínky daného krytí.",
      ],
      cpp: {
        headline: "Specifika ČPP",
        detail: "Rizikové oblasti, řízení, zimní sporty, kybernetické nebezpečí a expedice",
        source: "ČPP IPID 1/CP/CP2/2023, str. 1–2; DPPLV 1/23, čl. 5–6",
        badge: "Souhrn IPID",
        metric: null,
        sections: [
          {
            label: "Další body uvedené v IPID ČPP",
            items: [
              "Řízení dopravního prostředku bez příslušného oprávnění.",
              "Cesty do oblasti vyhlášené za území se zvýšeným bezpečnostním rizikem.",
              "Lyžování nebo snowboarding na místech, která k tomu nejsou určena.",
              "Podvodné a nepoctivé jednání, zásah úřední moci, aktivní účast na teroristickém činu a neoprávněně užívaný majetek.",
              "Kybernetické nebezpečí, toxické látky, genetické změny, testování dopravních prostředků a expedice do extrémních oblastí.",
            ],
            emphasis: "exclusion",
          },
          {
            label: "Obecné povinnosti klienta",
            items: [
              "Pravdivě odpovídat, hlásit změny a škodu, řádně platit pojistné a oznámit jiné pojištění stejného rizika.",
              "Předcházet škodě, při sportu dodržovat bezpečnost a používat ochranné pomůcky.",
              "Před cestou zajistit povinná a potřebná očkování a lékařské prohlídky.",
            ],
          },
        ],
      },
      koop: {
        headline: "Specifika Kooperativy",
        detail: "Léčebné výlohy, rizikové sporty, užívané věci a zavazadla předaná dopravci",
        source: "M-750/23, str. 27–32 a 39–40; IPID KOLUMBUS 07/2023",
        badge: "Souhrn IPID",
        metric: null,
        sections: [
          {
            label: "Další body uvedené v IPID Kooperativy",
            items: [
              "U léčebných výloh preventivní vyšetření a zubní náhrady; u duševních poruch náklady až po vyšetření potřebném ke stanovení diagnózy.",
              "Rizikové sportovní aktivity mohou vyžadovat odpovídající rozsah pojištění.",
              "Užívané věci mají výluku s výjimkami: vybavení ubytování, nepracovní praktická výuka či stáž a pronajatá movitá věc do 10 000 Kč. Motorové vozidlo má samostatnou úpravu spoluúčasti jen v PLUS.",
              "Škody na věcech předaných k přepravě.",
              "Chemická nebo biologická kontaminace.",
            ],
            emphasis: "exclusion",
          },
          {
            label: "Obecné povinnosti klienta",
            items: [
              "Pravdivě a úplně odpovídat na dotazy a přiměřeně předcházet vzniku škody.",
              "Po škodě zabránit zvětšování následků; při akutní nemoci nebo úrazu neprodleně vyhledat lékaře a dodržovat léčbu.",
              "Plnit další povinnosti uvedené ve smlouvě a podmínkách.",
            ],
          },
        ],
      },
      axa: {
        headline: "Specifika AXA",
        detail: "Předvídatelnost, varování před cestou, ochranné pomůcky a přesně vymezené činnosti",
        source: "AXA IPID, str. 2; VPPCP 15. 6. 2026, část II čl. 8–10, str. 7–9",
        badge: "IPID + úplné VPP",
        metric: null,
        sections: [
          {
            label: "Důležité obecné výluky AXA",
            items: [
              "Předvídatelná nebo před sjednáním známá událost, úmysl, porušení práva a bezpečnostních doporučení nebo nepoužití ochranných pomůcek.",
              "Válka, nepokoje, stávka, zásah veřejné moci, radioaktivita a chemická či biologická kontaminace.",
              "Varování MZV, WHO nebo obdobné instituce před cestou; u EXCELENT se výjimka týká jen varování souvisejícího s covidem-19.",
              "Profesionální sport, rizikový sport či soutěž bez připojištění, manuální práce bez připojištění a expedice do extrémních oblastí.",
            ],
            emphasis: "exclusion",
          },
          {
            label: "Obecné povinnosti klienta",
            items: [
              "Škodu bez zbytečného odkladu oznámit, pravdivě popsat a předložit všechny doklady; řídit se pokyny pojistitele a AXA Assistance.",
              "Předcházet škodě, minimalizovat následky, zajistit důkazy, případně policejní potvrzení, a oznámit další pojištění stejného rizika.",
              "U opakovaných výjezdů prokázat datum odjezdu a návratu do ČR.",
            ],
          },
        ],
      },
    },
    {
      id: "own-sports-equipment",
      section: "Sport a vybavení",
      icon: Bike,
      title: "Klientovi ukradnou nebo poškodí vlastní vybavení",
      description: "Srovnání náhrady hodnoty vlastního kola, potápěčské výstroje nebo jiného sportovního vybavení.",
      verdict: {
        tone: "balanced",
        label: "Rozhoduje druh škody a ocenění",
        detail: "ČPP Léto PLUS plní vymezenou letní výbavu v nové ceně. Kooperativa a AXA ji mohou řešit ze zavazadel jen při vyjmenovaných nebezpečích; AXA navíc plní v časové ceně.",
      },
      cpp: {
        headline: "35 000 Kč / servis 3 500 Kč",
        detail: "Léto PLUS · odcizení vloupáním či loupeží, zničení a specificky vymezená ztráta",
        source: "DPPLP 1/23, čl. 2, 4–6",
        badge: "Volitelné připojištění Léto PLUS",
        points: [
          "Odcizení, zničení a ztráta se plní v nové ceně celkem do 35 000 Kč.",
          "U poškozené věci je servis omezen samostatným limitem 3 500 Kč.",
        ],
        sections: [
          {
            label: "Co se považuje za letní vybavení",
            items: [
              "Kolo, potápěčská a rybářská výbava, surf, windsurf, pramice, kánoe, kajak a raft.",
              "Ztrátou se rozumí jen situace, kdy klient nemohl věc chránit kvůli smrti, ztrátě vědomí nebo úrazu.",
            ],
          },
          {
            label: "Hlavní výluky",
            items: [
              "Krádež ze stanu mimo oficiální kemp, z úschovny nebo společných prostor ubytování.",
              "Krádež z odstaveného auta mezi 22.00 a 6.00 bez přítomnosti pojištěného či pověřené dospělé osoby.",
              "Běžná údržba a opotřebení.",
            ],
            emphasis: "exclusion",
          },
        ],
      },
      koop: {
        headline: "Sportovní připojištění vlastní věc nehradí",
        detail: `Samostatné pojištění zavazadel má ve variantě ${koop.label} limit ${formatMoney(koop.baggage)}, ale jen pro vyjmenovaná nebezpečí`,
        source: "M-750/23, str. 11 a 33–36",
        badge: "ÚZO + volitelné sportovní připojištění",
        points: [
          "Zavazadla mohou krýt vlastní sportovní výbavu při dopravní nehodě, krádeži s překonáním překážky, loupeži, požáru nebo vyjmenovaném živlu.",
          "Věci předané dopravci k přepravě – včetně vlastní sportovní výbavy – jsou z pojištění zavazadel vyloučeny.",
          "Sportovní připojištění může při poškození vlastní věci zaplatit pronájem náhradní výbavy, nikoli hodnotu původní věci.",
        ],
        sections: [
          {
            label: "Rozhodující rozdíl",
            text: "Pojištění zavazadel není pojištěním každého poškození či prostého zmizení věci. Musí nastat některé z přesně vyjmenovaných nebezpečí a současně nesmí platit výluka.",
            emphasis: "exclusion",
          },
        ],
      },
      axa: {
        headline: axaHasExtendedCover ? `${formatMoney(axa.baggage)} · časová cena` : "V REFERENCE není pojištěno",
        detail: axaHasExtendedCover
          ? "Sportovní vybavení je součástí pojištění zavazadel při vyjmenovaných nebezpečích"
          : "Pojištění zavazadel začíná až ve variantě KOMFORT",
        source: "AXA VPPCP 15. 6. 2026, část III oddíl G čl. 1–3, str. 16–17",
        badge: axaHasExtendedCover ? `Varianta ${axa.label}` : "Bez zavazadel",
        points: axaHasExtendedCover
          ? [
              `Celkový limit ${formatMoney(axa.baggage)}, na jednu věc ${formatMoney(axaHasExcelentCover ? 20_000 : 10_000)}.`,
              "Kryje živel, odcizení z uzamčené určené místnosti či úschovny, vloupání do skrytého zavazadlového prostoru nebo střešního boxu, dopravní nehodu a loupež.",
              "Škoda během svěření dopravci je kryta jen s připojištěním Cestování letadlem.",
            ]
          : ["Pro krytí sportovního vybavení je nutné zvolit KOMFORT nebo EXCELENT."],
        metric: axaHasExtendedCover ? axa.baggage : 0,
        sections: axaHasExtendedCover
          ? [
              {
                label: "Důležitá omezení",
                items: [
                  "Nejde o krytí každého poškození ani prosté ztráty; musí nastat vyjmenované nebezpečí.",
                  "Kolo je kryto jen při stanoveném způsobu uložení. Věci nesmějí zůstat v odstaveném vozidle nebo přívěsu mezi 22.00 a 6.00.",
                ],
                emphasis: "exclusion" as const,
              },
            ]
          : undefined,
      },
    },
    {
      id: "replacement-sports-equipment",
      section: "Sport a vybavení",
      icon: Bike,
      title: "Klient si musí půjčit náhradní vybavení",
      description: "Vlastní výbava byla během pojištění poškozena, zničena, odcizena nebo ztracena.",
      verdict: {
        tone: "koop",
        label: "Výhoda Kooperativy",
        detail: "Má dvojnásobný celkový limit a širší definici amatérského vybavení.",
      },
      cpp: {
        headline: "až 5 000 Kč",
        detail: "Léto PLUS · 500 Kč za každých 24 hodin",
        source: "DPPLP 1/23, čl. 2 odst. 2 a čl. 4 odst. 5b",
        badge: "Volitelné připojištění Léto PLUS",
        points: ["Také při nedodání nebo zpoždění vybavení dopravcem"],
        metric: 5_000,
      },
      koop: {
        headline: "až 10 000 Kč",
        detail: "Účelně vynaložené náklady na náhradní pronájem",
        source: "M-750/23, str. 12 a 35–36",
        badge: "Volitelné sportovní připojištění",
        points: ["Kola, lyže, snowboardy, tenis, golf, horolezectví, potápění a další amatérské vybavení"],
        metric: 10_000,
        sections: [
          {
            label: "Pozor na formulaci ztráty",
            text: "Článek o pojistné události uvádí poškození, zničení nebo odcizení; následující podmínka zmiňuje také ztrátu. U nároku založeného pouze na ztrátě je proto vhodné předem vyžádat výklad pojistitele.",
            emphasis: "exclusion",
          },
        ],
      },
      axa: {
        headline: "Bez náhrady pronájmu",
        detail: "AXA neuvádí plnění za půjčení náhradního sportovního vybavení",
        source: "AXA VPPCP 15. 6. 2026, přehled plnění a část III oddíl G a K, str. 2–3 a 16–19",
        badge: "Bez přímého protějšku",
        points: ["Pojištění zavazadel může řešit škodu na vlastní věci, nikoli náklad na její náhradní pronájem."],
        metric: 0,
      },
    },
    {
      id: "rented-sports-equipment",
      section: "Sport a vybavení",
      icon: ShieldCheck,
      title: "Klient poškodí pronajaté sportovní vybavení",
      description: "Posuzujeme odpovědnost vůči profesionální půjčovně, od které si klient vybavení prokazatelně pronajal.",
      verdict: {
        tone: "balanced",
        label: "Tři rozdílné mechanismy",
        detail: `ČPP řeší zákonnou odpovědnost do ${formatMoney(cppBorrowedThingLimit)}, Kooperativa má dva nízké sublimity a AXA ${axaHasExtendedCover ? "kryje oficiálně půjčenou sportovní věc ze zavazadel při vyjmenovaném nebezpečí" : "ve variantě REFERENCE toto krytí nemá"}.`,
      },
      cpp: {
        headline: formatMoney(cppBorrowedThingLimit),
        detail: "Věc zapůjčená · 10 % limitu odpovědnosti, nejvýše 500 000 Kč",
        source: "DPPODC 1/18, čl. 2 odst. 2b a čl. 8 bod 37",
        badge: "Volitelné pojištění odpovědnosti",
        points: [
          "Musí jít o movitou věc převzatou do oprávněného užívání od osoby, jejíž podnikatelskou činností je půjčování věcí.",
          "Krytí zapůjčených věcí je širší než samotné sportovní vybavení: zahrnuje například půjčené kolo či lyže a podle potvrzení ČPP sděleného správcem srovnání také auto z půjčovny.",
          "Léto PLUS tuto odpovědnost neřeší; krytí vychází ze samostatného pojištění odpovědnosti.",
        ],
        metric: cppBorrowedThingLimit,
      },
      koop: {
        headline: "10 000 Kč / 5 000 Kč",
        detail: "ÚZO: pronajatá movitá věc 10 000 Kč; sportovní připojištění: pronajatá sportovní výbava 5 000 Kč",
        source: "M-750/23, str. 11–12, 35 a 37–40",
        badge: "ÚZO + volitelné sportovní připojištění",
        points: [
          "U škody poškozením nebo zničením pronajaté movité věci uvádí odpovědnost sublimit 10 000 Kč.",
          "Sportovní připojištění výslovně kryje poškození, zničení nebo odcizení pronajatého sportovního vybavení do 5 000 Kč.",
          "Jde o dvě ustanovení jedněch podmínek; nelze bez dalšího předpokládat součet obou limitů.",
        ],
        metric: 10_000,
        sections: [
          {
            label: "Hlavní omezení",
            items: [
              "Nehradí profesionální či výdělečné užívání ani události pod vlivem alkoholu nebo drog.",
              "Nehradí smluvně rozšířenou odpovědnost, pokuty a sankce ani škody vůči blízkým osobám.",
            ],
            emphasis: "exclusion",
          },
        ],
      },
      axa: {
        headline: axaHasExtendedCover ? `až ${formatMoney(axa.baggage)}` : "V REFERENCE není pojištěno",
        detail: axaHasExtendedCover
          ? `Půjčené sportovní vybavení v pojištění zavazadel · limit na věc ${formatMoney(axaHasExcelentCover ? 20_000 : 10_000)}`
          : "Bez pojištění zavazadel a odpovědnosti",
        source: "AXA VPPCP 15. 6. 2026, část III oddíl G čl. 1–3, str. 16–17",
        badge: axaHasExtendedCover ? `Varianta ${axa.label}` : "Bez krytí",
        points: axaHasExtendedCover
          ? [
              "Věc musí být pro danou cestu prokazatelně zapůjčena z oficiální půjčovny sportovních potřeb.",
              "Při škodě klient doloží potvrzení půjčovny o částce, kterou půjčovně uhradil.",
              "Plní se v časové ceně a jen při vyjmenovaném živelním, odcizovacím či dopravním nebezpečí.",
            ]
          : ["Kryté zavazadlo včetně půjčeného sportovního vybavení mají až KOMFORT a EXCELENT."],
        metric: axaHasExtendedCover ? axa.baggage : 0,
      },
    },
    {
      id: "unused-summer-holiday",
      section: "Cesta a komplikace",
      icon: CircleAlert,
      title: "Klient kvůli úrazu nebo hospitalizaci nevyužije dovolenou",
      description: "ČPP vyplácí pevnou částku za den, Kooperativa nahrazuje část doložené ceny nevyužitých služeb.",
      verdict: {
        tone: "balanced",
        label: "Odlišný princip plnění",
        detail: "ČPP je obnosové a jednoduché; Kooperativa může podle ceny služby vyplatit více, ale vyžaduje doložené náklady.",
      },
      cpp: {
        headline: "800 Kč / 24 hodin",
        detail: "Léto PLUS · celkem až 8 000 Kč",
        source: "DPPLP 1/23, čl. 2 odst. 3, čl. 4 a 5",
        badge: "Volitelné připojištění Léto PLUS",
        points: ["Plnění od dne následujícího po úrazu nebo přijetí k hospitalizaci"],
        sections: [
          {
            label: "Výluky",
            text: "Plánovaná vyšetření, lázně a onemocnění či úraz vzniklé před sjednáním smlouvy.",
            emphasis: "exclusion",
          },
        ],
      },
      koop: {
        headline: koop.label === "PLUS" ? "až 15 000 Kč" : "až 10 000 Kč",
        detail: "80 % doložených nákladů na nespotřebované cestovní služby",
        source: "M-750/23, str. 11 a 41–42",
        badge: "Balíček ÚZO",
        points: ["Musí jít o službu, kterou zdravotní stav prokazatelně neumožnil dále čerpat"],
      },
      axa: {
        headline: axaHasExcelentCover ? "500 Kč/den · nejvýše 5 000 Kč" : `Ve variantě ${axa.label} není pojištěno`,
        detail: axaHasExcelentCover
          ? "Pouze při krytém předčasném návratu, ne obecně kvůli vlastnímu úrazu na dovolené"
          : "Nevyužitou dovolenou obsahuje jen EXCELENT a jen ve vazbě na předčasný návrat",
        source: "AXA VPPCP 15. 6. 2026, přehled plnění a část III oddíl I, str. 2 a 17–18",
        badge: axaHasExcelentCover ? "Varianta EXCELENT" : "Bez přímého protějšku",
        points: axaHasExcelentCover
          ? ["Důvodem předčasného návratu musí být úmrtí nebo neočekávaná hospitalizace rodinného příslušníka či škoda na vlastním majetku nad 200 000 Kč."]
          : ["K této konkrétní situaci vlastního úrazu či hospitalizace AXA samostatné denní plnění neuvádí."],
      },
    },
    {
      id: "sports-scope",
      section: "Sport a vybavení",
      icon: Activity,
      title: "Klient provozuje nebezpečný sport nebo jede na závody",
      description: "Samotné připojištění vybavení automaticky neznamená, že je pojištěná i sportovní činnost a léčebné výlohy z ní.",
      verdict: {
        tone: "attention",
        label: "Nutné individuálně ověřit",
        detail: "Vždy zvlášť kontrolujte krytí sportovní činnosti a krytí vybavení.",
      },
      cpp: {
        headline: "Sportovní cesta pro nebezpečné sporty",
        detail: "Bez odchylného ujednání Léto PLUS nekryje události související s nebezpečnými sporty ani organizovanými soutěžemi a tréninky",
        source: "VPPCP 1/18, čl. 8 a 16; DPPLP 1/23, čl. 5 odst. 4",
        badge: "Rozhoduje typ cesty a smlouva",
        points: [
          "Nebezpečné sporty: turistika do 4 000 m a UIAA II, ferraty do B a přístrojové potápění do 40 m s certifikací vyžadují odpovídající sjednání.",
          "Ferraty nad B, turistika nad 4 000 m, skialpinismus a lyžování mimo oficiální trasy patří mezi vyloučené extrémní sporty.",
          "Organizované soutěže a přípravu je třeba sjednat odpovídajícím rozsahem; připojištění vybavení samo nerozšiřuje léčebné výlohy.",
        ],
      },
      koop: {
        headline: "Základní, aktivní, organizovaný a extrémní sport",
        detail: "Rozšíření léčebných výloh pro aktivní sport je odlišné od pojištění vybavení",
        source: "M-750/23, LVZ čl. 2 a 8, str. 24 a 28–29; vybavení str. 35–36",
        badge: "Rozsah sportu musí být sjednaný",
        points: [
          "Základ: rekreační běžné sporty, nenáročná turistika do 3 000 m a lyžování na otevřených vyznačených sjezdovkách.",
          "Aktivní sport: turistika po otevřených vyznačených cestách do 5 000 m a UIAA II, ferraty do C, přístrojové potápění do 40 m s certifikací.",
          "Aktivní sport nekryje závody ani přípravu. Pro sporty z uvedených seznamů lze sjednat organizovaný sport i na amatérské a profesionální úrovni.",
          "Freeride a skialpinismus jsou v běžném rozsahu vyloučené. Rozsah extrémní sport může zahrnout další sporty jmenovitě uvedené ve smlouvě; jejich přijetí posuzuje pojišťovna.",
        ],
      },
      axa: {
        headline: axaHasExtendedCover ? "Připojištění rizikových sportů" : "V REFERENCE nelze připojistit",
        detail: axaHasExtendedCover
          ? "Rozšíří léčebné výlohy, úraz a odpovědnost pro vyjmenované sporty"
          : "Rizikové sporty jsou sjednatelné pouze ke KOMFORT a EXCELENT",
        source: "AXA VPPCP 15. 6. 2026, část II čl. 9 a část III oddíl K, str. 8 a 19; Rizikové sporty",
        badge: "Samostatné připojištění",
        points: axaHasExtendedCover
          ? [
              "Kryje vyjmenované rizikové sporty na rekreační úrovni a veřejně organizované soutěže či přípravu na ně.",
              "Pro soutěž a trénink je připojištění nutné i u jinak běžného sportu.",
              "Tabulka a zvláštní oddíl K uvádějí také odpovědnost, ale obecná výluka zmiňuje výjimku jen pro léčebné výlohy a úraz; odpovědnost je vhodné písemně potvrdit.",
              "Profesionální sport a výslovně nepojistitelné aktivity zůstávají vyloučené; neuvedený sport vyžaduje předchozí písemné potvrzení AXA.",
            ]
          : ["Pro rizikový sport musí klient zvolit vyšší základní variantu a sjednat připojištění."],
      },
    },
    {
      id: "winter-equipment",
      section: "Sport a vybavení",
      icon: Snowflake,
      title: "Klient jede na zimní dovolenou",
      description: "Vedle lyží a snowboardu porovnáváme také uzavření areálu, lavinový zával a nevyužitou dovolenou.",
      verdict: {
        tone: "cpp",
        label: "Širší řešení u ČPP",
        detail: "Zima PLUS spojuje vlastní výbavu s několika typicky zimními komplikacemi.",
      },
      cpp: {
        headline: "Zima PLUS",
        detail: "Specializovaný balíček pro vlastní vybavení i zimní cestu",
        source: "DPPZP 1/23, čl. 2, 4–6",
        badge: "Volitelné připojištění Zima PLUS",
        points: [
          "Odcizení, zničení a specificky vymezená ztráta vybavení 35 000 Kč; servis poškozené výbavy 3 500 Kč.",
          "Náhradní pronájem 500 Kč za 24 hodin, celkem 5 000 Kč.",
          "Náhradní ubytování nebo doprava při lavinovém závalu celkem 20 000 Kč.",
        ],
        sections: [
          {
            label: "Další plnění",
            items: [
              "Nevyužitý přepravní doklad: 800 Kč za 24 hodin, celkem 8 000 Kč.",
              "Nevyužitá zimní dovolená: 800 Kč za 24 hodin, celkem 8 000 Kč.",
            ],
            emphasis: "benefit",
          },
          {
            label: "Důležité podmínky",
            items: [
              "U uzavření areálu se neplní při době kratší než 24 hodin, v období 16. 4.–14. 12. ani u přepravního dokladu zakoupeného na méně než dva dny.",
              "Lyžařské středisko musí ležet alespoň 1 000 m n. m.",
              "U lavinového závalu musí být cesta odložena o více než 12 hodin oproti plánovanému odjezdu či příjezdu.",
              "U krádeže platí omezení pro úschovny, společné prostory a odstavený automobil mezi 22.00 a 6.00.",
            ],
            emphasis: "exclusion",
          },
        ],
      },
      koop: {
        headline: "Obecné sportovní krytí",
        detail: "Lyže a snowboardy jsou součástí definice sportovního vybavení",
        source: "M-750/23, str. 12, 33–36 a 41–42",
        badge: "Volitelné sportovní připojištění",
        points: ["Náhradní pronájem 10 000 Kč", "Škoda na pronajaté výbavě 5 000 Kč"],
        sections: [
          {
            label: "Rozdíl proti Zima PLUS",
            items: [
              "Připojištění samo nehradí hodnotu vlastních lyží či snowboardu; případná škoda se posuzuje podle sjednaného pojištění zavazadel.",
              "Nemá samostatné plnění za uzavření areálu ani lavinový zával. Nevyužité služby může za stanovených podmínek řešit obecné pojištění nevyužité cestovní služby.",
            ],
            emphasis: "exclusion",
          },
        ],
      },
      axa: {
        headline: axaHasExtendedCover ? `Zavazadla ${formatMoney(axa.baggage)}` : "V REFERENCE bez vybavení",
        detail: "Nemá specializovaný zimní balíček s uzavřením areálu nebo lavinovým závalem",
        source: "AXA VPPCP 15. 6. 2026, část III oddíl G a přílohy sportů, str. 16–17 a 22–31",
        badge: axaHasExtendedCover ? `Varianta ${axa.label}` : "Bez zavazadel",
        points: axaHasExtendedCover
          ? [
              `Lyže a snowboard lze při vyjmenovaném nebezpečí řešit jako sportovní vybavení; limit na jednu věc je ${formatMoney(axaHasExcelentCover ? 20_000 : 10_000)}.`,
              "Samostatné plnění za uzavření areálu, lavinový zával nebo náhradní pronájem podmínky neuvádějí.",
            ]
          : ["REFERENCE neobsahuje pojištění zavazadel."],
      },
    },
    {
      id: "golf",
      section: "Sport a vybavení",
      icon: Trophy,
      title: "Klient jede na golfovou dovolenou",
      description: "ČPP má specializované golfové krytí. Kooperativa řadí golfové hole mezi sportovní vybavení, ale rozsah je užší.",
      verdict: {
        tone: "cpp",
        label: "Širší řešení u ČPP",
        detail: "Golf PLUS kryje vlastní hole, Green Fee i náklady spojené s Hole-in-One.",
      },
      cpp: {
        headline: "Golf PLUS",
        detail: "Vlastní výbava, náhradní pronájem, Green Fee a Hole-in-One",
        source: "DPPGP 1/22, čl. 2–6",
        badge: "Volitelné připojištění Golf PLUS",
        points: ["Vybavení celkem 40 000 Kč", "Náhradní pronájem 15 000 Kč", "Green Fee 15 000 Kč; Hole-in-One 30 000 Kč"],
        sections: [
          {
            label: "Rozsah škody na vlastní výbavě",
            text: "Nejde o pojištění každého náhodného poškození. Podmínky uvádějí živelní událost, únik kapaliny z technického zařízení, krádež vloupáním, loupež a specificky definovanou ztrátu.",
            emphasis: "exclusion",
          },
          {
            label: "Důležité podmínky",
            items: [
              "Limit vlastní výbavy je 30 000 Kč na jednotlivou věc a 40 000 Kč celkem; výbava musí být v golfovém obalu.",
              "Hole-in-One vyžaduje oficiální turnaj, potvrzení rozhodčího a účet za pohoštění.",
              "Podmínky současně bez odchylného ujednání vylučují organizované sportovní soutěže a trénink; krytí turnaje proto musí odpovídat pojistné smlouvě.",
            ],
          },
        ],
      },
      koop: {
        headline: "Obecné sportovní krytí",
        detail: "Golfové hole jsou zahrnuté v definici amatérského sportovního vybavení",
        source: "M-750/23, str. 12, 33–36",
        badge: "Volitelné sportovní připojištění",
        points: ["Náhradní pronájem 10 000 Kč", "Škoda na pronajatých holích 5 000 Kč"],
        sections: [
          {
            label: "Rozdíl proti Golf PLUS",
            text: `Sportovní připojištění nemá zvláštní plnění za Green Fee, Hole-in-One ani hodnotu vlastních golfových holí. Hodnotu vlastních holí může při vyjmenovaném nebezpečí řešit pojištění zavazadel s celkovým limitem ${formatMoney(koop.baggage)}.`,
            emphasis: "exclusion",
          },
        ],
      },
      axa: {
        headline: axaHasExtendedCover ? `Zavazadla ${formatMoney(axa.baggage)}` : "V REFERENCE bez vybavení",
        detail: "Golf nemá vlastní specializovaný balíček",
        source: "AXA VPPCP 15. 6. 2026, část III oddíl G a přílohy sportů, str. 16–17 a 22–31",
        badge: axaHasExtendedCover ? `Varianta ${axa.label}` : "Bez zavazadel",
        points: axaHasExtendedCover
          ? [
              `Golfové vybavení se může při vyjmenovaném nebezpečí posoudit jako zavazadlo; limit na věc ${formatMoney(axaHasExcelentCover ? 20_000 : 10_000)}.`,
              "Green Fee, Hole-in-One ani náhradní pronájem nejsou samostatně pojištěny.",
            ]
          : ["REFERENCE neobsahuje pojištění zavazadel."],
      },
    },
    {
      id: "treatment",
      section: "Léčebné výlohy",
      icon: BriefcaseMedical,
      title: "Klient potřebuje lékařské ošetření nebo hospitalizaci",
      description: "Celkový limit pro nezbytnou zdravotní péči v zahraničí.",
      verdict: limitVerdict(cpp.treatment, koop.treatment, axa.treatment),
      cpp: {
        headline: formatMoney(cpp.treatment),
        detail: "Celkový limit léčebných výloh",
        source: "DPPLV 1/23, čl. 2 a 5",
        badge: "Základní léčebné výlohy",
        points: ["Repatriace do ČR", "Hospitalizace, operace a léky"],
        metric: cpp.treatment,
      },
      koop: {
        headline: formatMoney(koop.treatment),
        detail: "Celkový limit léčebných výloh",
        source: "M-750/23, str. 10 a 23–29",
        badge: "Základní léčebné výlohy",
        points: ["Repatriace do ČR", "Hospitalizace, operace a léky"],
        metric: koop.treatment,
      },
      axa: {
        headline: formatMoney(axa.treatment),
        detail: `Celkový limit léčebných výloh ve variantě ${axa.label}`,
        source: "AXA VPPCP 15. 6. 2026, přehled plnění a část III oddíl A, str. 2 a 10–12",
        badge: "Základní léčebné výlohy",
        points: [
          "Asistenční služby, repatriace a transporty do celkového limitu léčebných výloh.",
          axaHasExcelentCover
            ? "EXCELENT má navíc sublimit 1 000 000 Kč pro náhlou akutní událost související s chronickým onemocněním."
            : "Stabilizované chronické onemocnění má vymezenou výjimku z výluky; ostatní chronické onemocnění kryje až EXCELENT.",
        ],
        metric: axa.treatment,
      },
    },
    {
      id: "covid-treatment",
      section: "Léčebné výlohy",
      icon: ShieldAlert,
      title: "Klient v zahraničí onemocní covidem-19",
      description: "ČPP a Kooperativa mají pro covid zvláštní limit. AXA v běžné destinaci používá limit léčebných výloh; při varování před cestou se pravidla mění.",
      verdict: {
        ...limitVerdict(cppCovidTreatmentLimit, 5_000_000, axa.treatment),
        detail: `Mimo destinaci s varováním se u AXA covid léčí do běžného limitu ${formatMoney(axa.treatment)}. V destinaci s varováním kryje covid pouze EXCELENT, a to do 25 mil. Kč.`,
      },
      cpp: {
        headline: formatMoney(cppCovidTreatmentLimit),
        detail: `Sublimit léčby covidu-19 ve variantě ${cpp.label}`,
        source: "DPPLV 1/23, čl. 2 odst. 5 a čl. 5 odst. 2",
        badge: "Součást léčebných výloh",
        points: ["Nevztahuje se na země označené MZV jako země s extrémním výskytem nákazy covid-19"],
        metric: cppCovidTreatmentLimit,
      },
      koop: {
        headline: "5 mil. Kč",
        detail: "Nezbytné a přiměřené náklady na léčbu covidu-19 v obou variantách",
        source: "M-750/23, str. 11 a 23–24",
        badge: "COVID zdarma k LVZ",
        points: ["Pojištění COVID musí být uvedeno mezi sjednanými pojištěními"],
        metric: 5_000_000,
      },
      axa: {
        headline: axaHasExcelentCover ? `${formatMoney(axa.treatment)} / 25 mil. Kč` : formatMoney(axa.treatment),
        detail: axaHasExcelentCover
          ? "Běžná destinace / covid v oblasti s oficiálním varováním před cestou"
          : "V běžné destinaci do celkového limitu; varovaná destinace je vyloučena",
        source: "AXA VPPCP 15. 6. 2026, přehled plnění a část II čl. 9 a část III oddíl A, str. 2, 8 a 10–12",
        badge: `Varianta ${axa.label}`,
        points: [
          axaHasExcelentCover
            ? "EXCELENT ruší výluku varování před cestou jen tehdy, pokud varování souvisí s covidem-19; pro léčbu pak platí sublimit 25 000 000 Kč."
            : "REFERENCE a KOMFORT nekryjí událost po nástupu cesty do oblasti, před kterou MZV, WHO nebo obdobná instituce varovala.",
        ],
        metric: axa.treatment,
      },
    },
    {
      id: "rescue",
      section: "Léčebné výlohy",
      icon: HeartHandshake,
      title: "Klienta musí zachránit v horách nebo terénu",
      description: "Důležitý limit pro hory, vrtulník a záchranu v terénu.",
      verdict: {
        ...limitVerdict(cpp.rescue, koop.rescue, axa.rescue),
        detail: `ČPP i AXA vážou krytou záchranu na celý limit léčebných výloh; Kooperativa má samostatný limit ${formatMoney(koop.rescue)}. AXA nehradí pátrání, pokud zdraví či život neohrožuje úraz nebo nemoc.`,
      },
      cpp: {
        headline: formatMoney(cpp.rescue),
        detail: "Záchrana pojištěného v tísni",
        source: "DPPLV 1/23, čl. 2 odst. 2 a čl. 5",
        badge: "Součást léčebných výloh",
        points: ["Limit kopíruje zvolený limit léčebných výloh"],
        metric: cpp.rescue,
      },
      koop: {
        headline: formatMoney(koop.rescue),
        detail: "Zásah záchranných složek",
        source: "M-750/23, str. 10 a 23–29",
        badge: "Součást léčebných výloh",
        points: [koop.label === "PLUS" ? "Vyšší limit varianty PLUS" : "Limit varianty KLASIK"],
        metric: koop.rescue,
      },
      axa: {
        headline: formatMoney(axa.rescue),
        detail: "Zásah horské služby při pojistné události do celkového limitu LVZ",
        source: "AXA VPPCP 15. 6. 2026, přehled plnění a část III oddíl A čl. 1–2, str. 2 a 10–12",
        badge: "Součást léčebných výloh",
        points: ["Vyhledávání nebo pátrání bez ohrožení zdraví či života v souvislosti s úrazem nebo onemocněním je vyloučeno."],
        metric: axa.rescue,
      },
    },
    {
      id: "teeth",
      section: "Léčebné výlohy",
      icon: Stethoscope,
      title: "Klienta začne akutně bolet zub",
      description: "Sublimit pro neodkladné ošetření při akutní bolesti.",
      verdict: limitVerdict(cpp.teeth, koop.teeth, axa.teeth),
      cpp: {
        headline: formatMoney(cpp.teeth),
        detail: "Sublimit ošetření zubů",
        source: "DPPLV 1/23, čl. 2 odst. 1b a čl. 5",
        badge: "Součást léčebných výloh",
        metric: cpp.teeth,
      },
      koop: {
        headline: formatMoney(koop.teeth),
        detail: "Sublimit ošetření zubů",
        source: "M-750/23, str. 10 a 24–25",
        badge: "Součást léčebných výloh",
        metric: koop.teeth,
      },
      axa: {
        headline: formatMoney(axa.teeth),
        detail: "Sublimit akutního ošetření zubů",
        source: "AXA VPPCP 15. 6. 2026, přehled plnění a část III oddíl A čl. 1–2, str. 2 a 10–12",
        badge: "Součást léčebných výloh",
        points: ["Nehradí neakutní péči, endodoncii, náhrady, korunky, rovnátka, můstky ani odstranění zubního kamene."],
        metric: axa.teeth,
      },
    },
    {
      id: "companion",
      section: "Léčebné výlohy",
      icon: Users,
      title: "Zdravotní stav vyžaduje přítomnost blízké osoby",
      description: "Když zdravotní stav vyžaduje přítomnost blízké osoby.",
      verdict: {
        tone: "balanced",
        label: "Limity nelze srovnat jedním číslem",
        detail: "ČPP a Kooperativa uvádějí korunový limit pobytu. AXA hradí cestu do limitu léčebných výloh a ubytování v eurech za noc, nejvýše 10 nocí, ale váže návštěvu na přesné podmínky hospitalizace.",
      },
      cpp: {
        headline: formatMoney(cpp.companionTotal),
        detail: `max. ${formatMoney(cpp.companionDay)} za den`,
        source: "DPPLV 1/23, čl. 2 odst. 1f a čl. 5",
        badge: "Součást léčebných výloh",
        points: ["Doprovod musí být z lékařského hlediska nutný a předem schválený asistencí nebo pojistitelem"],
        metric: cpp.companionTotal,
      },
      koop: {
        headline: formatMoney(koop.companionTotal),
        detail: `Ubytování max. ${formatMoney(koop.companionDay)} za den`,
        source: "M-750/23, str. 10 a 25–26",
        badge: "Součást léčebných výloh",
        points: ["Doprava schválené doprovázející osoby se hradí do celkového limitu léčebných výloh"],
        metric: koop.companionTotal,
      },
      axa: {
        headline: `${axaCompanionNight} EUR/noc · max. 10 nocí`,
        detail: "Doprava rodinného příslušníka do celkového limitu léčebných výloh",
        source: "AXA VPPCP 15. 6. 2026, přehled plnění a část III oddíl A čl. 1, str. 2 a 10–11",
        badge: `Varianta ${axa.label}`,
        points: [
          "Typicky při hospitalizaci delší než 10 dní, pokud klient cestuje bez rodinného příslušníka; návštěva začíná od 11. dne.",
          "Podmínky zvlášť řeší hospitalizované nezletilé dítě i případ, kdy je hospitalizován dospělý cestující s nezletilým dítětem.",
        ],
        metric: null,
      },
    },
    {
      id: "pregnancy",
      section: "Léčebné výlohy",
      icon: Baby,
      title: "Na cestě nastanou komplikace v těhotenství",
      description: "Rozsah léčebných výloh spojených s těhotenstvím není u produktů vymezen stejně.",
      verdict: {
        tone: "attention",
        label: "Odlišné časové vymezení",
        detail: "Nelze rozhodnout jen podle názvu varianty; zásadní je týden těhotenství a charakter komplikace.",
      },
      cpp: {
        headline: "do 24. týdne",
        detail: "Nezbytné ošetření, léčení a hospitalizace související s těhotenstvím",
        source: "DPPLV 1/23, čl. 2 odst. 1a",
        badge: "Součást léčebných výloh",
        points: ["Rozhoduje přesný týden těhotenství v době události"],
        metric: null,
      },
      koop: {
        headline: "do 10 týdnů před porodem",
        detail: "Neočekávané akutní komplikace při bezprostředním ohrožení matky nebo plodu",
        source: "M-750/23, str. 27–28",
        badge: "Součást léčebných výloh",
        points: ["Nevztahuje se na komplikace v rámci rizikového těhotenství"],
        metric: null,
      },
      axa: {
        headline: "do ukončeného 32. týdne",
        detail: "Po 32. týdnu jsou komplikace vyloučeny; vyloučeno je i rizikové těhotenství a porod",
        source: "AXA VPPCP 15. 6. 2026, část III oddíl A čl. 2, str. 11",
        badge: "Součást léčebných výloh",
        points: [
          "Výluka zahrnuje také zjišťování těhotenství, interrupci, léčbu neplodnosti, umělé oplodnění, antikoncepci a hormonální léčbu.",
        ],
        metric: null,
      },
    },
    {
      id: "doctor-on-phone",
      section: "Léčebné výlohy",
      icon: Stethoscope,
      title: "Klient chce konzultovat zdravotní stav na dálku",
      description: "Kooperativa zahrnuje konzultaci s lékařem v asistenci k léčebným výlohám. AXA má samostatnou službu Doktor na telefonu v EXCELENT.",
      verdict: {
        tone: "balanced",
        label: "Konzultaci nabízí i Kooperativa",
        detail: "Kooperativa KLASIK i PLUS mají při pojistné události telefonickou či video konzultaci s česky komunikujícím lékařem. AXA EXCELENT navíc výslovně uvádí chat a možnost e-receptu.",
      },
      cpp: {
        headline: "Bez samostatného limitu v podkladech",
        detail: "Lékařskou pomoc a postup řeší asistenční služba v rámci léčebných výloh",
        source: "DPPLV 1/23; VPPCP 1/18",
        badge: "Asistenční postup",
      },
      koop: {
        headline: "Telefonická i video konzultace",
        detail: `Česky komunikující lékař v rámci asistence k léčebným výlohám ${koop.label}`,
        source: "M-750/23, léčebné výlohy čl. 7 odst. 1a, str. 26–27",
        badge: "Součást léčebných výloh",
        points: ["Při pojistné události konzultuje zdravotní stav, nálezy, léky a doporučí další postup. Služba nenahrazuje zdravotnickou záchrannou službu."],
      },
      axa: {
        headline: axaHasExcelentCover ? "Doktor na telefonu · ano" : `Ve variantě ${axa.label} není`,
        detail: axaHasExcelentCover
          ? "Telefon, online konzultace, videohovor nebo chat"
          : "Samostatné pojištění Doktor na telefonu obsahuje pouze EXCELENT",
        source: "AXA IPID, str. 1; VPPCP 15. 6. 2026, přehled plnění a část III oddíl B, str. 2 a 12",
        badge: axaHasExcelentCover ? "Varianta EXCELENT" : "Bez služby",
        points: axaHasExcelentCover
          ? ["Služba je dostupná 24 hodin denně, 7 dní v týdnu a může zahrnout lékařskou zprávu nebo e-recept; náklady na samotný hovor či online připojení se nehradí."]
          : ["Pro tuto službu je nutné zvolit variantu EXCELENT."],
      },
    },
    {
      id: "alcohol",
      section: "Léčebné výlohy",
      icon: CircleAlert,
      title: "Událost vznikne v souvislosti s alkoholem",
      description: "Pozor na rozdíl mezi krácením, úplnou výlukou a připojištěním, které obnovuje pouze léčebné výlohy.",
      verdict: {
        tone: "axa",
        label: "AXA nabízí jasně vymezené připojištění",
        detail: "Drink povolen kryje léčebné výlohy do zvoleného limitu při alkoholu nejvýše 0,8 ‰. Neobnovuje úrazové pojištění ani odpovědnost.",
      },
      cpp: {
        headline: "plnění lze snížit až o polovinu",
        detail: "Při příčinné souvislosti s alkoholem, omamnými či toxickými látkami nebo léky",
        source: "DPPLV 1/23, čl. 5 odst. 6; VPPCP 1/18, čl. 8 odst. 3",
        badge: "Krácení plnění",
        points: ["Výjimkou je řádně předepsaný lék, pokud klient nebyl lékařem ani výrobcem upozorněn na zákaz dané činnosti."],
      },
      koop: {
        headline: "Výluka LVZ a odpovědnosti; úraz lze krátit",
        detail: "U běžného úrazového plnění lze při příčinné souvislosti snížit plnění až na polovinu",
        source: "M-750/23, LVZ čl. 8 odst. 1n (str. 28); úraz čl. 6 odst. 4 a čl. 7 odst. 4c (str. 30–32); odpovědnost čl. 5 odst. 1j (str. 39)",
        badge: "Rozlišit konkrétní pojištění",
        points: [
          "Výluka léčebných výloh se vztahuje na událost v době, kdy byl pojištěný pod vlivem; odpovědnost vylučuje újmu související s požitím alkoholu.",
          "U úrazu existuje výjimka pro předepsané léky a zvláštní pravidlo pro smrt. U dopravního úrazu je vyloučen řidič nebo chodec spoluzavinivší nehodu pod vlivem i odmítnutí zkoušky.",
        ],
      },
      axa: {
        headline: "Drink povolen · do 0,8 ‰",
        detail: `Pouze léčebné výlohy do limitu ${formatMoney(axa.treatment)}`,
        source: "AXA VPPCP 15. 6. 2026, část II čl. 9 a část III oddíl O, str. 8 a 20; Drink povolen",
        badge: "Volitelné ke všem variantám",
        points: [
          "Hodnota do 0,8 ‰ musí být naměřena bezprostředně, nejpozději do 2 hodin od události.",
          "Připojištění neplatí při činnosti, kterou místní právo pod vlivem zakazuje, například při řízení vozidla.",
          "Úrazové plnění, odpovědnost ani jiné složky cestovního pojištění toto připojištění neobnovuje.",
        ],
      },
    },
    {
      id: "baggage-delay",
      section: "Zavazadla",
      icon: Luggage,
      title: "Odbavené zavazadlo má zpoždění",
      description: "ČPP a Kooperativa nahrazují doložený nákup nezbytných věcí. AXA při splnění podmínek vyplácí pevnou částku bez vazby na účtenky.",
      verdict: {
        tone: "balanced",
        label: "Rozhoduje čas a způsob plnění",
        detail: "ČPP začíná už od 3 hodin. Kooperativa od 6 hodin může nahradit vyšší doložené náklady; AXA od 6 hodin vyplácí obnos 5 000 Kč.",
      },
      cpp: {
        headline: "až 5 000 Kč",
        detail: "Prokazatelně zaplacené nezbytné věci osobní potřeby",
        source: "DPPLETP 1/18, čl. 2–5",
        points: [
          "Řádně registrované zavazadlo zpožděné leteckým dopravcem nejméně o 3 hodiny.",
          "Při škodě není nutné kontaktovat asistenční službu.",
        ],
        metric: 5_000,
        badge: "Volitelné připojištění Let PLUS",
        sections: [
          {
            label: "Kdy vzniká nárok",
            items: [
              "Klient odevzdal řádně registrované zavazadlo leteckému dopravci.",
              "Zavazadlo letecký dopravce zpozdil nejméně o 3 hodiny.",
              "Klient kvůli zpoždění prokazatelně zakoupil nezbytné věci osobní potřeby.",
            ],
            emphasis: "benefit",
          },
          {
            label: "Co klient doloží",
            items: [
              "Písemné potvrzení leteckého dopravce o zpoždění a délce jeho trvání.",
              "Originály účtenek za pořízené nezbytné věci osobní potřeby.",
            ],
          },
          {
            label: "Co se nehradí / omezení",
            items: [
              "ČPP neplní, pokud je zpoždění zavazadla kratší než 3 hodiny.",
              "Plnění je pouze za doložený nákup nezbytných věcí osobní potřeby, nejvýše 5 000 Kč.",
            ],
            emphasis: "exclusion",
          },
        ],
      },
      koop: {
        headline: koop.label === "PLUS" ? "až 10 000 Kč" : "až 8 000 Kč",
        detail: koop.label === "PLUS" ? "Doložené náklady; hodinový strop 1 500 Kč od 7. hodiny" : "Doložené náklady; hodinový strop 1 000 Kč od 7. hodiny",
        source: "M-750/23, str. 11 a 36",
        points: [
          "Doložené náklady na nezbytné náhradní věci při zpoždění nejméně 6 hodin.",
          "Po návratu do země bydliště se toto pojištění neuplatní.",
        ],
        metric: koop.label === "PLUS" ? 10_000 : 8_000,
        badge: "Balíček ÚZO",
        sections: [
          {
            label: "Kdy vzniká nárok",
            items: [
              "Klient odevzdal řádně registrovaná zavazadla leteckému dopravci.",
              "Událost souvisí s oficiálně registrovaným letem.",
              "Zavazadla chybí po příletu plánovaným letem do přestupní stanice nebo cílové destinace, nikoli po návratu do země bydliště.",
            ],
            emphasis: "benefit",
          },
          {
            label: "Co klient doloží",
            items: [
              "Doklady o nákupu nezbytných náhradních věcí.",
              "Písemné potvrzení dopravce o převzetí zavazadel, jejich zpoždění, délce zpoždění a poskytnuté kompenzaci.",
            ],
          },
          {
            label: "Co se nehradí / omezení",
            items: [
              "Ubytování, stravování a doprava se nepovažují za náhradní věci.",
              "Kooperativa neplní v rozsahu kompenzace od dopravce. Pokud dopravce zaplatí až později, odpovídající část pojistného plnění se vrací.",
            ],
            emphasis: "exclusion",
          },
        ],
      },
      axa: {
        headline: axaHasExtendedCover ? "pevně 5 000 Kč" : "V REFERENCE nelze sjednat",
        detail: axaHasExtendedCover
          ? "Obnosové plnění při zpoždění řádně odbavených zavazadel o 6 nebo více hodin"
          : "Připojištění Cestování letadlem je dostupné jen ke KOMFORT a EXCELENT",
        source: "AXA VPPCP 15. 6. 2026, přehled plnění a část III oddíl M, str. 3 a 19; Cestování letadlem",
        badge: "Volitelné připojištění Cestování letadlem",
        points: axaHasExtendedCover
          ? [
              "Plnění není vázáno na skutečnou výši nákupu náhradních věcí; jde o sjednanou kompenzaci.",
              "Nevztahuje se na zpoždění při návratu ze zahraničí bez ohledu na místo příletu.",
              "Klient doloží letenku a údaje o letu, potvrzení letecké společnosti o skutečném dodání a zavazadlové visačky.",
            ]
          : ["Pro letecké připojištění je nutné zvolit KOMFORT nebo EXCELENT."],
        metric: axaHasExtendedCover ? 5_000 : 0,
        sections: axaHasExtendedCover
          ? [
              {
                label: "Další výluka",
                text: "AXA neplní, pokud zpoždění zavazadel způsobila stávka nebo jiné dopravní či přepravní omezení probíhající nebo oznámené v době odletu.",
                emphasis: "exclusion" as const,
              },
            ]
          : undefined,
      },
    },
    {
      id: "flight-delay",
      section: "Let",
      icon: Plane,
      title: "Let má zpoždění nebo je zrušen",
      description: "ČPP a Kooperativa nahrazují vymezené náklady; AXA kompenzuje zpožděný přílet pevnou sazbou za hodinu.",
      verdict: {
        tone: "balanced",
        label: "Tři různé principy",
        detail: "ČPP plní doloženou stravu a ubytování už od 3 hodin, Kooperativa širší náklady od 6 hodin nebo při zrušení nejvýše 2 hodiny před odletem a AXA obnos za zpožděný přílet po prvních 6 hodinách.",
      },
      cpp: {
        headline: "až 5 000 Kč",
        detail: "Náhradní ubytování a strava při zpoždění pravidelné linky",
        source: "DPPLETP 1/18, čl. 2–5",
        points: [
          "Zpoždění musí způsobit letecký dopravce a trvat nejméně 3 hodiny.",
          "Při škodě není nutné kontaktovat asistenční službu.",
          "Únos letadla: pevné plnění 10 000 Kč.",
        ],
        metric: 5_000,
        badge: "Volitelné připojištění Let PLUS",
        sections: [
          {
            label: "Kdy vzniká nárok",
            items: [
              "Zpoždění pravidelné letecké linky způsobil letecký dopravce a trvá nejméně 3 hodiny.",
              "Klient kvůli zpoždění prokazatelně zaplatil náhradní ubytování nebo stravu.",
            ],
            emphasis: "benefit",
          },
          {
            label: "Co klient doloží",
            items: [
              "Písemné potvrzení dopravce o zpoždění a délce jeho trvání.",
              "Originály účtenek za náhradní ubytování a stravu.",
            ],
          },
          {
            label: "Co se nehradí / omezení",
            items: [
              "Zpoždění kratší než 3 hodiny.",
              "Zpoždění nepravidelné letecké linky (charteru).",
              "Zmeškání odletu vlastním zaviněním pojištěného.",
              "Zpoždění kvůli stávce nebo jinému opatření dopravce, cestovní kanceláře či organizátora služby, které bylo známé už před plánovaným odletem.",
              "Finanční ztráta pojištěného.",
            ],
            emphasis: "exclusion",
          },
          {
            label: "Další plnění a služby",
            items: [
              "Při únosu letadla ČPP vyplatí 10 000 Kč; klient doloží potvrzení dopravce o únosu a době jeho trvání.",
              "Při škodě není nutné kontaktovat asistenční službu.",
            ],
          },
        ],
      },
      koop: {
        headline: koop.label === "PLUS" ? "až 10 000 Kč" : "až 8 000 Kč",
        detail: "Strava, úschova zavazadel, doprava do ubytování a ubytování",
        source: "M-750/23, str. 11 a 36–37",
        points: [
          koop.label === "PLUS" ? "Doložené náklady jsou omezeny stropem 1 500 Kč za 7. a každou další hodinu." : "Doložené náklady jsou omezeny stropem 1 000 Kč za 7. a každou další hodinu.",
          "Zpoždění nejméně 6 hodin nebo zrušení letu nejvýše 2 hodiny před odletem.",
          "Pokud se klient kvůli události nemůže včas vrátit do ČR, lze po souhlasu prodloužit pojištění maximálně o 2 dny.",
        ],
        metric: koop.label === "PLUS" ? 10_000 : 8_000,
        badge: "Balíček ÚZO",
        sections: [
          {
            label: "Kdy vzniká nárok",
            items: [
              "Kooperativa hradí přiměřené a prokazatelně zaplacené náklady na stravu, úschovu zavazadel, dopravu do místa ubytování a ubytování.",
              "Podmínkou je zpoždění odletu nejméně o 6 hodin nebo zrušení letu nejvýše 2 hodiny před plánovaným odletem.",
            ],
            emphasis: "benefit",
          },
          {
            label: "Co klient doloží",
            items: [
              "Doklady prokazující délku zpoždění nebo okamžik zrušení letu.",
              "Doklady o zaplacení stravy, úschovy zavazadel, dopravy do ubytování a ubytování.",
              "Potvrzení, zda dopravce poskytl kompenzaci a v jaké výši.",
            ],
          },
          {
            label: "Co se nehradí / omezení",
            text: "Kooperativa nehradí tu část nákladů, kterou nahradil dopravce. Pokud dopravce zaplatí až po výplatě pojistného plnění, má Kooperativa právo na vrácení odpovídající částky.",
            emphasis: "exclusion",
          },
          {
            label: "Další plnění a služby",
            items: [
              "Pokud se klient kvůli události nemůže do konce pojištění vrátit do ČR, lze se souhlasem Kooperativy nebo asistence prodloužit pojištění nejvýše o 2 dny.",
              "Asistence se vztahuje na zpoždění delší než 3 hodiny, zrušení letu, odepření nástupu, zmeškání návazného letu nebo snížení dopravní třídy.",
              "Telefonicky vysvětlí základní práva cestujícího a možnosti řešení letecké nepravidelnosti.",
              "Může vůči dopravci uplatnit nárok podle příslušného nařízení EU. Klient musí uzavřít příkazní smlouvu a poskytnout součinnost.",
              "Poskytovateli asistence náleží odměna minimálně 19 % z částky, kterou pro klienta na dopravci vymůže; konkrétní odměnu upravuje příkazní smlouva.",
              "Při žádosti o pomoc klient sdělí identifikační údaje, číslo pojistné smlouvy, popis situace, telefonní kontakt a další potřebné informace.",
            ],
          },
        ],
      },
      axa: {
        headline: axaHasExtendedCover ? "500 Kč/h · nejvýše 10 000 Kč" : "V REFERENCE nelze sjednat",
        detail: axaHasExtendedCover
          ? "Za každou započatou hodinu čekání až po uplynutí prvních 6 hodin"
          : "Připojištění Cestování letadlem je dostupné jen ke KOMFORT a EXCELENT",
        source: "AXA VPPCP 15. 6. 2026, přehled plnění a část III oddíl M, str. 3 a 19; Cestování letadlem",
        badge: "Volitelné připojištění Cestování letadlem",
        points: axaHasExtendedCover
          ? [
              "Posuzuje se zpoždění příletu do cílové destinace v zahraničí nebo ze zahraničí zpět, nikoli jen zpoždění odletu.",
              "Kryté příčiny jsou stávka, provozní důvod, selhání stroje a nepřízeň počasí.",
              "Za prvních 6 hodin zpoždění nevzniká plnění; poté 500 Kč za každou započatou hodinu, celkem nejvýše 10 000 Kč.",
            ]
          : ["Pro letecké připojištění je nutné zvolit KOMFORT nebo EXCELENT."],
        metric: axaHasExtendedCover ? 10_000 : 0,
        sections: axaHasExtendedCover
          ? [
              {
                label: "Co se nehradí / omezení",
                items: [
                  "Zpoždění či zrušení kvůli stávce nebo provoznímu důvodu známému už 24 hodin před check-inem.",
                  "Klient se řádně a včas nezaregistroval k odletu, pokud mu v tom nezabránila předem neznámá stávka či provozní důvod.",
                  "Let byl opožděn nebo zrušen nařízením civilního leteckého úřadu či obdobné autority.",
                ],
                emphasis: "exclusion" as const,
              },
              {
                label: "Co klient doloží",
                items: [
                  "Letenku, číslo letu, dopravce, letiště a plánované časy příletu a odletu.",
                  "Potvrzení letecké společnosti o skutečném zpoždění, případně zrušení letu.",
                ],
              },
            ]
          : undefined,
      },
    },
    {
      id: "missed-departure",
      section: "Cesta a komplikace",
      icon: Plane,
      title: "Klient zmešká plánovaný odjezd",
      description: "Nejde o zpožděný let, ale o náhradní dopravu poté, co klient kvůli kryté překážce nestihne původní spoj.",
      verdict: {
        tone: "balanced",
        label: "Rozhoduje směr cesty i varianta",
        detail: `Kooperativa ${koop.label} hradí zmeškaný návrat do ČR do ${formatMoney(koop.label === "PLUS" ? 10_000 : 5_000)}. ${axaHasExcelentCover ? "AXA EXCELENT má 20 000 Kč pro odjezd z ČR do zahraničí." : `AXA ${axa.label} zmeškaný odjezd neobsahuje.`} Jde o různé situace.`,
      },
      cpp: {
        headline: "Bez samostatného limitu v dodaných podkladech",
        detail: "Cesta PLUS řeší jiné formy přerušení či nevyužití cesty",
        source: "DPPCP 1/22; přehled dodaných podmínek ČPP",
        badge: "Bez přímého protějšku",
        points: ["Případnou související pomoc je nutné posoudit podle jiné sjednané asistence a konkrétní příčiny."],
      },
      koop: {
        headline: formatMoney(koop.label === "PLUS" ? 10_000 : 5_000),
        detail: "Mimořádná doprava v ekonomické třídě ze zahraničí zpět do ČR",
        source: "M-750/23, pojištění léčebných výloh, přehled limitů a čl. 7 odst. 2 písm. d), str. 10 a 27",
        badge: "Součást léčebných výloh",
        points: [
          "Důvodem může být dopravní nehoda vozidla či vlaku cestou na odjezd, mimořádné zrušení nebo zkrácení veřejné dopravy, předem neohlášená stávka nebo živelní událost.",
          "Kryje cestu ze zahraničí do ČR, nikoli náhradní odjezd z ČR do zahraniční destinace.",
        ],
        metric: koop.label === "PLUS" ? 10_000 : 5_000,
      },
      axa: {
        headline: axaHasExcelentCover ? "až 20 000 Kč" : `Ve variantě ${axa.label} není pojištěno`,
        detail: axaHasExcelentCover
          ? "Náhradní doprava do místa pobytu v zahraničí"
          : "Pojištění zmeškaného odjezdu obsahuje pouze EXCELENT",
        source: "AXA VPPCP 15. 6. 2026, přehled plnění a část III oddíl H, str. 2 a 17",
        badge: axaHasExcelentCover ? "Varianta EXCELENT" : "Bez krytí",
        points: axaHasExcelentCover
          ? [
              "Původní odjezd z ČR musí být zmeškán kvůli dopravní nehodě či technické poruše prostředku cestou na odjezd nebo zpoždění meziměstské hromadné dopravy.",
              "Náhradní dopravu musí klient předem odsouhlasit s AXA Assistance.",
              "Neplní se známá porucha před nástupem cesty ani předem známé či předpokládatelné zpoždění meziměstské dopravy.",
            ]
          : ["Pro toto krytí je nutné zvolit variantu EXCELENT."],
        metric: axaHasExcelentCover ? 20_000 : 0,
      },
    },
    {
      id: "quarantine",
      section: "Cesta a komplikace",
      icon: HeartHandshake,
      title: "Klientovi je v zahraničí nařízena karanténa",
      description: "Všechny tři produkty mohou řešit dodatečné ubytování, stravu a náhradní dopravu do ČR, ale jinak nastavují procento i limity.",
      verdict: {
        tone: "balanced",
        label: "Záleží na variantě a výši nákladů",
        detail: `ČPP a AXA mají oddělený limit pro pobyt a návrat. Kooperativa hradí 80 % vícenákladů do 30 000 Kč. Ve zvolené AXA je celkem ${formatMoney(axaQuarantineLimit)}.`,
      },
      cpp: {
        headline: `Covid PLUS · ${formatMoney(cppQuarantineTotalLimit)}`,
        detail: `Preventivně nařízená karanténa · celkový limit ve variantě ${cpp.label}`,
        source: "DPPCOV 1/23, čl. 2–5 (uložené PDF)",
        caution: "Rozpor verzí: uložené DPPCOV 1/23 mají MAXI 25 000 + 25 000 Kč. Veřejný odkaz ČPP označený 1/23 k 11. 9. 2026 vrací DPPCOV 1/21 s MAXI 20 000 + 20 000 Kč. Uvádíme verzi 1/23; před sjednáním ověřte dokument připojený ke smlouvě.",
        badge: "Volitelné připojištění Covid PLUS",
        metric: cppQuarantineTotalLimit,
        points: [
          `Ubytování a strava: ${formatMoney(cppQuarantinePartLimit)}`,
          `Náhradní doprava: ${formatMoney(cppQuarantinePartLimit)}`,
          "Je nutné kontaktovat asistenční službu.",
        ],
        sections: [
          {
            label: "Kdy vzniká nárok",
            items: [
              "Klient vycestoval do zahraničí a tam mu státní nebo zdravotní instituce preventivně nařídila karanténu kvůli výskytu covidu-19.",
              "Kvůli karanténě účelně zaplatil ubytování a stravu nad rámec již uhrazeného pobytu.",
              "Náhradní doprava se hradí, pokud po skončení karantény nebylo možné využít původně plánovaný způsob návratu.",
            ],
            emphasis: "benefit",
          },
          {
            label: "Co klient doloží",
            items: [
              "Zprávu o nařízení preventivní karantény nebo lékařské potvrzení.",
              "Doklady o úhradě náhradního ubytování, stravy a případně náhradní dopravy.",
              "Klient musí při vzniku události kontaktovat asistenční službu.",
            ],
          },
          {
            label: "Co se nehradí / omezení",
            items: [
              "Karanténa byla nařízena před sjednáním pojištění nebo bylo předem známo, že bude nařízena.",
              "Náklady uhradil stát nebo už byly zahrnuty v zaplaceném pobytu.",
              "Událost nastala na území ČR.",
            ],
            emphasis: "exclusion",
          },
        ],
      },
      koop: {
        headline: "KARANTÉNA · 30 000 Kč",
        detail: "80 % doložených vícenákladů na jednu pojištěnou osobu",
        source: "M-750/23, str. 8, 12, 46–47 a 52",
        badge: "Zdarma k LVZ · musí být sjednáno",
        metric: 30_000,
        points: [
          "Strava, ubytování a náhradní doprava ze zahraničí do ČR.",
          "Typicky když nařízená karanténa prodlouží pobyt nebo znemožní plánovaný návrat.",
        ],
        sections: [
          {
            label: "Kdy vzniká nárok",
            items: [
              "Klient má sjednané léčebné výlohy pro Evropu nebo svět a pojištění KARANTÉNA je uvedeno v pojistné smlouvě.",
              "Klientovi byla v zahraničí kvůli výskytu covidu-19 nařízena karanténa.",
              "Kvůli karanténě v zahraničí nebo při zpáteční cestě vznikly nezbytné a přiměřené vícenáklady na stravu, ubytování nebo náhradní dopravu do ČR.",
            ],
            emphasis: "benefit",
          },
          {
            label: "Co klient doloží",
            items: [
              "Doklad o nařízené karanténě.",
              "Doklady o zaplacení vzniklých vícenákladů.",
              "Přiměřeně se použijí také povinnosti stanovené pro pojištění STORNO.",
            ],
          },
          {
            label: "Co se nehradí / omezení",
            items: [
              "Kooperativa neplní, pokud bylo možné vznik události před odjezdem předvídat, zejména když už byla v cílové destinaci nařízena povinná preventivní karanténa.",
              "Pojištění KARANTÉNA se nevztahuje na území ČR.",
              "Hradí se 80 % doložených vícenákladů, celkem nejvýše 30 000 Kč.",
              "Jiné náklady než nezbytná a přiměřená strava, ubytování nebo náhradní doprava do ČR toto připojištění nekryje.",
            ],
            emphasis: "exclusion",
          },
        ],
      },
      axa: {
        headline: axaQuarantineLimit > 0 ? `celkem až ${formatMoney(axaQuarantineLimit)}` : "V REFERENCE není pojištěno",
        detail:
          axa.label === "EXCELENT"
            ? "Ubytování a strava 30 000 Kč + návrat do ČR 30 000 Kč"
            : axa.label === "KOMFORT"
              ? "Ubytování a strava 15 000 Kč + návrat do ČR 15 000 Kč"
              : "Covid karanténu obsahují pouze KOMFORT a EXCELENT",
        source: "AXA VPPCP 15. 6. 2026, přehled plnění a část III oddíl A, str. 2 a 10–12",
        badge: axaQuarantineLimit > 0 ? `Součást varianty ${axa.label}` : "Bez krytí",
        metric: axaQuarantineLimit,
        points: axaQuarantineLimit > 0
          ? [
              "Hradí účelně vynaložené náklady na ubytování a stravu po dobu Covid karantény a náklady na návrat do ČR.",
              "Karanténa musí být preventivně nařízena v souvislosti s covidem-19.",
            ]
          : ["Pro krytí Covid karantény je nutné zvolit KOMFORT nebo EXCELENT."],
        sections: axaQuarantineLimit > 0
          ? [
              {
                label: "Důležitá omezení",
                items: [
                  "Nehradí se karanténa, pokud klient vlastní vinou nesplnil vstupní podmínky cílové destinace.",
                  "Nehradí se karanténa, kterou vstupní podmínky dané země vyžadují bez ohledu na konkrétní pojistnou událost.",
                  "Parkovné se nehradí.",
                ],
                emphasis: "exclusion" as const,
              },
            ]
          : undefined,
      },
    },
    {
      id: "after-departure",
      section: "Cesta a komplikace",
      icon: Clock3,
      title: "Klient sjedná pojištění až po odjezdu",
      description: "ČPP a Kooperativa mají výslovné pravidlo pro sjednání na cestě. U AXA je doložený odklad počátku ve stejný den; přijetí návrhu po odjezdu je nutné potvrdit.",
      verdict: {
        tone: "attention",
        label: "U AXA nelze zaměnit dvě odlišná pravidla",
        detail: "ČPP výslovně uvádí 3 kalendářní dny po sjednání na nastoupené cestě a Kooperativa 24 hodin. AXA stanoví 4 hodiny při počátku ve stejný den, ale výslovné pravidlo pro sjednání až po odjezdu v dodaných VPP není.",
      },
      cpp: {
        headline: "3 kalendářní dny",
        detail: "Čekací doba po uzavření smlouvy na již nastoupené cestě",
        source: "VPPCP 1/18, čl. 7 odst. 8",
        badge: "Obecné ustanovení",
        points: ["Nevztahuje se na navazující pojištění"],
        metric: null,
      },
      koop: {
        headline: "24 hodin",
        detail: "Čekací doba od sjednání po odjezdu do zahraničí",
        source: "M-750/23, str. 3 a 54",
        badge: "Obecné ustanovení",
        points: ["Nevztahuje se na bezprostředně navazující pojištění u Kooperativy"],
        metric: null,
      },
      axa: {
        headline: "4 hodiny · nutno ověřit po odjezdu",
        detail: "Obecné pravidlo pro shodný den počátku a uzavření není výslovnou úpravou sjednání na nastoupené cestě",
        source: "AXA VPPCP 15. 6. 2026, část II čl. 5 odst. 4, str. 6; Základní informace 05/2026",
        badge: "Počátek ve stejný den",
        points: [
          "Podmínky stanoví čtyřhodinový odklad obecně pro smlouvu s počátkem ve stejný den, ne jako samostatný článek nazvaný sjednání po odjezdu.",
          "Před sjednáním po odjezdu je nutné ověřit, zda AXA takový návrh přijme. Smlouva vzniká zaplacením a rozhoduje datum počátku uvedené ve smlouvě.",
        ],
        metric: null,
      },
    },
    {
      id: "unused",
      section: "Cesta a komplikace",
      icon: CircleAlert,
      title: "Klient musí cestu přerušit nebo se předčasně vrátit",
      description: "Kompenzace při předčasném návratu, hospitalizaci nebo nevyužité službě.",
      verdict: {
        tone: "balanced",
        label: "Odlišný princip plnění",
        detail: "ČPP vyplácí částku za nevyužité dny; Kooperativa hradí doložené náklady a ve vážných případech může zajistit dražší návrat.",
      },
      cpp: {
        headline: "až 28 000 Kč",
        detail: "Cesta plus — 2 000 Kč za každý nevyužitý den",
        source: "DPPCP 1/22, čl. 2–4",
        points: ["Maximálně za 14 dní", "Při pojistné události je nutné kontaktovat asistenční službu"],
        metric: 28_000,
        badge: "Připojištění Cesta plus",
      },
      koop: {
        headline: koop.label === "PLUS" ? "až 15 000 Kč" : "až 10 000 Kč",
        detail: "Standardní limit přerušení cesty i nevyužité cestovní služby",
        source: "M-750/23, str. 11 a 41–42",
        points: [
          "Nevyužitá cestovní služba: 80 % doložených nákladů.",
          "V přesně vymezených naléhavých případech může let do ČR zajištěný asistencí dosáhnout až 250 000 Kč.",
        ],
        metric: koop.label === "PLUS" ? 15_000 : 10_000,
        badge: "Balíček ÚZO",
      },
      axa: {
        headline: axaHasExcelentCover ? "doprava 20 000 Kč + až 5 000 Kč" : `Ve variantě ${axa.label} není pojištěno`,
        detail: axaHasExcelentCover
          ? "Předčasný návrat a 500 Kč za každý den nevyužité dovolené"
          : "Pojištění předčasného návratu je pouze v EXCELENT",
        source: "AXA VPPCP 15. 6. 2026, přehled plnění a část III oddíl I, str. 2 a 17–18",
        badge: axaHasExcelentCover ? "Varianta EXCELENT" : "Bez krytí",
        metric: axaHasExcelentCover ? 25_000 : 0,
        points: axaHasExcelentCover
          ? [
              "Kryté důvody: úmrtí či neočekávaná hospitalizace rodinného příslušníka nebo škoda na vlastním majetku nad 200 000 Kč.",
              "Předčasná doprava musí nahradit původně plánovaný způsob návratu; nehradí se návrat méně než 36 hodin před plánovaným termínem.",
            ]
          : ["Pro předčasný návrat a denní kompenzaci nevyužité dovolené je nutný EXCELENT."],
      },
    },
    {
      id: "cancellation",
      section: "Cesta a komplikace",
      icon: FileText,
      title: "Klient musí cestu zrušit před odjezdem",
      description: "Samostatně sjednávané pojištění storna zakoupené cestovní služby.",
      verdict: {
        tone: "balanced",
        label: "Porovnat částku, důvody i termín sjednání",
        detail: "AXA umožňuje sjednat pojistnou částku až 500 000 Kč se spoluúčastí 20 %. ČPP uvádí produktové maximum 60 000 Kč; Kooperativa v dodaných podmínkách jeden univerzální maximální strop neuvádí.",
      },
      cpp: {
        headline: "až 60 000 Kč · 100 % / 50 %",
        detail: "Nejvýše do pojistné částky sjednané ve smlouvě",
        source: "ČPP IPID 1/CP/CP2/2023, str. 1; DPPSTP 1/23, čl. 3–6",
        points: [
          "60 000 Kč je maximální sjednatelná pojistná částka produktu, nikoli automatický limit každé smlouvy.",
          "Sjednat nejpozději třetí kalendářní den od celkového uhrazení služby. U souvisejících služeb se lhůta počítá od celkového uhrazení první z nich.",
          "Při sjednání méně než 14 dní před cestou je spoluúčast 50 %.",
        ],
        metric: null,
        badge: "Volitelné připojištění Storno PLUS",
      },
      koop: {
        headline: "80 % nebo 100 % stornopoplatků",
        detail: "Maximálně do odpovídajícího podílu celkové ceny služby uvedené ve smlouvě",
        source: "M-750/23, str. 11 a 42–44",
        points: [
          "100 % se hradí jen u vymezených závažných zdravotních důvodů a úmrtí; u ostatních sjednaných důvodů 80 %.",
          "Sjednat do 3 pracovních dnů od úhrady zálohy; při sjednání až po doplatku lze pojistit jen částku doplatku.",
          "Při sjednání méně než 14 dní před čerpáním může pojistitel snížit plnění o 50 %. Výjimka: sjednání v den objednání a zaplacení ceny nebo zálohy.",
        ],
        metric: null,
        badge: "Volitelné pojištění STORNO",
      },
      axa: {
        headline: "až 500 000 Kč · spoluúčast 20 %",
        detail: "Nejvýše do pojistné částky uvedené ve smlouvě",
        source: "AXA VPPCP 15. 6. 2026, přehled plnění a část III oddíl J, str. 3 a 18–19; Storno cesty",
        badge: "Volitelné ke všem variantám",
        points: [
          "Při sjednání méně než 15 dní před začátkem cesty musí být storno uzavřeno nejpozději v den úplného zaplacení cestovní služby.",
          "Kryté důvody zahrnují vymezené akutní zdravotní události, úmrtí, závažnou škodu na majetku, vloupání vyžadující přítomnost, nedobrovolnou ztrátu zaměstnání a rozvod.",
          "Při současném připojištění mazlíčka může být důvodem i jeho náhlé závažné onemocnění nebo úraz.",
        ],
        sections: [
          {
            label: "Hlavní omezení",
            items: [
              "Před sjednáním projevené zdravotní potíže a odkladná péče.",
              "Těhotenství po ukončeném 31. týdnu.",
              "Události v cíli související s geopolitickou či klimatickou situací, epidemií, zamítnutím víza nebo nemožností čerpat dovolenou.",
              "Pojistné, poplatky za vízum a jiné položky, které nejsou krytým stornopoplatkem.",
            ],
            emphasis: "exclusion",
          },
        ],
      },
    },
    {
      id: "vehicle-assistance",
      section: "Cesta a komplikace",
      icon: CarFront,
      title: "Auto se porouchá nebo havaruje v zahraničí",
      description: "Všechny tři služby řeší vozidlo i posádku, ale jinak nastavují odtah, ubytování, repatriaci a náhradní auto.",
      verdict: {
        tone: "balanced",
        label: "Záleží na prioritě klienta",
        detail: "Kooperativa má náhradní auto a vyšší souhrnný kilometrový strop počítaný odlišným způsobem; ČPP má delší místní odtah, více nocí a kryté vyproštění.",
      },
      cpp: {
        headline: "Auto PLUS",
        detail: "Místní odtah 100 km; návrat vozidla do ČR do 1 500 km",
        source: "DPPAP 1/18, čl. 4–6",
        badge: "Volitelné připojištění Auto PLUS",
        points: ["Oprava 1 normohodina; vyproštění 20 000 Kč", "Ubytování 2 000 Kč/os./noc, nejvýše 3 noci", "Bez uvedeného náhradního vozidla"],
        sections: [
          {
            label: "Podmínka návratu",
            text: "Odtah do ČR a návrat posádky vznikají, pokud vozidlo nelze opravit do 60 hodin nebo bylo odcizeno. Služby se řeší přes asistenci.",
          },
        ],
      },
      koop: {
        headline: "Asistence HOLIDAY",
        detail: "Místní odtah 50 km; návrat do ČR v souhrnném stropu 4 000 km včetně příjezdu a návratu odtahového vozidla",
        source: "M-750/23, str. 12 a 47–50",
        badge: "Volitelné připojištění HOLIDAY",
        points: ["Náhradní vozidlo až 5 dní", "Ubytování nejvýše 2 noci, obvykle 40 EUR/os./noc", "Telefonické tlumočení a náhradní řidič"],
        sections: [
          {
            label: "Důležité podmínky",
            items: [
              "Návrat do ČR až při neopravitelnosti do 48 hodin; do 4 000 km se započítává i cesta odtahového vozidla z ČR a zpět.",
              "Vyproštění vozidla mimo komunikaci nebo převráceného vozidla není součástí služby.",
              "Vozidlo nesmí být starší 20 let a služby musí organizovat asistence.",
            ],
            emphasis: "exclusion",
          },
        ],
      },
      axa: {
        headline: "Autoasistence",
        detail: "Oprava na místě 1 hodina nebo odtah; repatriace vozidla do ČR až 55 000 Kč",
        source: "AXA VPPCP 15. 6. 2026, přehled plnění a část III oddíl Q, str. 3 a 20–21; Autoasistence",
        badge: "Volitelné jen k jednorázové cestě",
        points: [
          "V ČR hotel 1 noc do 2 000 Kč/os./noc nebo náhradní vozidlo kategorie B na 1 den; v zahraničí 2 noci do 80 EUR/os./noc nebo vůz na 2 dny.",
          "Parkovné nejvýše 3 dny; v zahraničí sešrotování vozidla do 500 EUR.",
          "Repatriace do ČR do 55 000 Kč, pokud vozidlo nelze v zahraničí opravit do 5 pracovních dní.",
        ],
        sections: [
          {
            label: "Základní podmínky",
            items: [
              "Vozidlo do 3,5 tuny, nejvýše 15 let staré, registrované v ČR a nepoužívané k pronájmu za úplatu.",
              "Území musí být v zelenokaretním systému; v ČR platí jen při cestě do zahraničí nebo návratu.",
              "Způsob pomoci organizuje AXA Assistance; samostatně objednané služby se bez souhlasu nehradí.",
            ],
            emphasis: "exclusion",
          },
        ],
      },
    },
    {
      id: "liability",
      section: "Odpovědnost",
      icon: ShieldCheck,
      title: "Klient způsobí újmu jiné osobě",
      description: "Újma na zdraví nebo majetku při běžném občanském životě během cesty. Absence položky v jednom seznamu výluk sama o sobě neznamená, že ji daný produkt kryje.",
      verdict: {
        tone: "balanced",
        label: "Celkový limit a dílčí limity se liší",
        detail: axaHasExtendedCover
          ? `AXA rozděluje limity: zdraví ${formatMoney(axa.liability)}, věc ${formatMoney(axaHasExcelentCover ? 10_000_000 : 1_500_000)}${axaHasExcelentCover ? " a ušlý zisk 1 mil. Kč" : ""}. ČPP a Kooperativa uvádějí celkový limit.`
          : "REFERENCE pojištění odpovědnosti neobsahuje; ČPP a Kooperativa jej ve zvolených variantách mají.",
      },
      cpp: {
        headline: formatMoney(cpp.liability),
        detail: "Celkový limit odpovědnosti",
        source: "DPPODC 1/18, čl. 2–8",
        points: [
          `Právní zastoupení a obhajoba: ${formatMoney(cpp.legal ?? 0)}`,
          `Škoda na pronajaté movité věci od profesionální půjčovny: ${formatMoney(cppBorrowedThingLimit)}. Zahrnuje sportovní vybavení i auto z půjčovny.`,
          CPP_RENTAL_CAR_CONFIRMATION.detail,
          "Při sjednaných pracovních cestách také újma na svěřené věci vzniklá při plnění pracovních úkolů.",
        ],
        sections: [
          {
            label: "Společné nebo obdobné výluky",
            items: [
              "Finanční sankce; neoprávněná činnost nebo neoprávněné užívání majetku.",
              "Výdělečná a provozní činnost, profesionální sport, činnost s povinným pojištěním odpovědnosti a nároky z pracovního úrazu či nemoci z povolání.",
              "Odpovědnost převzatá nad rámec právních předpisů.",
              "Vozidla a plavidla v rozsahu povinného pojištění, letadla a další vyjmenované dopravní prostředky.",
              "Postupné znečištění životního prostředí.",
              "Újma vůči blízkým osobám, osobám jim blízkým a majetkově či personálně propojeným právnickým osobám.",
            ],
            emphasis: "exclusion",
          },
          {
            label: "Užívané, převzaté a zapůjčené věci",
            items: [
              "Obecně se nehradí újma na převzaté věci.",
              "Výjimkou je nemovitost sloužící k přechodnému pobytu a její movité vybavení.",
              `Zapůjčená věc je kryta do 10 % limitu odpovědnosti, nejvýše ${formatMoney(cppBorrowedThingLimit)}.`,
              "Širší krytí pronajatých movitých věcí zahrnuje například kolo, lyže a podle potvrzení ČPP sděleného správcem srovnání také auto z profesionální půjčovny.",
              "U pronajatých plavidel odlišit škodu na samotné lodi od škody způsobené jejím provozem; uplatní se zvláštní územní omezení a výluky plavidel.",
              "Při sjednaných pracovních cestách může být kryta také svěřená věc poškozená při plnění pracovních úkolů.",
            ],
          },
          {
            label: "Další výslovné výluky ČPP",
            text: "Jde o položky výslovně uvedené ve zvláštních podmínkách ČPP; jejich absence ve zvláštním seznamu Kooperativy automaticky neznamená krytí.",
            items: [
              "Prodlení se splněním smluvní povinnosti.",
              "Držba zchátralé nebo neudržované nemovitosti určené k přechodnému pobytu.",
              "Ztráta věci, kromě ztráty v důsledku smrti, ztráty vědomí nebo úrazu pojištěného.",
              "Motoristická a letecká sportovní činnost.",
              "Rádiem řízené modely provozované na nevhodném či neurčeném místě nebo v rozporu s místními předpisy.",
              "Záznamy na zvukových, obrazových a datových nosičích, nehmotný majetek a osobnostní práva nesouvisející s újmou na zdraví nebo usmrcením.",
              "Újma osobám zaměstnaným nebo vypomáhajícím v domácnosti při této činnosti a plnění odporující mezinárodním sankcím.",
            ],
            emphasis: "exclusion",
          },
          {
            label: "Povinnosti při škodě",
            items: [
              "Bezodkladně přes asistenční službu oznámit okolnosti, které mohou vést ke škodě, i nárok uplatněný poškozeným přímo, u soudu nebo jiného orgánu.",
              "Postupovat podle pokynů ČPP; bez jejího souhlasu se nezavázat k úhradě promlčeného nároku ani neuzavřít soudní smír.",
              "Předložit požadované doklady ke škodné události.",
            ],
          },
        ],
        metric: null,
        badge: "Volitelné pojištění",
        exclusions: CPP_LIABILITY_EXCLUSIONS,
      },
      koop: {
        headline: formatMoney(koop.liability),
        detail: "Celkový limit odpovědnosti bez spoluúčasti",
        source: "M-750/23, str. 11 a 37–41",
        points: [
          koop.legal ? `Samostatné pojištění právní pomoci: ${formatMoney(koop.legal)}` : "Samostatné pojištění právní pomoci není v KLASIK pojištěno",
          "Škoda na pronajaté movité věci: 10 000 Kč",
          koop.label === "PLUS" ? "Spoluúčast na pronajatém motorovém vozidle: 10 000 Kč" : "Spoluúčast na pronajatém motorovém vozidle není v KLASIK pojištěna",
        ],
        sections: [
          {
            label: "Společné nebo obdobné výluky",
            items: [
              "Pokuty, penále a jiné sankce; neoprávněné užívání věci nebo zvířete.",
              "Výdělečná činnost, profesionální sport, činnost s povinným pojištěním odpovědnosti a nároky z pracovního úrazu či nemoci z povolání.",
              "Odpovědnost převzatá nad rámec právních předpisů, včetně smluvně prodlouženého promlčení nebo vzdání se námitky promlčení.",
              "Provoz motorového vozidla a plavidla vyžadujícího průkaz způsobilosti a vyjmenované formy létání.",
              "Znečištění životního prostředí bez omezení pouze na postupné znečištění.",
              "Újma manželovi, registrovanému partnerovi, sourozenci, příbuzným v přímé řadě, členům domácnosti a majetkově propojené právnické osobě.",
            ],
            emphasis: "exclusion",
          },
          {
            label: "Užívané, převzaté a zapůjčené věci",
            items: [
              "Obecně se nehradí újma na movité věci nebo zvířeti, které klient užívá, má u sebe nebo převzal ke splnění svého závazku.",
              "Výjimkou jsou věci či zvířata při nepracovní praktické výuce nebo stáži a vybavení ubytovacího zařízení.",
              "Prokazatelně pronajatá movitá věc od profesionálního pronajímatele je kryta do sublimitu 10 000 Kč; motorová vozidla, motorová plavidla, plachetnice, letadla a létající zařízení jsou z tohoto krytí vyloučeny.",
              koop.label === "PLUS" ? "Varianta PLUS hradí spoluúčast do 10 000 Kč u vozidla pronajatého písemnou smlouvou od profesionální autopůjčovny." : "Varianta KLASIK spoluúčast na pronajatém motorovém vozidle nekryje.",
            ],
          },
          {
            label: "Další výslovné výluky Kooperativy",
            text: "Jde o položky výslovně uvedené ve zvláštních podmínkách Kooperativy; jejich absence ve zvláštním seznamu ČPP automaticky neznamená krytí.",
            items: [
              "Úmyslné jednání a události související s alkoholem, omamnými nebo psychotropními látkami.",
              "Předem známé porušení právní povinnosti nebo jiná předem známá skutečnost vedoucí k újmě.",
              "Zavlečení nebo rozšíření nakažlivé choroby lidí, zvířat či rostlin.",
              "Vlastnictví nebo používání zbraní, střeliva, pyrotechniky či výbušnin a vlastnictví nebo držba nemovitosti.",
              "Divoká a exotická zvířata, zvířata určená k podnikání či výdělku a lovecký nebo služební pes při výkonu.",
              "Létání, balony, seskoky a lety s padákem.",
            ],
            emphasis: "exclusion",
          },
          {
            label: "Povinnosti při škodě",
            items: [
              "Bez zbytečného odkladu oznámit nárok poškozeného a vyjádřit se k odpovědnosti, požadované náhradě a její výši.",
              "Oznámit zahájení soudního, správního, trestního nebo rozhodčího řízení a informovat Kooperativu o jeho průběhu a výsledku.",
              "Bez souhlasu Kooperativy neuhradit promlčenou pohledávku ani uplatněný nárok neuspokojit, neuznat nebo smírně nevyřešit.",
              "V řízení postupovat podle pokynů, vznést námitku promlčení a podat opravný prostředek, pokud se s Kooperativou nedohodne jinak.",
              "Nezpůsobit vydání rozsudku pro zmeškání nebo pro uznání.",
              "Při porušení zákazu úhrady promlčené pohledávky nebo uvedených procesních povinností Kooperativa nemusí poskytnout plnění.",
            ],
          },
        ],
        metric: null,
        badge: "Balíček ÚZO",
        exclusions: KOOP_LIABILITY_EXCLUSIONS,
      },
      axa: {
        headline: axaHasExtendedCover ? `zdraví ${formatMoney(axa.liability)}` : "V REFERENCE není pojištěno",
        detail: axaHasExtendedCover
          ? `Věc ${formatMoney(axaHasExcelentCover ? 10_000_000 : 1_500_000)}${axaHasExcelentCover ? "; ušlý zisk 1 mil. Kč" : "; ušlý zisk není pojištěn"}`
          : "Odpovědnost obsahují pouze KOMFORT a EXCELENT",
        source: "AXA VPPCP 15. 6. 2026, přehled plnění a část III oddíl C, str. 2 a 12–13",
        points: axaHasExtendedCover
          ? [
              `Právní ochrana je samostatně do ${formatMoney(axa.legal ?? 0)}.`,
              "Hradí zákonnou odpovědnost podle práva země, kde klient třetí osobě během zahraniční cesty způsobil újmu.",
              "Škoda na věci se hradí v časové ceně.",
            ]
          : ["Pro odpovědnost a právní ochranu je nutné zvolit alespoň KOMFORT."],
        sections: axaHasExtendedCover
          ? [
              {
                label: "Užívané a pronajaté věci",
                items: [
                  "Základní odpovědnost nehradí věci vypůjčené, najaté, svěřené, předané k úschově či užívané za úplatu.",
                  "Výjimkou jsou věci ubytovacího zařízení a samotné ubytovací zařízení.",
                  "Půjčené sportovní vybavení může při vyjmenovaném nebezpečí řešit pojištění zavazadel; spoluúčast na půjčeném vozidle jen samostatné připojištění.",
                ],
                emphasis: "exclusion" as const,
              },
              {
                label: "Povinnosti při škodě",
                items: [
                  "Bez zbytečného odkladu oznámit událost i uplatněný nárok, uvést poškozené a svědky a dodat důkazy, fotografie a policejní protokol.",
                  "Oznámit soudní, správní či rozhodčí řízení a postupovat podle pokynů AXA.",
                  "Bez souhlasu nic neuznávat, neslibovat úhradu ani neuzavírat smír; proti nepříznivému rozhodnutí se včas odvolat, pokud AXA neurčí jinak.",
                ],
              },
            ]
          : undefined,
        metric: null,
        badge: axaHasExtendedCover ? `Varianta ${axa.label}` : "Bez krytí",
        exclusions: AXA_LIABILITY_EXCLUSIONS,
      },
    },
    {
      id: "rental-car-liability",
      section: "Odpovědnost",
      icon: CarFront,
      title: "Klient poškodí vozidlo z autopůjčovny",
      description: "ČPP kryje zákonnou odpovědnost za škodu na zapůjčené věci včetně auta z půjčovny. Kooperativa PLUS a AXA mají výslovné pojištění spoluúčasti na vozidle.",
      verdict: {
        tone: "balanced",
        label: "ČPP má širší krytí pronajatých věcí",
        detail: `ČPP: zákonná odpovědnost za škodu na pronajaté movité věci včetně auta do ${formatMoney(cppBorrowedThingLimit)}. AXA: připojištění spoluúčasti do 60 000 Kč. Kooperativa PLUS: spoluúčast do 10 000 Kč. Rozsah a princip plnění se liší.`,
      },
      cpp: {
        headline: `${formatMoney(cppBorrowedThingLimit)} na škodu na autě`,
        detail: "Odpovědnost za škodu na autě z půjčovny v rámci širšího krytí zapůjčených movitých věcí.",
        caution: "Jde o zákonnou odpovědnost za náhradu škody. Samotné vyúčtování smluvní spoluúčasti, pokuty nebo sankce ještě nezakládá nárok na plnění.",
        source: "DPPODC 1/18, čl. 2 odst. 2 písm. b), čl. 7 odst. 1 písm. d) a odst. 2 písm. a), čl. 8 body 37–38",
        badge: CPP_RENTAL_CAR_CONFIRMATION.label,
        points: [
          CPP_RENTAL_CAR_CONFIRMATION.detail,
          "Zapůjčenou věcí je movitá věc převzatá k oprávněnému užívání od podnikatele, jehož činností je půjčování věcí.",
          "Stejný sublimit se vztahuje také na další kryté pronajaté movité věci, například sportovní vybavení. Rozhoduje odpovědnost klienta za škodu a podmínky pojištění.",
        ],
        metric: null,
        sections: [
          {
            label: "Co je kryto",
            items: [
              "Zákonem stanovená povinnost klienta nahradit autopůjčovně škodu na samotném pronajatém vozidle.",
              `Sublimit činí 10 % z celkového limitu odpovědnosti, nejvýše 500 000 Kč; ve zvolené variantě jde o ${formatMoney(cppBorrowedThingLimit)}.`,
              "Pojištění odpovědnosti ČPP je sjednáno bez spoluúčasti pojištěného.",
            ],
            emphasis: "benefit",
          },
          {
            label: "Co z toho nelze automaticky dovodit",
            items: [
              "Podmínky neslibují samostatné automatické proplacení každé smluvní spoluúčasti z havarijního krytí autopůjčovny.",
              "Nekryje se odpovědnost převzatá smlouvou nad rámec právních předpisů ani smluvní či jiné finanční sankce.",
              "Škodu způsobenou provozem auta jiné osobě řeší povinné ručení pronajatého vozidla; cestovní odpovědnost ji v tomto rozsahu vylučuje.",
            ],
            emphasis: "exclusion",
          },
          {
            label: "Postup při škodě",
            text: "Klient má událost bezodkladně oznámit prostřednictvím asistenční služby a bez souhlasu ČPP nárok neuznávat ani se nezavazovat k jeho úhradě.",
          },
        ],
      },
      koop: {
        headline: koop.label === "PLUS" ? "spoluúčast až 10 000 Kč" : "v KLASIK není pojištěno",
        detail:
          koop.label === "PLUS"
            ? "Výslovná úhrada spoluúčasti na škodě na pronajatém motorovém vozidle"
            : "Pojištění spoluúčasti na pronajatém vozidle je součástí pouze varianty PLUS",
        source: "M-750/23, str. 11 a 37–38",
        badge: koop.label === "PLUS" ? "Varianta PLUS" : "Varianta KLASIK",
        points: [
          koop.label === "PLUS"
            ? "Vozidlo musí být pronajato písemnou smlouvou od podnikatele provozujícího pronájem motorových vozidel."
            : "Pro toto krytí je nutné zvolit variantu PLUS.",
          "Obecný sublimit 10 000 Kč pro pronajaté movité věci motorová vozidla výslovně nezahrnuje; vozidlo řeší jen samostatné pojištění spoluúčasti.",
        ],
        metric: null,
        sections: [
          {
            label: koop.label === "PLUS" ? "Co je výslovně kryto" : "Co chybí v KLASIK",
            items:
              koop.label === "PLUS"
                ? [
                    "Spoluúčast na škodě způsobené na pronajatém motorovém vozidle, maximálně 10 000 Kč.",
                    "Pronájem musí být doložen písemnou smlouvou s profesionální autopůjčovnou.",
                  ]
                : ["K úhradě spoluúčasti na pronajatém motorovém vozidle není ve variantě KLASIK sjednán limit."],
            emphasis: koop.label === "PLUS" ? "benefit" : "exclusion",
          },
          {
            label: "Důležité rozlišení",
            items: [
              "Limit 10 000 Kč se vztahuje na spoluúčast, nikoli automaticky na celou škodu na vozidle.",
              "Odpovědnost za škodu způsobenou provozem motorového vozidla jiné osobě je z cestovní odpovědnosti vyloučena.",
            ],
            emphasis: "exclusion",
          },
        ],
      },
      axa: {
        headline: "spoluúčast až 60 000 Kč",
        detail: "Vozidlo nebo motorový skútr z oficiální půjčovny v zahraničí",
        source: "AXA VPPCP 15. 6. 2026, přehled plnění a část III oddíl P, str. 3 a 20; Půjčené vozidlo",
        badge: "Volitelné ke všem variantám",
        points: [
          "Kryje vyúčtovanou spoluúčast z pojištění půjčeného vozidla při živelní události, dopravní nehodě, vandalismu nebo odcizení.",
          "Vozidlo musí být půjčeno v zahraničí z oficiální autopůjčovny a v době události je musí řídit pojištěný.",
        ],
        metric: null,
        sections: [
          {
            label: "Co se nehradí",
            items: [
              "Vozidlo půjčené v České republice nebo v neoficiální půjčovně.",
              "Událost, při které vůz řídil někdo jiný než pojištěný.",
              "Penále, smluvní poplatky a smluvní pokuty.",
            ],
            emphasis: "exclusion",
          },
          {
            label: "Co klient udělá a doloží",
            items: [
              "Ihned po převzetí vyfotí vozidlo ze všech stran a detailně zdokumentuje stávající poškození.",
              "Událost oznámí policii a doloží smlouvu, vyúčtování spoluúčasti a potvrzení půjčovny nebo zahraničního pojistitele.",
            ],
          },
        ],
      },
    },
    {
      id: "baggage",
      section: "Zavazadla",
      icon: Luggage,
      title: "Klientovi poškodí nebo odcizí zavazadla",
      description: "Celkový limit; u jednotlivých věcí a způsobu uložení platí další sublimity a výluky.",
      verdict: limitVerdict(cpp.baggage, koop.baggage, axa.baggage),
      cpp: {
        headline: formatMoney(cpp.baggage),
        detail: "Celkový limit zavazadel",
        source: "DPPZAV 1/22, čl. 2–7",
        points: [
          `Cennosti a ceniny při krádeži vloupáním nebo loupeži: ${formatMoney(cpp.baggageValuables ?? 0)}`,
          "Plnění v nové ceně; škody způsobené dopravcem jsou vyloučeny.",
        ],
        sections: [
          {
            label: "Kdy vzniká krytá škoda",
            items: [
              "Poškození nebo zničení živelní událostí či únikem kapaliny z technického zařízení.",
              "Odcizení krádeží vloupáním nebo loupeží.",
              "Ztráta jen tehdy, když klient nemohl věc chránit kvůli smrti, ztrátě vědomí nebo úrazu.",
            ],
          },
        ],
        metric: cpp.baggage,
        badge: "Volitelné pojištění",
      },
      koop: {
        headline: formatMoney(koop.baggage),
        detail: "Celkový limit zavazadel",
        source: "M-750/23, str. 11 a 33–35",
        points: [
          "Věci ve stanu, přívěsu či nosiči: 3 000 Kč.",
          "Cenné věci, peníze, ceniny, platební karty a další vyjmenované předměty jsou vyloučeny.",
          "Věci předané dopravci k přepravě jsou vyloučeny.",
        ],
        sections: [
          {
            label: "Kdy vzniká krytá škoda",
            text: "Musí jít o některé z vyjmenovaných nebezpečí, zejména dopravní nehodu, zdravotní indispozici znemožňující věc opatrovat, krádež s překonáním překážky, loupež, požár nebo vyjmenovaný živel.",
          },
        ],
        metric: koop.baggage,
        badge: "Balíček ÚZO",
      },
      axa: {
        headline: axaHasExtendedCover ? formatMoney(axa.baggage) : "V REFERENCE není pojištěno",
        detail: axaHasExtendedCover
          ? `Časová cena; limit na jednu věc ${formatMoney(axaHasExcelentCover ? 20_000 : 10_000)}`
          : "Pojištění zavazadel obsahují až KOMFORT a EXCELENT",
        source: "AXA VPPCP 15. 6. 2026, přehled plnění a část III oddíl G, str. 2 a 16–17",
        points: axaHasExtendedCover
          ? [
              "Osobní doklady: 8 000 Kč; EXCELENT navíc zahrnuje obchodní vybavení.",
              "Kryté jsou živel, odcizení z určené uzamčené místnosti či úschovny, vloupání do skrytého zavazadlového prostoru nebo střešního boxu, dopravní nehoda a loupež.",
              "Škoda na věci svěřené dopravci je běžně vyloučena; výluka se neuplatní při sjednaném připojištění Cestování letadlem.",
            ]
          : ["Pro pojištění zavazadel je nutné zvolit KOMFORT nebo EXCELENT."],
        sections: axaHasExtendedCover
          ? [
              {
                label: "Hlavní omezení",
                items: [
                  "Vloupání do stanu nebo přívěsu se nehradí; výjimkou je obytný vůz nebo obytný karavan.",
                  "Věci nesmějí zůstat v zavazadlovém prostoru odstaveného vozidla nebo přívěsu mezi 22.00 a 6.00.",
                  "Vyloučeny jsou mimo jiné peníze, cennosti, platební karty, jízdenky, vstupenky, klíče, alkohol, zbraně a zvířata.",
                ],
                emphasis: "exclusion" as const,
              },
            ]
          : undefined,
        metric: axa.baggage,
        badge: axaHasExtendedCover ? `Varianta ${axa.label}` : "Bez krytí",
      },
    },
    {
      id: "accident",
      section: "Úrazové pojištění",
      icon: Activity,
      title: "Úraz zanechá trvalé následky",
      description: "Pojišťovna vyplatí příslušné procento z pojistné částky podle rozsahu trvalých následků a oceňovací tabulky.",
      verdict: {
        tone: "balanced",
        label: "Porovnat limit i minimální rozsah",
        detail: "ČPP zakládá nárok už od 2 %, Kooperativa od 5 % a AXA od 10 % celkového ohodnocení trvalých následků.",
      },
      cpp: {
        headline: formatMoney(cpp.permanentInjury),
        detail: "Trvalé následky úrazu",
        source: "DPPURC 1/23, čl. 8 a 10",
        keyFact: {
          label: "Minimální rozsah pro vznik nároku",
          value: "2 %",
        },
        points: [
          "Následky lze uplatnit po ustálení, nejdříve jeden rok po úrazu; pokud se neustálí, rozhoduje stav po třech letech.",
        ],
        metric: cpp.permanentInjury,
        badge: "Volitelné pojištění",
      },
      koop: {
        headline: formatMoney(koop.permanentInjury),
        detail: "Trvalé následky úrazu",
        source: "M-750/23, str. 11 a 29–33",
        keyFact: {
          label: "Minimální rozsah pro vznik nároku",
          value: "5 %",
        },
        points: [
          "Při dopravní nehodě může být plnění za trvalé následky dvojnásobné, jsou-li splněny podmínky ošetření a policejního šetření.",
        ],
        metric: koop.permanentInjury,
        badge: "Balíček ÚZO",
        sections: [
          {
            label: "Dvojnásobek při dopravní nehodě",
            items: [
              "Klient musí být ošetřen zdravotnickou záchrannou službou na místě nebo nejpozději do 24 hodin ve zdravotnickém zařízení.",
              "Nehodu musí bezprostředně na místě šetřit policie nebo jiný příslušný orgán a musí vzniknout záznam o výsledku šetření.",
            ],
            emphasis: "benefit",
          },
        ],
      },
      axa: {
        headline: axaHasExtendedCover ? formatMoney(axa.permanentInjury) : "V REFERENCE není pojištěno",
        detail: axaHasExtendedCover ? "Trvalé následky úrazu" : "Úrazové pojištění obsahují až KOMFORT a EXCELENT",
        source: "AXA VPPCP 15. 6. 2026, přehled plnění a část III oddíl F, str. 2 a 15–16",
        keyFact: axaHasExtendedCover
          ? {
              label: "Minimální rozsah pro vznik nároku",
              value: "10 %",
            }
          : undefined,
        points: axaHasExtendedCover
          ? [
              "Rozsah se posuzuje po ustálení následků, nejdříve po roce; nejpozději do tří let od úrazu.",
            ]
          : ["Pro úrazové plnění je nutné zvolit KOMFORT nebo EXCELENT."],
        metric: axa.permanentInjury,
        badge: axaHasExtendedCover ? `Varianta ${axa.label}` : "Bez krytí",
      },
    },
    {
      id: "accident-death",
      section: "Úrazové pojištění",
      icon: Activity,
      title: "Úraz způsobí smrt pojištěného",
      description: "Jednorázové obnosové plnění oprávněné osobě za smrt následkem úrazu.",
      verdict: limitVerdict(cpp.death, koop.death, axa.death),
      cpp: {
        headline: formatMoney(cpp.death),
        detail: "Smrt následkem úrazu",
        source: "DPPURC 1/23, čl. 8–9",
        points: [
          "Smrt musí nastat nejpozději do tří let od úrazu.",
          "Pokud už ČPP plnila za trvalé následky téhož úrazu, vyplatí jen případný rozdíl do částky pro případ smrti.",
        ],
        metric: cpp.death,
        badge: "Volitelné pojištění",
      },
      koop: {
        headline: formatMoney(koop.death),
        detail: "Smrt následkem úrazu",
        source: "M-750/23, str. 11 a 29–33",
        points: ["Smrt musí nastat následkem úrazu nejpozději do tří let od jeho vzniku."],
        metric: koop.death,
        badge: "Balíček ÚZO",
      },
      axa: {
        headline: axaHasExtendedCover ? formatMoney(axa.death) : "V REFERENCE není pojištěno",
        detail: axaHasExtendedCover ? "Smrt následkem úrazu" : "Úrazové pojištění obsahují až KOMFORT a EXCELENT",
        source: "AXA VPPCP 15. 6. 2026, přehled plnění a část III oddíl F, str. 2 a 15–16",
        points: axaHasExtendedCover
          ? ["Jednorázové plnění se vyplácí oprávněné osobě při smrti pojištěného následkem úrazu."]
          : ["Pro úrazové plnění je nutné zvolit KOMFORT nebo EXCELENT."],
        metric: axa.death,
        badge: axaHasExtendedCover ? `Varianta ${axa.label}` : "Bez krytí",
      },
    },
    {
      id: "accident-hospitalization",
      section: "Úrazové pojištění",
      icon: BriefcaseMedical,
      title: "Nemoc nebo úraz si vyžádá pobyt v nemocnici",
      description: "Porovnáváme denní peněžní kompenzaci za hospitalizaci, nikoli úhradu nemocniční léčby z léčebných výloh.",
      verdict: limitVerdict(cpp.hospitalTotal, koop.hospitalTotal, axa.hospitalTotal),
      cpp: {
        headline: "Samostatná denní dávka není",
        detail: "DPPURC uvádějí jen smrt a trvalé následky úrazu",
        source: "DPPURC 1/23, čl. 8–10",
        points: [
          "Nezbytná hospitalizace v zahraničí může být hrazena z léčebných výloh, nejde však o denní peněžní kompenzaci klientovi.",
        ],
        metric: cpp.hospitalTotal,
        badge: "Bez obnosové dávky",
      },
      koop: {
        headline: `${formatMoney(koop.hospitalDay)} / den`,
        detail: `Celkem nejvýše ${formatMoney(koop.hospitalTotal)}`,
        source: "M-750/23, str. 11 a 29–33",
        points: [
          "Hospitalizace musí trvat minimálně tři dny, tedy dvě noci.",
          "Kryje pobyt v nemocnici následkem nemoci nebo úrazu i za účelem vyšetření či stanovení diagnózy, pokud nastal během pojištění.",
          "Za den hospitalizace se počítá každá půlnoc; maximálně se plní za 15 dní a až po ukončení pobytu.",
        ],
        metric: koop.hospitalTotal,
        badge: "Balíček ÚZO",
      },
      axa: {
        headline: "Samostatná denní dávka není",
        detail: "Úrazové pojištění uvádí jen smrt a trvalé následky",
        source: "AXA VPPCP 15. 6. 2026, přehled plnění a část III oddíl F, str. 2 a 15–16",
        points: [
          "Nezbytná hospitalizace v zahraničí může být hrazena z léčebných výloh, nejde však o denní peněžní kompenzaci klientovi.",
        ],
        metric: axa.hospitalTotal,
        badge: "Bez obnosové dávky",
      },
    },
    {
      id: "manual-work",
      section: "Pracovní cesta a manuální práce",
      icon: Activity,
      title: "Klient v zahraničí vykonává manuální práci",
      description: "Administrativní pracovní cesta není totéž jako manuální práce. U AXA ji řeší samostatné připojištění, které rozšiřuje jen léčebné výlohy a úraz.",
      verdict: {
        tone: "attention",
        label: "Typ práce musí být přesně uveden a ověřen",
        detail: "AXA nabízí konkrétní připojištění ke KOMFORT a EXCELENT, ale rizikové činnosti zůstávají vyloučené a odpovědnost se nerozšiřuje. U ČPP a Kooperativy rozhoduje sjednaný typ pracovní cesty a podmínky konkrétní činnosti.",
      },
      cpp: {
        headline: "Rozhoduje typ pracovní cesty",
        detail: "Krytí práce musí odpovídat pojistné smlouvě; odpovědnost může při sjednaných pracovních cestách zahrnout svěřenou věc",
        source: "VPPCP 1/18; DPPODC 1/18, čl. 2",
        badge: "Ověřit ve smlouvě",
        points: ["Samotné turistické cestovní pojištění nelze bez kontroly považovat za pojištění manuální pracovní činnosti."],
      },
      koop: {
        headline: "Rozhoduje pracovní činnost a smlouva",
        detail: "Výdělečná činnost je mimo běžnou odpovědnost; rozsah léčebných výloh je nutné sjednat podle charakteru cesty",
        source: "M-750/23, obecné a zvláštní výluky",
        badge: "Ověřit ve smlouvě",
        points: ["Profesionální či výdělečná činnost může mít samostatná omezení a není automaticky kryta běžným turistickým rozsahem."],
      },
      axa: {
        headline: axaHasExtendedCover ? "Připojištění manuální práce" : "V REFERENCE nelze připojistit",
        detail: axaHasExtendedCover
          ? `Léčebné výlohy do ${formatMoney(axa.treatment)} a úraz do limitu varianty`
          : "Dostupné jen ke KOMFORT a EXCELENT",
        source: "AXA VPPCP 15. 6. 2026, část II čl. 9 a část III oddíl L, str. 8 a 19; Manuální práce",
        badge: "Samostatné připojištění",
        points: axaHasExtendedCover
          ? [
              "Platí pro podnikatelskou, pracovní, výdělečnou i neplacenou dobrovolnickou manuální činnost.",
              "Rozšiřuje pouze léčebné výlohy a úrazové pojištění; odpovědnost při práci zůstává vyloučena.",
            ]
          : ["Pro manuální práci je nutné zvolit KOMFORT nebo EXCELENT a připojištění sjednat."],
        sections: axaHasExtendedCover
          ? [
              {
                label: "Rizikové činnosti zůstávají vyloučené",
                items: [
                  "Práce v hlubinných dolech, záchranné a havarijní práce a práce s výbušninami.",
                  "Práce s vysokým rizikem akutní otravy či popálenin, práce pod vodou a činnost kaskadérů nebo krotitelů.",
                  "Činnost továrních jezdců nebo pilotů; o rizikovosti konkrétní činnosti rozhoduje pojistitel.",
                ],
                emphasis: "exclusion" as const,
              },
            ]
          : undefined,
      },
    },
    {
      id: "security",
      section: "Terorismus",
      icon: ShieldAlert,
      title: "Klient se stane obětí teroristického činu",
      description: "ČPP přidává samostatné finanční kompenzace. Kooperativa řeší újmu na zdraví v LVZ a úrazu; AXA nemá samostatný teroristický balíček, ale upravuje automatické prodloužení pojištění.",
      verdict: {
        tone: "balanced",
        label: "Jiný typ ochrany",
        detail: "ČPP Guard PLUS kombinuje obnosové kompenzace s náhradou doložených nákladů na opuštění oblasti a ubytování. Kooperativa zachovává popsané zdravotní krytí. AXA při objektivně znemožněném návratu kvůli teroristickému činu automaticky prodlužuje dobu pojištění, ale nemá zvláštní finanční limit pro únos či opuštění oblasti.",
      },
      cpp: {
        headline: "Guard PLUS",
        detail: "Únos, zkrácení cesty, opuštění rizikové oblasti a náhradní ubytování",
        source: "DPPLV 1/23, čl. 2 a 5; DPPGUP 1/20, čl. 2–5",
        badge: "Volitelné připojištění Guard PLUS",
        points: [
          "Většina událostí Guard PLUS 50 000 Kč; fyzické napadení 40 000 Kč; výkupné se nehradí.",
          `Léčebné výlohy související s terorismem mají ve variantě ${cpp.label} samostatný sublimit ${formatMoney(cppTerrorismTreatmentLimit)}.`,
        ],
      },
      koop: {
        headline: "LVZ a úraz zůstávají",
        detail: "Újma na zdraví z teroristického činu je krytá, pokud se klient aktivně nepodílel",
        source: "M-750/23, str. 23–32 a obecná ustanovení str. 55",
        badge: "Léčebné výlohy a úraz",
        points: [
          `Léčebné výlohy se hradí v rámci celkového limitu ${formatMoney(koop.treatment)}; podmínky neuvádějí zvláštní nižší sublimit terorismu.`,
          "Bez přímého balíčku pro únos, opuštění oblasti či náhradní ubytování; u ostatních pojištění se obecná výluka terorismu uplatní.",
          "Při vycestování do oznámené rizikové oblasti nebo neprodleném neopuštění oblasti může být plnění odmítnuto.",
        ],
      },
      axa: {
        headline: "Bez samostatného finančního balíčku",
        detail: "Automatické prodloužení, pokud teroristický čin objektivně brání návratu",
        source: "AXA VPPCP 15. 6. 2026, část II čl. 5 a 9, str. 6–8",
        badge: "Obecná ustanovení",
        points: [
          "Pojistná doba či účinnost se při uvíznutí automaticky prodlouží na dobu nezbytnou k návratu do ČR.",
          "Podmínky neuvádějí samostatné plnění za únos, výkupné, evakuaci z rizikové oblasti ani náhradní ubytování z důvodu terorismu.",
          "Válečné události, bojové akce, vzpoury, povstání, jiné nepokoje, stávky a zásah veřejné moci jsou obecně vyloučeny; rozhoduje přesná příčina události a ostatní výluky.",
        ],
      },
    },
    {
      id: "animal",
      section: "Veterinární léčba",
      icon: PawPrint,
      title: "Klient cestuje se psem, kočkou nebo fretkou",
      description: "Porovnání úhrady akutní veterinární péče o vlastní zvíře v zahraničí. AXA pojišťuje jen psa nebo kočku, nikoli fretku.",
      verdict: {
        tone: "balanced",
        label: "ČPP má širší druhy zvířat, AXA pevný limit 30 000 Kč",
        detail: `ČPP zahrnuje psa, kočku i fretku a limit podle varianty ${formatMoney(cppAnimalLimit)}. AXA ke KOMFORT a EXCELENT nabízí psa nebo kočku s veterinární péčí 30 000 Kč a samostatně dopravou k veterináři 30 000 Kč.`,
      },
      cpp: {
        headline: `Zvíře PLUS · ${formatMoney(cppAnimalLimit)}`,
        detail: `Veterinární péče ve variantě ${cpp.label}; spoluúčast 500 Kč`,
        source: "DPPZVP 1/18, čl. 2–6",
        badge: "Volitelné připojištění Zvíře PLUS",
        points: ["Výkony, materiál, hospitalizace, medikace a náklady při smrti či utracení"],
        sections: [
          {
            label: "Podmínky a výluky",
            items: [
              "Zdravé čipované zvíře s platným osvědčením a pasem, vstupní věk od 3 měsíců do 10 let.",
              "Bez preventivní péče, vrozených vad, porodu, repatriace uhynulého zvířete a péče v ČR.",
            ],
            emphasis: "exclusion",
          },
        ],
      },
      koop: {
        headline: "Bez přímého protějšku",
        detail: "KOLUMBUS nehradí veterinární léčbu vlastního zvířete",
        source: "M-750/23, sjednatelná pojištění str. 7–12",
        badge: "Bez samostatného krytí",
        points: ["Odpovědnost může řešit újmu, kterou zvíře způsobí někomu jinému"],
      },
      axa: {
        headline: axaHasExtendedCover ? "péče 30 000 Kč + doprava 30 000 Kč" : "V REFERENCE nelze připojistit",
        detail: axaHasExtendedCover ? "Pes nebo kočka ve věku 3 měsíce až 10 let" : "Dostupné jen ke KOMFORT a EXCELENT",
        source: "AXA VPPCP 15. 6. 2026, přehled plnění a část III oddíl N, str. 3 a 19–20; Domácí mazlíčci",
        badge: "Volitelné připojištění domácích mazlíčků",
        points: axaHasExtendedCover
          ? [
              "Zvíře musí patřit pojištěnému, být označeno mikročipem nebo tetováním a splňovat podmínky vstupu do cílové země.",
              `Odpovědnost za škodu způsobenou mazlíčkem se rozšíří podle varianty: zdraví ${formatMoney(axa.liability)}, věc ${formatMoney(axaHasExcelentCover ? 10_000_000 : 1_500_000)}.`,
              "Při současném připojištění storna může být jeho náhlé závažné onemocnění či úraz také krytým důvodem zrušení cesty.",
            ]
          : ["Pro připojištění psa nebo kočky je nutné zvolit KOMFORT nebo EXCELENT."],
        sections: axaHasExtendedCover
          ? [
              {
                label: "Hlavní výluky",
                items: [
                  "Potíže vzniklé v ČR, před počátkem nebo mimo dobu pojištění a péče, kterou lze odložit do návratu.",
                  "Cesta za léčbou, vrozené, dědičné, vývojové a chronické vady s vymezenou výjimkou první diagnózy.",
                  "Březost, očkování, paraziti, prevence, kosmetická péče a doprava, po níž se veterinární ošetření neuskutečnilo.",
                  "Fretka nespadá do definice domácího mazlíčka AXA.",
                ],
                emphasis: "exclusion" as const,
              },
            ]
          : undefined,
      },
    },
  ];

  const sectionOrder = new Map(
    COMPARISON_SECTIONS.map((section, index) => [section.label, index])
  );

  return rows.sort(
    (left, right) =>
      (sectionOrder.get(left.section) ?? Number.MAX_SAFE_INTEGER) -
      (sectionOrder.get(right.section) ?? Number.MAX_SAFE_INTEGER)
  );
}
