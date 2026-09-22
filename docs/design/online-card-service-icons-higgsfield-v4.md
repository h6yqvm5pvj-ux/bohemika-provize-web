# Moderní 3D ikony služeb — Higgsfield v4

- Datum: 2026-09-22.
- Osm nových statických 3D renderů vytvořených přes Higgsfield, model `gpt_image_2_5`, quality `high`, resolution `1k`, poměr `1:1`, pozadí `opaque`. Vstupem byly odpovídající referenční ikony v3.
- Styl: kouřové tyrkysové sklo, broušený kov, chrom a světlé akcenty; investiční slitky zůstávají zlaté a stříbrné.
- Webové soubory: `public/images/online-card-services/*-v4.webp`, 384 × 384 px, Sharp WebP quality 88 / effort 6. Dohromady 93 624 bajtů.
- Tato sada nahrazuje v3 v minimalistických veřejných vizitkách.

## Animace

Video animace přes model `seedance_2_5` nebyly vytvořeny: první dávka šesti požadavků skončila bez založení jobů s odpovědí „Out of credits on plus (monthly) plan in Private workspace.“ Druhá dávka nebyla odeslána.

Použitá varianta je proto animace statických Higgsfield renderů přímo v CSS: pomalé prostorové natočení, lehký pohyb nahoru a dolů a decentní přejezd odlesku. Nejde o generované video ani o skutečný 3D model. Sedmisekundové smyčky mají mírně posunuté fáze. Bez video souborů, zvuku nebo dalších knihoven.

`useServiceIconMotion.ts` pozastavuje animace mimo viditelnou část stránky a ve skryté záložce. Tlačítko pod kartami je umožňuje pozastavit a znovu spustit; popisky jsou v češtině, angličtině a ukrajinštině. Systémové omezení pohybu a `data-motion="off"` zachovají statické ikony. Bez JavaScriptu zůstávají všechny obrázky a odkazy dostupné.

## Rozložení

Osm karet tvoří jeden kompaktní řádek. Na šířkách 1280 a 1440 px jsou vidět všechny, na menších displejích řada vodorovně roluje i pomocí klávesnice. Ikony jsou vycentrované v prostoru 88 × 88 px. Výška řady je přibližně 255–271 px podle šířky a jazyka. Texty a čtyři existující prokliky jsou zachovány. Pozadí obrázků se do karet prolíná maskou a režimem lighten.

## Soubory a generování

| Ikona | Soubor | Higgsfield job ID |
| --- | --- | --- |
| life | `life-v4.webp` | `07c21b26-47aa-4d62-b635-69e16ffea862` |
| property | `property-v4.webp` | `a80b1bff-ac70-499e-8dc3-23aefb50ddfa` |
| vehicle | `vehicle-v4.webp` | `2895373f-c6ee-47ee-abc0-9244da80dd50` |
| travel | `travel-v4.webp` | `06e9be05-a9f1-4aba-a8b5-b86ca603d873` |
| foreigners | `foreigners-v4.webp` | `9c1ddc2f-d2ce-42a0-b9d9-9cd134448a11` |
| investments | `investments-v4.webp` | `02305a28-2e5d-4b33-883e-775b0548c7b9` |
| mortgage | `mortgage-v4.webp` | `00defe25-b475-43ec-a7ab-2e48bdb39e39` |
| precious-metals | `precious-metals-v4.webp` | `9ccc4730-0b0d-4134-9449-21720ddf4ec6` |

## Prompt

```text
Use case: stylized-concept / precise-object-edit.
Reimagine the supplied service-icon reference as a much more polished, contemporary premium 3D brand sculpture for Bohemika. Preserve the recognizable subject but radically upgrade the materials and art direction.
Style: sophisticated minimalist CGI product sculpture, crisp machined bevels, layered construction, convincing depth, exceptional studio reflections. Primary materials are optical smoked-petrol glass with subtle cyan edges, brushed silver / polished aluminum accents and a little warm porcelain for contrast. No chunky toy plastic, no cartoon face, no excessive ornament, no neon. The gold-and-silver subject must retain real champagne gold and silver ingot materials.
Make the silhouette strong and readable at 88 pixels, with only a few bold surfaces. Objects feel carefully engineered, modern and elegant, not a flat illustration.
Camera: front three-quarter angle, slightly above, controlled 70mm product perspective. Object centered and entirely visible, occupying 80% of the square canvas, breathing room on all sides.
Lighting: soft upper-left studio key with restrained cyan rim reflection and one beautiful narrow specular reflection; high quality controlled contrast.
Background: opaque, completely uniform dark ink navy EXACT #14222d (RGB 20,34,45) on all edges and throughout empty space. No alpha, no gradient, no halo, no floor line, no platform, no cast shadow outside the object. This will be animated on a website card of the same color.
No letters, numbers, words, brands, watermark, labels, badge outlines unrelated to subject, particles or busy detail.
```

### life

```text
A rounded deep-teal protective shield with a single softly sculpted ivory heart inset into its front. A clear symbol of life and income protection; one coherent object.
The original reference colors are not binding: use the upgraded glass/chrome materials above.
```

### property

```text
One compact contemporary ivory house with a deep-teal pitched roof, one doorway and a few broad dark windows. Simple elegant architectural icon, complete house visible; no landscaping.
The original reference colors are not binding: use the upgraded glass/chrome materials above.
```

### vehicle

```text
One unbranded compact estate car, deep-teal body, satin-silver trim, charcoal windows and tires. Elegant realistic proportions simplified into a compact 3D icon, three-quarter front view, complete car visible.
The original reference colors are not binding: use the upgraded glass/chrome materials above.
```

### travel

```text
One deep-teal cabin suitcase with a short silver handle and small wheels. A simple ivory airplane silhouette is embossed on its front. No stickers or luggage tags.
The original reference colors are not binding: use the upgraded glass/chrome materials above.
```

### foreigners

```text
One closed deep-teal passport-sized booklet with a simple ivory globe emblem, paired with one small ivory medical badge carrying a TEAL plus symbol. A compact coherent icon representing health insurance for foreigners. No national seals, flags, red cross or readable text.
The original reference colors are not binding: use the upgraded glass/chrome materials above.
```

### investments

```text
Three compact deep-teal columns of increasing height with two small satin-silver coin discs resting at the base. Broad geometric forms, a simple investment-growth icon. No floating arrows, no currency symbols or inscriptions.
The original reference colors are not binding: use the upgraded glass/chrome materials above.
```

### mortgage

```text
One substantial satin-silver house key with a rounded deep-teal house-shaped bow. The house shape has a simple square cutout. Diagonally arranged as one coherent object with a short legible toothed key blade.
The original reference colors are not binding: use the upgraded glass/chrome materials above.
```

### precious-metals

```text
A restrained pair of small investment ingots, one brushed champagne-gold bar and one satin-silver bar overlapping at a slight angle. Broad beveled edges, clearly distinct warm gold and cool silver materials. No stamps, writing, extra coins or tall piles.
The original reference colors are not binding: use the upgraded glass/chrome materials above.
```

## Ověření

Chrome: osm scénářů rozložení na šířkách 1440, 1280, 1024, 768, 390 a 320 px, světlé i tmavé téma, čeština, angličtina a ukrajinština. Všechny obrázky se načetly, všechny karty zůstaly na jednom řádku, text ani stránka nepřetékají. Na menších displejích funguje vodorovné posouvání klávesnicí a dosažení posledního odkazu.

Samostatná kontrola pohybu ověřila změnu CSS transformace v čase, skutečné zastavení časové osy tlačítkem, pozastavení mimo obrazovku a ve skryté záložce, respektování systémového i aplikačního omezení animací, zachování volby při změně jazyka, animaci na mobilu a proklik obrázku na životní pojištění. Bez chyb JavaScriptu. Cílený ESLint, TypeScript a `git diff --check` prošly. Kontrolní reporty, PNG zdroje a snímky jsou v `.tmp/service-icons-v4/`.
