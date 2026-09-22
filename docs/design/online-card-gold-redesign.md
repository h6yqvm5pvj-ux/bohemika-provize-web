# Stránka zlata v designu veřejné vizitky

Datum: 2026-09-22. Veřejná cesta: `/vizitka/[slug]/zlato`.

Stránka používá stejnou paletu, Inter, šířku obsahu, hlavičku s logem, přepínač tématu a výběr jazyka jako životní pojištění. Výchozí vzhled je světlý; úvodní panel zůstává tmavý s jemnou mřížkou a tyrkysovými akcenty v obou režimech. Zlaté detaily jsou soustředěné do produktových obrázků a křivky grafu.

## Rozložení

- Kompaktnější úvod s původními slitky PAMP a tlačítkem schůzky.
- Samostatná karta aktuální ceny, historie a změn za pět období vedle přehledu přínosů.
- Dvě karty způsobů nákupu a společný blok informací před nákupem.
- Loga partnerů a závěrečný kontaktní panel.
- Na mobilu se obsah skládá do jednoho sloupce bez vodorovného přetékání.

## Zapojení

`GoldInvestmentContent.tsx` sdílí obsah mezi veřejnou stránkou a `/embed/zlato`. Veřejná stránka již nepoužívá iframe; změna tématu nebo jazyka zachovává načtený graf. Existující embed parametry `advisor`, `theme` a `locale` zůstávají podporované.

Texty ve všech třech jazycích, zdroj `/api/gold`, interval obnovy, procentní změny a obrázky jsou zachované. Graf nově zobrazuje cenu výrazně i nad křivkou; původní detail při pohybu ukazatele zůstává dostupný. Interní pomůcka `/pomucky/zlato` není součástí úpravy.

Schůzka používá nativní dialog se stejnou paletou jako životní pojištění. Ovládání klávesnicí zůstává uvnitř otevřeného dialogu, Escape jej zavře a fokus se vrátí na původní tlačítko. Formulář má předvolenou oblast `precious-metals` a předává správný slug i jazyk. Bez platného slugu se tlačítka schůzky nezobrazují.

## Ověření

Chrome na šířkách 1440, 1280, 1024, 768, 390 a 320 px, světlý i tmavý režim, čeština, angličtina a ukrajinština. Kontroly rozložení zahrnují načtení obrázků, pět přínosů, pět procentních změn, nepřetékající text a zachování dat při přepínání vzhledu/jazyka. Ověřen detail grafu, oba embed režimy, mobilní dialog, Escape, fokus a klávesnice. Skutečné API ceny vrátilo HTTP 200 a historii. Odeslání formuláře je při ověřování zachycené v prohlížeči, bez skutečné zprávy poradci.

Kontrolní skripty, reporty a snímky jsou v `.tmp/gold-redesign/`. Cílený ESLint, TypeScript a `git diff --check` prošly.
