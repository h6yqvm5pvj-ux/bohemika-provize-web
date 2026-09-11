import { Anchor, HeartHandshake, ShieldAlert, Ship } from "lucide-react";
import type { ComparisonRow, Variant } from "./comparisonData";

export const MARINE_SECTION = "Plavby a jachting" as const;

// Sport classification, medical evacuation and vessel liability are separate
// coverages. In particular, an absent mileage limit is not worldwide cover.
export function buildMarineRows(cpp: Variant, koop: Variant, axa: Variant, money: (value: number) => string): ComparisonRow[] {
  const axaRisk = axa.label === "REFERENCE"
    ? "REFERENCE: rizikové sporty nelze připojistit; pro tuto plavbu zvolit KOMFORT nebo EXCELENT a připojištění."
    : `${axa.label}: nutné připojištění Rizikové sporty.`;

  return [
    {
      id: "marine-sailing", section: MARINE_SECTION, icon: Anchor,
      title: "Jachting a námořní míle od pobřeží",
      description: "Pro rekreační jachting rozhoduje největší vzdálenost od pobřeží během celé trasy. Počet celkem uplutých mil je jiný údaj. Vyšší varianta sama sportovní rozsah nerozšiřuje.",
      verdict: {
        tone: "attention", label: "Kooperativa nemá v seznamu sportů číselný limit",
        detail: "Jachting vyžaduje aktivní sport. Absence hranice mil není potvrzením neomezené oceánské plavby: pro mezinárodní vody ověřit územní platnost konkrétní smlouvy.",
      },
      differences: [
        { label: "Jachting do 3 námořních mil včetně", cpp: "Rekreační sport v rámci pobytové či poznávací cesty.", koop: "Nutné sjednat léčebné výlohy v rozsahu aktivní sport i blízko pobřeží.", axa: "Běžný sport; bez připojištění Rizikové sporty.", advantage: "neutral" },
        { label: "Jachting nad 3 do 12 námořních mil včetně", cpp: "Nutné sjednat sportovní cestu (nebezpečné sporty).", koop: "Nutné sjednat léčebné výlohy v rozsahu aktivní sport.", axa: "Běžný sport; základní seznam zahrnuje jachting do 12 mil včetně.", advantage: "neutral" },
        { label: "Jachting nad 12 do 200 námořních mil včetně", cpp: "Sportovní cesta; hranice 200 mil se měří od pevniny nebo pobřežních ostrovů. Oceánské a jiné extrémní plavby jsou vyloučené.", koop: "Aktivní sport; u jachtingu není uveden číselný limit mil. Pro mezinárodní vody nechat potvrdit územní rozsah.", axa: axaRisk, advantage: "neutral" },
        { label: "Oceánská plavba / jachting nad 200 mil", cpp: "Mimo běžný rozsah: oceánské plavby a jachting na otevřeném moři nad 200 mil jsou extrémní sporty.", koop: "Bez číselného limitu u jachtingu, ale bez automatického potvrzení oceánské trasy. Písemně ověřit území i sportovní rozsah.", axa: "Oceánská plavba při jachtingu je nepojistitelný sport. Připojištění rizikových sportů končí na 200 mílích.", advantage: "neutral" },
      ],
      sharedPoints: [
        "Hranice se týkají jachtingu; nelze je automaticky přenést na cestujícího na trajektu nebo výletní lodi.",
        "U regaty, výcviku, placeného kapitána a motorové lodi ověřit přesnou činnost. Zde porovnáváme rekreační jachting bez závodů.",
        "Oprávnění kapitána, vybavení, počasí, sjednané území a další výluky se posuzují samostatně.",
      ],
      cpp: {
        headline: "3 míle v základu · 200 se sportovní cestou",
        detail: "Na uzavřených vodních plochách nebo maximálně 3 námořní míle od pobřeží jde o rekreační sport. Dále je třeba sportovní cesta.",
        badge: "Rozhoduje druh cesty",
        source: "VPPCP 1/18, čl. 12 a čl. 16 odst. 3, 15 a 17a, str. 3–4",
        points: ["Sportovní cesta: nejvýše 200 námořních mil od pevniny nebo pobřežních ostrovů.", "Oceánské plavby a jachting na otevřeném moři nad 200 mil spadají mezi extrémní a adrenalinové sporty."],
        caution: "Ani MAXI samo o sobě nesjednává sportovní cestu. Oceánská plavba není kryta jen tím, že je blízko ostrova.",
      },
      koop: {
        headline: "Aktivní sport · bez uvedené hranice mil",
        detail: "Jachting na plachetnici či jachtě je výslovně zařazen do aktivního sportu. Základní rekreační sporty nestačí.",
        badge: "Sjednat aktivní sport",
        source: "M-750/23, LVZ čl. 2 odst. 2h a odst. 3–6, str. 24; obecná ustanovení čl. 2 odst. 2–4, str. 51–52",
        points: ["U jachtingu není v seznamu sportů číselné omezení vzdálenosti od pobřeží.", "Závody a soutěže vyžadují odpovídající rozsah organizovaného sportu; samotný aktivní sport je nezahrnuje."],
        caution: "Obecná územní platnost hovoří o území států. Mezinárodní vody a konkrétní oceánskou trasu nechat písemně potvrdit; netvrdit „neomezeně po celém oceánu“.",
      },
      axa: {
        headline: "12 mil v základu · 200 s připojištěním",
        detail: "Jachta a katamarán do 12 námořních mil od pobřeží jsou běžný sport. Rizikové sporty uvádějí pásmo od 12 do 200 mil.",
        badge: axa.label === "REFERENCE" ? "REFERENCE: jen běžné sporty" : "Dále připojistit Rizikové sporty",
        source: "AXA VPPCP 15. 6. 2026, tabulka připojištění str. 3; část III oddíl K, str. 19; příloha č. 1, str. 22–24",
        points: [axaRisk, "Oceánská plavba při jachtingu je v seznamu nepojistitelných sportů."],
        caution: "Seznamy se na 12 mílích slovně překrývají („do 12“ a „od 12“). Základ výslovně zahrnuje do 12 mil; pro překročení této hranice sjednat rizikové sporty.",
      },
    },
    {
      id: "marine-cruise", section: MARINE_SECTION, icon: Ship,
      title: "Klient je cestujícím na výletní lodi nebo trajektu",
      description: "Pasivní cestující na cruise ship, rekreační jachtař a člen pracovní posádky mají odlišné činnosti. Samotná délka plavby neříká, jaký sport sjednat.",
      verdict: { tone: "balanced", label: "Nejdřív určit roli klienta", detail: "ČPP výslovně jmenuje i zaoceánské lodě v rekreačním rozsahu. Hranice pro jachting u ostatních nelze automaticky použít jako hranice přepravy cestujícího." },
      cpp: {
        headline: "Výslovně v rekreačním rozsahu",
        detail: "VPPCP uvádějí výlety na moři s profesionální posádkou, trajekt, parník, zaoceánskou loď i cruise ship mezi rekreačními sporty.",
        source: "VPPCP 1/18, čl. 16 odst. 15, str. 4; DPPLV 1/23, čl. 2",
        caution: "Hranici 3 mil pro jachting nepřenášet na tuto výslovně uvedenou přepravu. Práce v posádce a vlastní sportovní aktivity vyžadují samostatné posouzení.",
      },
      koop: {
        headline: "Podle role, trasy a území",
        detail: "Ustanovení o aktivním sportu řeší jachting. Samostatné pravidlo s námořními mílemi pro cestujícího na cruise ship se v prověřených podmínkách neuvádí.",
        source: "M-750/23, LVZ čl. 1–2, str. 23–24; obecná ustanovení čl. 2, str. 51–52",
        caution: "Pro mezinárodní vody potvrdit územní platnost. Výletní loď sama není důkaz, že klient provozuje jachting, ani potvrzení krytí každé trasy.",
      },
      axa: {
        headline: "Hranice 12 mil platí pro jachting",
        detail: "Seznam sportů váže 12 a 200 mil na jachtu či katamarán. Číselnou hranici pro pasivního cestujícího na cruise ship v něm nenajdeme.",
        source: "AXA VPPCP 15. 6. 2026, část II čl. 7 a 9; část III oddíl A čl. 1; příloha č. 1, str. 22–24",
        caution: "Konkrétní trasu a případné expedice nechat potvrdit. Léčení na lodi a zdravotní transport musí splnit podmínky léčebných výloh.",
      },
    },
    {
      id: "marine-rescue", section: MARINE_SECTION, icon: HeartHandshake,
      title: "Záchrana člověka na moři a zdravotní evakuace",
      description: "Námořní pátrání, převoz nemocného do nemocnice a odtah nepojízdné lodi jsou různé služby. Záchrana člověka nepředstavuje pojištění nákladů na záchranu lodi.",
      verdict: { tone: "balanced", label: "Kooperativa námořní záchranu uvádí výslovně", detail: `Sublimit ${money(koop.rescue)} je součástí léčebných výloh. U ČPP je záchrana vymezena obecně; AXA váže popsaný zdravotní transport na úraz nebo nemoc. Částky proto nejsou srovnáním stejného rozsahu námořní záchrany.` },
      cpp: {
        headline: `Záchrana v rámci ${money(cpp.rescue)}`,
        detail: "DPPLV zahrnují pátrání, vysvobození a vymezenou přepravu při ohrožení života nebo zdraví; náklady technického zásahu musí být klient povinen uhradit podle práva.",
        source: "DPPLV 1/23, čl. 2 odst. 2, čl. 4 odst. 2, čl. 5 a čl. 8 odst. 5, str. 1–2",
        caution: "Námořní služba není pojmenována výslovně. Konkrétní námořní pátrání a dopravu potvrdit s pojišťovnou; uvedený limit není samostatný příslib plnění za každou záchrannou akci.",
      },
      koop: {
        headline: `${money(koop.rescue)} na zásah záchranných složek`,
        detail: "Podmínky výslovně uvádějí námořní záchrannou službu při ohrožení života nebo zdraví. Hradí nutné náklady, které je klient podle právních předpisů povinen uhradit.",
        source: "M-750/23, tabulka str. 10; LVZ čl. 3 odst. 1–3, str. 24–25",
        points: ["KLASIK: 500 000 Kč. PLUS: 1 000 000 Kč. Sublimit je uvnitř limitu léčebných výloh.", "Výlukou je úmyslné zneužití služby i ohrožení následkem hrubé nedbalosti či vědomého jednání proti pokynům záchranné služby."],
        caution: "Musí být splněn sjednaný sportovní a územní rozsah. Samotný odtah nebo oprava lodi tímto krytím potvrzené nejsou.",
      },
      axa: {
        headline: `Zdravotní transport v rámci ${money(axa.treatment)}`,
        detail: "Hradí nezbytnou přepravu z místa úrazu či onemocnění do vhodného zdravotnického zařízení, včetně vrtulníku, vyžaduje-li ji zdravotní stav a nelze použít běžnou dopravu.",
        source: "AXA VPPCP 15. 6. 2026, část III oddíl A čl. 1 odst. 5 a odst. 6f–g; čl. 2 odst. 1f, str. 10–11",
        caution: "Záchranné a vyprošťovací akce při vyhledávání či pátrání jsou vyloučené bez ohrožení zdraví nebo života v souvislosti s úrazem či nemocí. Samostatnou námořní záchranu nelze potvrdit pouhým limitem léčebných výloh.",
      },
    },
    {
      id: "marine-liability", section: MARINE_SECTION, icon: ShieldAlert,
      title: "Kapitán, škoda na jachtě a kauce za charter",
      description: "Pojištěné léčení po úrazu při jachtingu neznamená pojištěnou odpovědnost kapitána, poškození pronajaté jachty ani propadlou kauci.",
      verdict: { tone: "attention", label: "Krytí kapitána a lodi řešit samostatně", detail: "Běžné cestovní pojištění těchto produktů nelze vydávat za pojištění odpovědnosti skippera či charterové kauce. Ani obecné krytí zapůjčených věcí nepřebíjí výluky plavidel." },
      cpp: {
        headline: "Škoda na pronajaté lodi a její provoz",
        detail: "U škod souvisejících s vlastnictvím nebo provozem malého plavidla platí omezení na vnitrozemské toky a plochy. Poškození samotné pronajaté lodi je potřeba posoudit také podle krytí zapůjčených věcí a příčiny škody.",
        source: "DPPODC 1/18, čl. 2 odst. 2b; čl. 3 odst. 2; čl. 7 odst. 1c, 2 a 3d; čl. 8 body 16 a 37",
        points: [
          "Zapůjčené movité věci od podnikatele, jehož činností je půjčování věcí, mají sublimit 10 % limitu odpovědnosti, nejvýše 500 000 Kč. Znění neobsahuje samostatnou plošnou výluku každé pronajaté lodi.",
          "Čl. 7 odst. 2 vylučuje odpovědnost spadající do povinného pojištění provozu plavidla a škody související s vlastnictvím či provozem ostatních plavidel podle definice v čl. 8 bodu 16.",
          "Čl. 7 odst. 3d vylučuje škody způsobené plavidlem na jiném plavidle, na věcech přepravovaných plavidlem a při společné havárii plavidel.",
        ],
        caution: "Potvrzení ČPP pro auto z půjčovny se zde nepřenáší na námořní charter. Z uvedených ustanovení nelze potvrdit každou škodu na pronajaté jachtě ani automatické proplacení kauce.",
      },
      koop: {
        headline: "Výluka plavidel vyžadujících průkaz",
        detail: "Odpovědnost vylučuje provoz plavidla, k jehož vedení právní předpis vyžaduje průkaz způsobilosti. Krytí pronajatých věcí vylučuje motorová plavidla a plachetnice.",
        source: "M-750/23, Odpovědnost čl. 1 odst. 1c–d, str. 38; čl. 5 odst. 1h, k–m, str. 40",
        points: ["Úzká výjimka: vybavení pronajatého obytného plavidla při ubytování. Nevztahuje se na jeho technické součásti a škody při provozu jako dopravního prostředku."],
        caution: "Krytí spoluúčasti u pronajatého motorového vozidla nepřenášet na loď. Aktivní sport neřeší odpovědnost profesionálního kapitána.",
      },
      axa: {
        headline: axa.label === "REFERENCE" ? "REFERENCE odpovědnost neobsahuje" : "Používání plavidel je ve výlukách",
        detail: "Pojištění odpovědnosti vylučuje škody související s používáním plavidel a škody na vypůjčených či najatých věcech s vymezenou výjimkou ubytování.",
        source: "AXA VPPCP 15. 6. 2026, přehled str. 2; část III oddíl C čl. 2 odst. 1a, e, h, str. 12",
        caution: "Připojištění Rizikové sporty tyto výluky neruší. Odpovědnost z povolání a jiné výdělečné činnosti je rovněž vyloučena.",
      },
    },
  ];
}
