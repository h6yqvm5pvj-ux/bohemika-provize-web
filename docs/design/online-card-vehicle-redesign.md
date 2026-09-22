# Pojištění vozidel — sjednocená veřejná stránka

Datum: 2026-09-22. Veřejná cesta: `/vizitka/[slug]/pojisteni-vozidla`.

## Obsah a vzhled

Stejná hlavička, logo, písmo, barevné proměnné, šířka obsahu a formulářová paleta jako u životního pojištění a zlata. Výchozí vzhled je světlý, úvodní panel tmavý v obou režimech. Úvod doplňuje tyrkysové 3D auto ze sady ikon použité na vizitce.

Hlavním tématem je nezávazná kontrola stávající smlouvy: zjistit její nastavení, porovnat cenu i rozsah krytí a hledat levnější, lépe nastavenou alternativu. Tři kroky vysvětlují kontrolu, porovnání a rozhodnutí klienta. Uživatelem dodané tvrzení o většině případů je uvedené jako osobní zkušenost v bloku „Z mé praxe“, s vysvětlením, že konkrétní možnosti ukáže porovnání. Není prezentované jako garantovaný výsledek nebo nová statistika.

Zachováno pět srovnávacích situací, čtyři oblasti krytí, šest bodů asistence a informace o rozhodujících pojistných podmínkách. Srovnání používá tabulku s popsanými sloupci; na mobilu se řádky skládají do samostatných bloků s viditelnými popisky.

## Zapojení

`VehicleInsuranceContent.tsx` a `vehicleInsuranceCopy.ts` obsluhují veřejnou stránku i původní `/embed/pojisteni-vozidla`. Veřejná cesta již nepoužívá iframe. Embed nadále podporuje `advisor`, `theme` a `locale`; bez platného slugu nemá tlačítka schůzky. Nové texty jsou dostupné česky, anglicky i ukrajinsky.

Obě tlačítka „Nezávazně zkontrolovat smlouvu“ otevírají nativní dialog s předvolenou oblastí `vehicle`. Zachováno stávající API formuláře, správný slug, jazyk a téma. Dialog drží fokus, zavírá se přes Escape a vrací fokus na původní tlačítko.

## Obrázek a zdroje

`public/images/vehicle-insurance/vehicle-hero-v1.webp`: 768 × 768 px, 52 670 bajtů. Optimalizovaný export již existujícího Higgsfield renderu `2895373f-c6ee-47ee-abc0-9244da80dd50` (sada ikon v4). Sharp WebP quality 88 / effort 6; žádné nové generování.

Ponechané údaje byly znovu ověřeny 22. 9. 2026 a mají odkazy přímo na stránce:

- [Kooperativa — pojištění skel](https://www.koop.cz/pojisteni/pojisteni-vozidel/pojisteni-automobilu/skla): údaj o čelním skle u každé čtvrté škody, nyní výslovně připsaný Kooperativě.
- [Generali Česká a CDV — SRNA index, 19. 5. 2026](https://www.generaliceska.cz/-/srna-index-v-nove-podobe-na-ceskych-silnicich-eviduje-historicky-nejvice-srazene-zvere): 18 112 evidovaných střetů od října 2025 do března 2026. Stránka z údaje nevyvozuje meziroční růst, protože zdroj upozorňuje na změnu metodiky.

## Ověření

Chrome: osm scénářů na šířkách 1440, 1280, 1024, 768, 390 a 320 px, oba barevné režimy, všechny tři jazyky. Bez vodorovného přetékání stránky nebo textu a bez chyb JavaScriptu. Ověřeny všechny sekce, obrázek, odkazy na zdroje, posun na kontrolu smlouvy, embed s poradcem i bez něj, mobilní dialog a fokus/Tab/Escape.

Celý formulář prošel až k potvrzení s požadavkem zachyceným v prohlížeči, bez skutečného odeslání poradci. Ověřen slug `jakub-rauscher`, locale `cs`, téma `Pojištění vozidel` a prázdný formulář při opětovném otevření. Reporty a snímky: `.tmp/vehicle-redesign/`.
