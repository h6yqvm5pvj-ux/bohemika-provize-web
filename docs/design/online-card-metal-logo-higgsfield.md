# Úvodní vizuál Bohemika — kovový monogram pod skleněným obloukem

- Úprava: Higgsfield plugin, model `gpt_image_2_5`, quality `high`, resolution `2k`.
- ID generování: `16ef63ec-8947-4eea-9d8c-c0a0c0f6b58d`.
- Datum: 2026-09-22.
- Reference scény: původní generování `b9fc8fc2-b341-43de-987d-048b51fa11ee` a jeho [dokumentace](./online-card-hero-higgsfield.md).
- Reference monogramu: `public/images/bohemkalogo.png`, předaná jako JPEG 640 × 960 px, media ID `8cf565a4-8aab-4ac0-b5ec-090e339f6f19`.
- Původní výstup: `public/images/online-card-hero/bohemika-metal-logo-protection-v1.png`.
- Webová verze: `public/images/online-card-hero/bohemika-metal-logo-protection-v1.webp`, 108 554 bajtů.
- Rozměry výstupu: 2688 × 1520 px. Export přes Sharp do WebP quality 86 / effort 6, beze změny rozlišení.
- Použití: `OnlineCardHeroVisual.tsx` v úvodu veřejných vizitek `/vizitka/[slug]`.

## Změna

Z původní scény byly odstraněny zlaté slitky a dům nahrazen stříbrným kovovým symbolem Bohemika podle dodaného loga. Zachované jsou skleněný oblouk, kamenný podstavec, drobné rostliny, tmavé pozadí a prázdná levá část pro jméno a tlačítka. Místní odrazy a stíny odpovídají novému objektu. Texty, ovládání, rozložení stránky i responzivní ořezy zůstávají v původním HTML a CSS. Obrázek je dekorativní, má prázdný alt a je skrytý před čtečkami.

## Ověření

Obrázek zkontrolován samostatně i ve skutečné místní vizitce: odstraněné zlato, kovový monogram podle reference, zachovaný oblouk a volná textová plocha. Chrome při šířkách 1440, 1024, 768, 390 a 320 px načetl nový soubor bez vodorovného přetékání a chyb JavaScriptu. Zkontrolovány světlý a tmavý režim, otevření a zavření formuláře a stažení kontaktu; formuláře ani analytické zápisy se neodesílaly. Cílený ESLint a `git diff --check` prošly. Snímky a report jsou v `.tmp/online-card-metal-logo-check/`.

## Finální prompt

```text
Precisely edit reference image 1, the original widescreen dark-navy architectural hero artwork. Reference image 2 is ONLY the exact Bohemika metallic b-shaped monogram to insert, not a new background.
Make exactly two object changes:
1. Remove every gold bullion bar in front of the plinth, including their gold reflections, reconstructing the original dark studio floor naturally.
2. Replace the entire house with one large upright three-dimensional polished silver/chrome Bohemika monogram matching reference image 2 faithfully. This is the custom lowercase-b-like sculptural symbol with a tall left vertical stem, broad curved circular lower body, open circular counter and three separated stepped rising strokes on the upper-right. Reproduce that exact silhouette, proportions, openings and disconnected pieces; do NOT invent a conventional capital B or add a wordmark. Preserve its metallic beveled edges and subtle brushed surface; its dark negative spaces must show the scene behind. Set it as a convincing solid sculptural object centered on the SAME stone plinth inside the SAME glass arch, occupying roughly the former house's overall visual scale, with the tall stem fitting naturally under the arch. Use cool silver reflections with subtle cyan from the glass. Maintain a coherent front/slightly three-quarter perspective and physical grounding on the plinth. The logo must be readily recognizable.
Preserve EVERYTHING ELSE from image 1 as closely as possible: exact wide camera framing, dark empty left half reserved for website text, the position/shape/material/thickness of the clear cyan-edged glass protective arch, the charcoal rectangular stone plinth and its texture/edges, existing small plants around the plinth, dark navy gradient background, studio floor, lighting direction, shadows and atmosphere. Adjust only the physically necessary local shadow and reflection to integrate the logo and remove the house/gold. Do not copy the light gray background or halo from logo reference 2.
Do not move or enlarge the arch/plinth group; do not crop it. No extra objects, no typography, no website UI, no person, no gold, no house, no watermark. Finished landscape hero artwork, preserve the original composition and aspect ratio.
```
