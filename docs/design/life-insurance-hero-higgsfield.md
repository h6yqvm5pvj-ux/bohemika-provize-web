# Úvod životního pojištění — rodina pod skleněným obloukem

- Generování: plugin Higgsfield, model `gpt_image_2_5`.
- ID generování: `4071a1da-596f-48af-973d-0ce3171acc2e`.
- Datum: 2026-09-21.
- Originál: `public/images/life-insurance/family-protection-hero-v1.png`.
- Webová verze: `public/images/life-insurance/family-protection-hero-v1.webp`.
- Výstup modelu: 1168 × 880 px, požadovaný poměr 4:3.
- Optimalizace: Sharp, WebP quality 88 / effort 6, bez změny rozměrů; 43 882 bajtů.
- Použití: úvod `LifeInsuranceContent.tsx`, veřejná cesta `/vizitka/[slug]/zivotni-pojisteni`.

## Vzhled a zapojení

Dvě dospělé postavy a dítě jako figurativní sochy z matného světlého materiálu. Rodinu rámuje průhledný tyrkysový skleněný oblouk, malý domek doplňuje téma závazků. Tmavě modré pozadí a sklo navazují na hlavní vizitku.

Na počítači je motiv vpravo od hlavního nadpisu, do šířky 1023 px pod ním. Obrázek se zobrazuje celý přes `object-fit: contain`, poměr prostoru je předem vyhrazený. Maska změkčuje okraje a propojuje obraz se stávajícím pozadím. WebP se načítá prioritně přímo z projektu, bez dalšího překódování.

Tři přínosy Příjem / Závazky / Rodina jsou pod úvodním textem. Původní vysvětlení ochrany zůstává v HTML pod obrázkem. Používají se stávající české, anglické a ukrajinské texty. Obrázek je dekorativní, má prázdný alt a je skrytý před čtečkami. Částky, statistiky, výpočty a formuláře nejsou součástí bitmapy.

## Ověření

- Cílený ESLint a TypeScript bez emitování prošly.
- Skutečná stránka v místním Chrome zkontrolována při šířkách 1440, 1024, 768, 390 a 320 px: obrázek načtený, tři přínosy přítomné, bez vodorovného přetékání a bez chyb JavaScriptu.
- Na 1440 a 390 px ověřen tmavý režim, otevření a zavření detailu invalidity i formuláře schůzky.
- Na 320 px ověřeno také anglické a ukrajinské rozhraní.
- Vizuálně zkontrolován optimalizovaný obrázek a snímky desktopu, mobilu a ukrajinské verze. Všechny postavy a celý oblouk zůstávají viditelné.
- Lokální kontrolní snímky a report: `.tmp/life-hero-higgsfield/`. Během kontroly se neposílaly formuláře ani analytické zápisy.

## Finální zadání

```text
Use case: stylized-concept / ads-marketing.
Asset type: one finished 4:3 landscape editorial 3D illustration for the right-hand hero column of the Bohemika Czech life-insurance website. Output artwork only, no UI, no typography.
Primary request: a calm, human, elegant sculptural family under a protective glass arch, harmonizing with a dark ink-navy and turquoise financial-adviser website.
Subject: exactly THREE finely crafted contemporary figurative sculptures: two adults and one school-age child between them, standing close together with a gentle natural connection, their hands lightly joined. Their bodies have softly simplified but credible human proportions and subtle clothing folds, and understated smoothly sculpted heads without detailed facial features. A family expressed through beautiful contemporary ivory ceramic sculpture, warm and dignified rather than toy-like. One adult is slightly taller than the other, the child reaches roughly their waists. No extra people.
Behind and partially above them is ONE thick clear architectural glass arch with polished edges and delicate petrol-cyan refraction, an airy symbolic shelter. Its shape and material should feel like an expensive sculptural glass object. The entire arch must be visible, with generous margin above it. A single small simple ivory architectural house with a graphite gabled roof rests near the family's lower right, visibly secondary and much smaller than the people. All objects are grounded together on a very low dark stone oval plinth.
Composition: compact and CENTERED, all key objects in the central 78 percent of the canvas, whole figures and whole arch, balanced three-quarter view from slightly above, natural 65mm perspective, generous margin on all sides. The subjects should occupy most of the image height, with 10 percent top clearance. This image has its own column on the website; DO NOT reserve a blank left half. No rectangular frame.
Palette and backdrop: seamless deep ink navy #0c1923 studio background and matte ground, smoothly fading into uniform #0c1923 at all four outer edges so it blends into the page. Soft matte ivory #eeeae2 figures, graphite #14222d base, refined clear glass with subtle turquoise #087a9a and pale ice-blue #a7ddee highlights. A very faint warm reflected light between the people suggests care. No gold, no coins, no investment bars.
Light and quality: photoreal PBR materials, soft large studio key, restrained cyan edge light on glass, subtle fine ceramic texture, rich quiet shadows, minimal soft floor reflection. Beautiful premium editorial still life, subtle human warmth, visually clean and sophisticated, no exaggerated glossy plastic.
Constraints: no letters, no labels, no numbers, no logo, no watermark, no stock charts, no arrows, no medical crosses, no weapons, no injury, no hospital scene, no giant heart or shield symbol, no clutter, no halo around heads, no realistic human skin, no photographic humans. Never crop heads, glass arch, feet or house. A single integrated scene.
```
