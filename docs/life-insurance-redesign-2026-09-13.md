# Nastavení životního pojištění — redesign 2026-09-13

Úprava po zpětné vazbě v 18:25: přehled nemocenské nyní odděluje dva plátce. Zaměstnavatel uvádí celkovou náhradu za 1.–14. den, OSSZ celkové částky za 15.–30., 31.–60. a 61.–90. den. Viditelný je jeden součet za prvních 30 dní. Denní sazby, redukce a vzorce se na obrazovce zobrazují až po rozbalení; PDF má stejný jednoduchý přehled. Odstraněn byl hypotetický přepočet OSSZ na 30 dní při 60 % a navazující srovnávací řádky. Soukromé připojištění je výslovně označené.

Ověření této úpravy: 26 testů, TypeScript, ESLint, Chrome při šířkách 1440 / 768 / 390 / 320 px, rozbalení podrobností, tisk a stažení PDF. Pro hrubý příjem 35 000 Kč, PHV 180 Kč a 10 pracovních dnů po 8 hodinách: zaměstnavatel 7 776 Kč; OSSZ postupně 9 952 / 20 520 / 22 380 Kč za uvedená období; prvních 30 dní dohromady 17 728 Kč.

Průvodce má pět pojmenovaných kroků, návrat k vyplněným údajům, kontrolu před výpočtem a samostatný náhled dokumentu. Výsledky obsahují tři ilustrované karty a rozpis příjmu v pracovní neschopnosti. Dokument A4 opakuje firemní hlavičku, drží související bloky pohromadě a uvádí kontakt poradce.

## Výpočet nemocenské

Model pro rok 2026 používá hrubý měsíční vyměřovací základ × 12 / 365 a redukční hranice 1 633 / 2 449 / 4 897 Kč. Náhrada zaměstnavatele používá zadaný průměrný hodinový výdělek, hranice 285,78 / 428,58 / 856,98 Kč a pracovní hodiny v prvních 14 dnech (výchozí 10 × 8). Každé redukční pásmo a hodinová náhrada se zaokrouhlují podle kalkulačky MPSV. Dávky OSSZ: 16 dní při 60 %, 30 dní při 66 %, dalších 30 dní při 72 % redukovaného DVZ. Bez vstupních údajů se příslušné částky nevyčíslují. U OSVČ jde o základ dobrovolného nemocenského pojištění, nikoli o čistý příjem ani zaplacené pojistné.

Jde o orientační model bez vyloučených dnů a individuálních podmínek nároku. Původní návrh soukromé denní dávky (40 % čistého příjmu / 30; u OSVČ bez nemocenského také výdaje + rezerva) zůstává samostatně popsaný.

Ověřeno podle:
- [ČSSZ — nemocenské](https://www.cssz.gov.cz/nemocenske)
- [MPSV — kalkulačka nemocenského 2026](https://mpsv.gov.cz/kalkulacka-pro-vypocet-davek-v-roce-2026)
- [MPSV — kalkulačka náhrady mzdy 2026](https://mpsv.gov.cz/kalkulacka-pro-vypocet-vyse-nahrady-mzdy-v-roce-2026)

Regresní příklady jsou převzaty z veřejných sešitů MPSV: hrubá mzda 50 000 Kč → denní dávky 887 / 975 / 1 064 Kč, celkem 75 362 Kč od OSSZ za 90 dní; PHV 500 Kč a 40 placených hodin → náhrada 8 744 Kč.

## Průměrné invalidní důchody

Na výsledné stránce a v dokumentu je u každého stupně samostatně uveden průměrný státní důchod: I. stupeň 9 906 Kč, II. stupeň 11 704 Kč, III. stupeň 17 325 Kč měsíčně. Jde o průměrné sólo důchody k 31. 12. 2024, převzaté ze stávající vizitky a ověřené v [odpovědi ČSSZ ze dne 13. 1. 2025](https://www.cssz.cz/documents/20143/2878360/odpoved_106_statistika%2Bduchodu_web.pdf/a9c0a411-ae79-bd96-a31b-e3b3cff4243d?version=1.0). Nejde o průměry roku 2026 ani výpočet osobního nároku klienta.

Vizitka a pomůcka sdílejí částky a zdroj v `src/lib/disabilityPensionStatistics.ts`. Renta a potřebný kapitál pro soukromé zajištění jsou zobrazeny odděleně. Státní průměry neovlivňují výpočet doporučeného krytí. Datum, zdroj i vysvětlení jsou dostupné ve všech pěti jazycích dokumentu.

Ověřeno: 27 testů včetně oddělení statistických částek od soukromého krytí, TypeScript, ESLint, Chrome 1440 / 390 px a stažené PDF (3 strany).

## Ilustrace

Vygenerováno vestavěným nástrojem imagegen (tři samostatné assety, žádné referenční obrázky). Transparentní WebP 760 × 760; optimalizováno pomocí Sharp, původní PNG ponechány v adresáři generátoru. Aktuální motivy: pietní svíčka, zotavení a dlouhodobá ochrana. Stejné assety se používají na výsledné stránce a v HTML/PDF dokumentu.

### memorial

Smuteční ilustrace nahrazuje původní motiv rodiny na kartě úmrtí i v PDF. Vygenerováno vestavěným imagegen, bez referenčních obrázků.

Soubor: `public/illustrations/life-insurance/memorial.webp`

Přesný prompt:

> Use case: illustration-story. Asset type: replacement illustration for the death coverage card in a Czech life insurance planning app and its printable A4 client report. Primary request: a clearly mournful, dignified memorial illustration, conveying bereavement and remembrance. Subject: one ivory memorial pillar candle with a small subdued flame, white calla lilies and restrained sage foliage laid beside it, and a simple black mourning ribbon. No people. Style: refined hand-drawn editorial illustration with fine ink detail, delicate watercolor shading and subtle paper texture inside the objects, matching an elegant illustrated finance app. Mood: solemn, quiet, respectful and restrained. Palette: ivory, charcoal gray, muted sage, and a small desaturated lavender accent. Composition: a compact balanced square arrangement, the entire candle, flowers and ribbon visible, ample clear margins, readable at thumbnail size. Background: genuinely transparent with preserved alpha, no white rectangle or colored backdrop. Print quality. No text, no numbers, no logo, no watermark. Avoid smiling people, cheerful scenes, festive decorations, wedding imagery, horror, gore, tombstones and religious symbols.

### recovery

Soubor: `public/illustrations/life-insurance/recovery.webp`

Přesný prompt:

> Use case: illustration-story. Asset type: polished editorial illustration for an existing Czech life insurance planning app and its printable A4 client report. Style: refined contemporary hand-drawn editorial illustration, clean organic shapes, subtle paper grain, fine confident ink details, sophisticated friendly adult proportions, tasteful soft shadows. Palette: muted lavender and plum (#8055b1), light sky blue (#61b5d7), sage green, warm skin tones, off-white details. Square composition, single compact scene, ample clear margins. Genuinely transparent background with preserved alpha, no colored full-page background, no text, no numbers, no logos, no watermark. Print-quality, crisp but not glossy, not 3D or generic corporate clipart. Subject: an adult temporarily recovering at home, sitting comfortably on a light blue armchair with a warm blanket and a cup, with a small lavender calendar and a neat potted plant beside the chair. Quiet reassuring scene representing income support while unable to work; avoid medical symbols, hospitals, injury detail, or anything distressing.

### independence

Soubor: `public/illustrations/life-insurance/independence.webp`

Přesný prompt:

> Use case: illustration-story. Asset type: polished editorial illustration for an existing Czech life insurance planning app and its printable A4 client report. Style: refined contemporary hand-drawn editorial illustration, clean organic shapes, subtle paper grain, fine confident ink details, sophisticated friendly adult proportions, tasteful soft shadows. Palette: muted lavender and plum (#8055b1), light sky blue (#61b5d7), sage green, warm skin tones, off-white details. Square composition, single compact scene, ample clear margins. Genuinely transparent background with preserved alpha, no colored full-page background, no text, no numbers, no logos, no watermark. Print-quality, crisp but not glossy, not 3D or generic corporate clipart. Subject: a confident adult using a modern manual wheelchair, together with a standing partner in a relaxed optimistic pose, a subtle abstract lavender protective arch behind them and a small sage plant. Full figures visible, dignified independent portrayal, representing long-term financial protection and continuity of everyday life.


## Ověření

- TypeScript: `npx tsc --noEmit --incremental false`
- ESLint: upravená pomůcka a sdílený renderer PDF
- Vitest: 25 testů výpočtu, průvodce, jazyků dokumentu, bezpečného vložení klientských údajů a stránkování PDF
- Lokální Chrome s izolovaným profilem poradce: šířky 1440, 1024, 768, 390 a 320 px; průchod formulářem, validace, načtení všech ilustrací, náhled v pěti jazycích a stažení skutečného PDF
- Vizuální kontrola všech tří stran staženého českého PDF; žádný nadpis oddělený od svých výsledků
- Ukázkové soubory a snímky jsou v `.tmp/life-setup-check/`; obsahují pouze testovací údaje.
