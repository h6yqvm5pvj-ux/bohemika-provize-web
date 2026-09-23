# Prostorová loga partnerů na vizitce

Datum: 2026-09-22. Patnáct partnerských log v minimalistické vizitce používá původní obrazové soubory beze změny značek, barev a textů.

`PartnerLogoSculpture.tsx` vytváří CSS 3D efekt: čelní obrázek, šest odsazených a ztmavených vrstev pro hloubku a měkký stín. Jde o vrstvené obrázky v prostoru, nikoli generované video nebo samostatné 3D modely. SVG filtr potlačuje téměř průhledný šum ve stínových vrstvách; čelní obrázek zůstává původní. Dekorativní kopie jsou skryté před čtečkami obrazovky.

Loga mají pevnou orientaci a lehce se nadnášejí v rozsahu 7 px v sedmisekundové smyčce s posunutými fázemi. Stín se současně posouvá, rozšiřuje a zeslabuje, aby zvýraznil vzdálenost od podkladu. Při najetí myší se logo zvětší o 3,5 % a na jednu sekundu přes jeho siluetu přejede jemný odlesk. Na dotykových zařízeních zůstává samotné nadnášení.

Samostatné tlačítko umožňuje pozastavit pohyb i stín; odlesk a přiblížení při najetí se při pozastavení také vypnou. Stávající hook pozastavuje pohyb mimo obrazovku a ve skryté záložce, respektuje `prefers-reduced-motion` a `data-motion="off"`. Popisky ovládání jsou v češtině, angličtině a ukrajinštině.

Karty si zachovávají výšku 106 px na počítači a 80 px na mobilu. Větší loga vyplňují prostor díky odsazení 14 px, respektive 8 px. Mřížka má pět sloupců na počítači, tři do šířky 1000 px a dva do 480 px pro čitelnost log.

Higgsfield byl ověřen přes `list_workspaces` a `estimate_image_cost`. Odhad byl 2 kredity na logo, tedy 30 kreditů za všech 15, při zůstatku 9 kreditů. Nebyla spuštěna placená generování; výsledný efekt vzniká přímo v prohlížeči.

Ověření v Chrome: sedm kombinací šířek 1440, 1024, 768, 390 a 320 px, obě barevná témata a tři jazyky. Všechna loga se načetla, stránka nepřetéká, dostupných je právě 15 názvů značek. Ověřena pevná orientace při nadnášení, změna stínu, odlesk a přiblížení při najetí, společné pozastavení pohybu a stínu, pauza mimo obrazovku / ve skryté záložce a obě omezení pohybu. Cílený ESLint a `git diff --check` prošly; TypeScript prošel při zavedení komponenty. Aktuální snímky a dočasný kontrolní skript jsou v `.tmp/partner-logo-float/`, předchozí verze v `.tmp/partner-logo-3d/`.
