# Bohemika — logo jako začátek grafu

## Finální prompt rozšíření pozadí

```text
Use case: precise-object-edit.
Asset type: ultrawide FULL-WIDTH background for the entire website hero, landscape 3:1 aspect ratio (approximately 3072 x 1024).
Edit target: the provided finished Bohemika logo-and-glass-growth-chart studio illustration.
User approved this exact artwork and now requests that its backdrop and reflective floor extend seamlessly across the ENTIRE website box, including underneath text placed on the left later in HTML.

Perform an OUTPAINT / CANVAS EXTENSION toward the LEFT. Preserve the existing logo, five bars, curve, materials, camera angle, soft lighting, relative positions and visible floor reflections faithfully. The existing artwork should occupy the rightmost 55% of the final ultrawide canvas. Do not make a new or different logo or scene.
The existing silver custom b symbol ends up at approximately x=54–65% of the FULL canvas. Five glass bars continue from there toward x=91%. The trajectory ends near x=94%. The entire left 48% is EMPTY smooth very dark blue-teal background and matching dark slate reflective floor with only a barely visible subtle tonal gradient. NO objects, lines, highlights, decorations or patterns in the left text zone.
Continue the SAME dark navy/petrol-blue studio backdrop and SAME stone studio floor uninterrupted all the way to the left edge. A single coherent full-bleed environment, no seam, no boundary, no separate inset picture, no fade to transparent, no oval vignette around objects, no frame. On the left the floor must be very dark and subdued to let white website typography stand out.
Keep the original logo and complete glass bars in right half and keep their exact proportions; no stretched objects. Logo and bars physically stand on one continuous floor with the same subdued inverted reflections beneath them. Right subject top margins 15%, object baseline around y=70%, reflections in lower quarter. Keep full group comfortably inside the canvas.
Keep the refined restrained appearance of the reference: satin silver metal, dark architectural blue glass, thin understated cyan line, softbox illumination, realistic shadows and subdued floor reflections. Do not add glow, neon rays, internal glass swirls, bright caustics or extra shine.
Output only the 3:1 ultrawide artwork, not a website mockup. No text, typography, buttons, labels, border, rounded corners or watermark.
```

## Soubory a použití

- Datum: 2026-09-24.
- Generování: vestavěný nástroj `image_gen`, dovednost `imagegen`.
- Finální široké pozadí: `public/images/online-card-hero/bohemika-growth-panorama-v2.webp`, 2172 × 724 px, 82 396 bajtů.
- Mobilní kompozice: `public/images/online-card-hero/bohemika-growth-reflections-v2.webp`, 1672 × 941 px, 103 132 bajtů.
- Export: WebP quality 90 / effort 6.
- Reference identity: `public/icons/bohemika-chrome-symbol.png`.
- Použití: `OnlineCardHeroVisual.tsx`, veřejné vizitky `/vizitka/[slug]`.

Logo a graf jsou nyní jednou scénou se společnou perspektivou, světlem a podlahou. Z pravého okraje kovového B vychází linka nad pěti rostoucími skleněnými sloupci. Na přání uživatele je finální varianta střídmější: tmavé sklo bez zářících vnitřních efektů, měkčí kov a tlumené odlesky. Vygenerovaný bitmapový podklad nenahrazuje oficiální logo v navigaci.

Původní samostatné video, překryté logo, CSS imitace odrazu a ovládání přehrávání jsou z této komponenty odstraněné. Nová ilustrace je statická a dekorativní. Na další přání uživatele pokračuje prostředí přes celou plochu boxu včetně místa pod textem a spodním řádkem. Široké pozadí bylo rozšířené doleva, objekty jsou vpravo. Jemný tmavý přechod udržuje čitelnost jména a tlačítek. Na telefonu se kompozice zobrazuje pod tlačítky přes šířku boxu a přechází nahoře i dole do jeho pozadí. Nativní `picture` vybírá podle šířky jeden optimalizovaný zdroj z `getImageProps`, s prioritním načítáním.

## Ověření

Ověřeno v místním Chrome na skutečné stránce `/vizitka/jakub-rauscher` při šířkách 1440, 1024, 1000, 768, 760, 390 a 320 px. Obrázky se načítají, bez vodorovného přetékání a chyb JavaScriptu. Na desktopu pozadí pokrývá celý box; do 1000 px se motiv skládá pod text, aby se nedostal přes tlačítka a zůstaly vidět všechny sloupce. Zkontrolovaný světlý i tmavý režim, otevření/zavření formuláře schůzky a stažení kontaktu. Analytické a formulářové zápisy byly v kontrolním prohlížeči blokované. Cílený ESLint, TypeScript bez emitování a `git diff --check` prošly. Kontrolní snímky: `.tmp/online-card-growth-reflections/`.

## Prompt schválené kompozice

```text
Use case: stylized-concept.
Asset type: final wide 16:9 website illustration, premium understated financial brand.
Reference 1 is the EXACT Bohemika monogram silhouette to reproduce. Reference 2 is the previous composition to improve. The user says the previous image looks too AI-generated. Redesign its MATERIALS AND LIGHTING into a quiet, physically plausible design-studio product photograph. It must feel deliberately modeled by a professional industrial/3D designer, not an AI finance stock image.

Preserve the readable basic layout: one Bohemika metal b on the left, five increasing glass bars immediately to its right, and a delicate rising line starting at the upper-right opening of the b and continuing over the columns. All six objects stand on the SAME dark horizontal floor. No graph behind the logo, no overlap. All objects share exact same camera projection. Wide 16:9, subjects fully inside x=13–88%, y=17–73%, bottom quarter reserved for floor reflections, equal comfortable margins. Camera is nearly frontal with slight view of top and right faces, an 85mm architectural product lens, very little perspective distortion. The tallest bar is approximately the same overall height as the logo.

Crucial identity: faithfully match reference 1's custom lower-case-b-shaped silhouette: one long left stem, one circular lower bowl, one single round opening, separate small rising metal strokes at the upper-right break. Preserve the separated pieces and their proportions. It is not a regular uppercase B, not a generic typeface b. The logo has physically thick edges, a clean satin stainless-steel front and carefully bevelled polished edge, no grime, no random scratches, no visible texture noise. Soft directional light makes the front mostly silver-grey, not mirror chrome black and white.

Bar design: five perfectly straight, geometrically regular SOLID glass rectangular prisms with identical width and depth and precise consistent spacing, progressively higher. Heavy architectural smoked petrol-blue optical glass, muted transparency and very restrained clean internal refraction. Flat polished tops, crisp narrow bevels, subtle blue edge tint. NO internal swirling liquids, NO water textures, NO empty hollow tops, NO big white edge bloom, NO glowing acrylic.

Line: one fine elegant pale-cyan thread, visually connecting to the logo's right-hand top step, gently rising without dipping and tracing across the bar tops toward the upper-right. Restrained line brightness, no neon haze, no lens flare, no arrowhead. End cleanly within composition. Should be a subtle design accent.

Lighting: one large softbox upper left, one faint cyan bounce to the right. Editorial architectural studio photograph, nuanced light, natural contact shadows. Dark desaturated blue-teal seamless background #102733, dark outer edges; no horizon, no vignette border. Matte-satin dark polished stone floor, coherent realistic inverted reflections of BOTH logo and bars directly beneath them, softer and darker as they recede. Retain reflections visibly for the bottom quarter, but subdued not glowing. No caustic rays, light beams or radial streaks. No visible floating contact.
Art direction: precise, restrained, tactile, minimal, premium Swiss financial brand. Calm color grade, no gimmicks. The sophistication comes from proportion, spacing, controlled highlights and physical materials. Avoid typical AI fantasy CGI, oversaturated neon-blue, extreme shine, excessive contrast, plastic chrome, scratched dirty metal, liquid glass, disconnected reflections, invented logo parts, clutter. No text, labels, numbers, axes, grids, UI, people, coins, watermark. This is only the illustration.
```
