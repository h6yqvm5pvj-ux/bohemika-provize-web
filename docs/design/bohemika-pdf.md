# Bohemika PDF

Uložený vzhled klientských PDF a srovnání. Verze 1, 5. 11. 2026. Navazuje na schválený vzhled předchozího klientského srovnání; šablona neobsahuje žádné údaje konkrétního klienta.

## Jak si říct o další dokument

> Použij styl **Bohemika PDF**. Připrav PDF na téma [téma] pro [klient]. Zpracoval/a [poradce]. Podklady: [obsah a zdroje].

V tomto projektu je to výchozí styl dalších podobných klientských srovnání, pokud uživatel nezadá jiný vzhled. Počet stran, obsah a poradce se mění podle zadání.

## Uložený prompt

```text
Vytvoř profesionální klientské PDF ve stylu „Bohemika PDF“.
Použij místní HTML/CSS šablonu a zachovej její vizuální systém:

– A4 na výšku, bílé pozadí, vzdušná sazba a jasná hierarchie.
– Písmo Geist s českou diakritikou, výrazné tmavomodré nadpisy,
  teal akcenty a tlumený modrošedý doprovodný text.
– Titulní strana s velkým nadpisem na 2–3 řádky, jednou zvýrazněnou
  částí, jménem klienta, autorem a krátkým přehledem priorit.
– Jedno hlavní téma na stránku. Srovnání ve dvou sloupcích,
  jemné rámečky, zaoblené karty a barevně odlišené varianty.
– Přehledné tabulky: výrazné záhlaví, jemně střídající se řádky,
  číselné hodnoty doprava, důležitý řádek zvýrazněný mentolově.
– Praktické příklady v tmavomodrém panelu s velkými částkami
  a srozumitelným vysvětlením. Modelové hodnoty výslovně označ.
– Decentní záhlaví s Bohemika a patička s názvem, datem a stránkou.
– Na konci zdroje a vizitka zpracovatele: ověřené veřejné kontakty,
  klikací online vizitka a odpovídající QR kód.

Piš česky, lidsky a věcně. Zachovej vzhled šablony, ale přizpůsob
počet stran obsahu. Pokud se text nevejde, rozděl téma na další
stránku. Nepřekrývej patičku a nezmenšuj vše plošně do nečitelnosti.

Názvy, částky, data, tvrzení a autora vždy převezmi z nového zadání
a aktuálně ověřených podkladů. Předchozí PDF slouží jako vzor vzhledu,
nikoliv jako zdroj faktů nebo údajů jiného klienta. Chybějící údaje
nevymýšlej. Uživatelský text bezpečně escapuj do HTML.

Vytvoř skutečné PDF s textem, vloženými fonty a funkčními odkazy.
Před předáním zkontroluj všechny stránky, češtinu, tabulky, odkazy,
čísla stran, QR a metadata. V hotovém PDF nesmí zůstat zástupná pole.
```

## Přesná specifikace vzhledu

| Prvek | Hodnota |
| --- | --- |
| Formát | A4 na výšku, 210 × 297 mm |
| Okraje obsahu | nahoře 15 mm, vlevo/vpravo 16 mm, dole 17 mm |
| Patička | 8 mm od dolního okraje, jemná horní linka |
| Písmo | Geist; lokální `Geist-latin.woff2` a `Geist-latin-ext.woff2` |
| Běžný text | 10 pt, řádkování 1,47 |
| Nadpisy | titulní 38 pt, běžný 29 pt; hustší strana 26 pt |
| Hlavní text a tmavé panely | `#172b42` |
| Zelený akcent | `#07877b` |
| Doprovodný text | `#637487` |
| Linky | `#dce4eb` |
| Světlé plochy | `#f4f7fa`, `#edf7f4`, `#e8f5f1` |
| Barvy srovnání | tlumená vínová `#684c51`, teal `#087f74` |
| Vizitka | dvě části v poměru cca 1,55 : 1; QR 24 × 24 mm |

Barvy odlišují porovnávané varianty, samy o sobě nevyjadřují jejich kvalitu. Bez doloženého důvodu nepoužívat značky „nejlepší“, „nejhorší“ nebo červené/zelené hodnocení.

## Soubory šablony

- [HTML šablona](bohemika-pdf-template.html): čtyři obecné vzorové strany s poli `{{…}}` — titulní strana, srovnání, modelový příklad a vizitka. Není určená k předání klientovi bez doplnění.
- [CSS](bohemika-pdf.css): zachovaný vizuální systém včetně lokálních fontů. Rozvržení není svázané s pořadím nebo počtem stran.
- [Náhled](bohemika-pdf-reference.png): vizuální reference obecné šablony.

Pojmenované varianty `.pn-page`, `.coverage-page`, `.progression-page` a `.accident-page` lze přidat podle hustoty a typu obsahu; nejsou vázané na čísla stran. Počet stran v záhlaví a patičkách odvodit od skutečného dokumentu. Osm stran původního PDF není požadavek.

Fonty jsou odkazované relativně do `public/fonts`. Při tvorbě samostatného HTML nebo přenosu mimo tento projekt fonty vložit do souboru, případně přenést i jejich lokální soubory.

## Export a kontrola

Exportovat přes tiskové CSS: `@page { size: A4; margin: 0; }`, barevné pozadí zapnuté, CSS velikost stránky zachovaná, tiskové okraje nulové, systémová záhlaví/patičky vypnuté. V Chrome/CDP odpovídá `printBackground: true`, `preferCSSPageSize: true`, `displayHeaderFooter: false`.

Před tiskem počkat na načtení fontů a obrázků. Zobrazit všechny výsledné stránky; zkontrolovat ořez, překryvy, zalomení tabulek a čitelnost poznámek. `overflow: hidden` v šabloně samo neprokazuje, že se obsah vejde. Ověřit také textovou vrstvu, diakritiku, odkazy a skutečné cíle QR.

Modelová čísla v HTML šabloně ukazují pouze sazbu. Nejsou to údaje o pojistných produktech. Zdroje a omezení konkrétního srovnání doplnit podle nového zadání.

## Klientské údaje

Do této šablony ani do sledovaných souborů repozitáře neukládat skutečné klientské údaje, hotové klientské reporty, čísla smluv nebo soukromé kontakty. Pracovní klientská data a PDF ukládat odděleně do neveřejného, gitově ignorovaného pracovního adresáře. Při požadavku na anonymní verzi odstranit i kombinace identifikujících dat a zkontrolovat metadata, patičky, odkazy a přílohy. Vizitku poradce sestavit z jeho určených veřejných údajů, ne z cizího předchozího dokumentu.

Samotné vytvoření PDF neznamená pokyn k jeho publikaci do sdílených dokumentů. Cíl a rozsah sdílení převzít ze zadání uživatele; existující oprávnění neposuzovat jen podle frontendu.
