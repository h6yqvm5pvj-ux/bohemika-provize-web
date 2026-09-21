# Symboly pojistných rizik – Higgsfield

## Finální sada v2

Osm jednoduchých prostorových symbolů pro stránku životního pojištění. Revize vychází z požadavku na jednoznačnější motivy: náhrobek u smrti, zlomená kost u úrazu a pacient na lůžku s pečující osobou u závislosti na péči. Trvalé následky odlišuje znak nekonečna. Názvy a vysvětlení zůstávají běžným textem vedle obrázků.

- Generátor: Higgsfield / `gpt_image_2_5`, poměr 1:1, 1K, kvalita medium, transparentní pozadí.
- Materiálová reference: přijatý úvodní obrázek `4071a1da-596f-48af-973d-0ce3171acc2e`.
- Výstupy pro web: `public/images/life-insurance/risks/{id}-v2.webp`, 384 × 384 px, skutečný alfa kanál.
- Optimalizace: Sharp, WebP quality 88, alphaQuality 100, effort 6. Celá sada: 127 340 bajtů.
- Zapojení: `src/components/LifeInsuranceContent.tsx`; rozvržení v `lifeInsuranceTheme.module.css`.
- Předchozí varianta v1 zůstává zachovaná, stránka používá v2.

| Riziko | Soubor | Higgsfield generation ID |
| --- | --- | --- |
| Smrt | `death-v2.webp` | `4296e0ec-2fec-46a3-98ad-36ace29fa0a3` |
| Invalidita | `disability-v2.webp` | `47d11f77-c083-42fc-a5c7-b2b7f1941c98` |
| Závislost na péči | `care-v2.webp` | `8cb6ed6d-264d-40f3-8026-f20e5f71515c` |
| Závažná onemocnění a poranění | `serious-illness-v2.webp` | `e05a5cb1-340f-4fd3-ac3b-aa2dbed3b20b` |
| Denní odškodné za úraz | `daily-accident-v2.webp` | `47422223-d075-4b6e-9dfb-d8d94a11f90f` |
| Trvalé následky úrazu | `permanent-injury-v2.webp` | `bfae5cdb-554c-4afb-a46b-3a5ae1d04490` |
| Pracovní neschopnost | `sick-leave-v2.webp` | `cc1e1a8a-81bb-450b-854a-b4d741f2e90e` |
| Hospitalizace | `hospitalisation-v2.webp` | `6e9e9bd9-d81e-4e75-8370-1eeb2ec3dbfa` |

## Společné zadání

Ke společnému zadání se připojuje jeden z motivů níže.

```text
Create ONE exceptionally clear, simple, premium 3D SYMBOL for a Bohemika life-insurance risk card. The previous version was too much like miscellaneous products; this revised set must communicate the category through a bold conventional pictogram.
The supplied reference is ONLY a material/color guide: soft matte ivory ceramic and polished deep petrol turquoise from the Bohemika family artwork. Do NOT reproduce its people, glass arch, house, platform or background unless explicitly asked by the subject.
Shared visual system: thick gently rounded dimensional glyphs, frontal view with only a slight 10-degree view of the right side, a calm upper-left studio light, very subtle bevel highlights. Ivory #eeeae2, deep petrol turquoise #087a9a, small pale #a7ddee reflections. Focus on readable SILHOUETTE, not textures or intricate detail. No realistic product photography, no scene, no miniature diorama, no decorative surroundings.
Composition: ONE central isolated symbol occupying 76–84 percent of the square canvas, no cropping, 10 percent breathing room, designed to read instantly at 68–104 pixels. Consistent scale and camera across all eight symbols.
Background: genuine TRANSPARENT RGBA, alpha zero outside and in all cutout holes. No background, no plate, no badge disk, no floor, no border, no drawn transparency checkerboard. Only a tiny soft semitransparent shadow if needed.
No lettering, numbers, words, labels, logos or watermark. Output one complete icon only.
Subject:
```

### Smrt

```text
Exactly one unmistakable TOMBSTONE / GRAVESTONE: a short broad upright slate-gray stone headstone with a softly rounded arched top, a single simple engraved cross on the front, and a small matching horizontal stone base. Restrained brushed-slate / charcoal-gray finish with softly illuminated ivory edges. Clean conventional cemetery-headstone silhouette, dignified and plain. No letters, no RIP, no names, no dates, no people, no skull, no flowers, no mourning ribbon. The engraved cross is small but clearly legible. This is the user's explicit preferred symbol for death.
```

[Zdrojový PNG](https://d8j0ntlcm91z4.cloudfront.net/user_3JF8pKSlv0zT1GVlKBvGahgg3Zx/hf_20260921_141356_4296e0ec-2fec-46a3-98ad-36ace29fa0a3.png)

### Invalidita

```text
One dimensional rendition of the universally recognizable WHEELCHAIR ACCESSIBILITY PICTOGRAM: a simplified ivory circular head and seated human body with one bent leg, integrated with one large deep turquoise circular wheel and a simple seat/frame. Like a clear 3D wayfinding symbol, not a realistic empty wheelchair. Minimal thick forms, unmistakable silhouette, no circular sign background.
```

[Zdrojový PNG](https://d8j0ntlcm91z4.cloudfront.net/user_3JF8pKSlv0zT1GVlKBvGahgg3Zx/hf_20260921_141311_47d11f77-c083-42fc-a5c7-b2b7f1941c98.png)

### Závislost na péči

```text
One very simple readable dimensional CARE SCENE symbol: a person LYING IN A HOSPITAL BED, with a second standing caregiver beside the bed supporting them. The patient has a clear ivory round head on a pillow and an ivory body under a deep turquoise blanket. The caregiver is a simple ivory human figure standing close at the right side, one arm reaching gently toward the patient's shoulder or hand. Bed has one clean ivory frame and small teal accents. Exactly two people, no medical tools, no room, no wall, no heart, no giant hand. Reduce the composition to the bed and two chunky human silhouettes so it remains recognizable at 100 pixels. Three-quarter view only as needed to show both the lying patient and standing helper. No facial details, no injury.
```

[Zdrojový PNG](https://d8j0ntlcm91z4.cloudfront.net/user_3JF8pKSlv0zT1GVlKBvGahgg3Zx/hf_20260921_141357_8cb6ed6d-264d-40f3-8026-f20e5f71515c.png)

### Závažná onemocnění a poranění

```text
Exactly one deep turquoise HEART symbol with a bold raised ivory ECG pulse zigzag running horizontally across its front face. Strong minimal health/serious-illness pictogram, one clear central pulse peak, thick readable stroke. No stethoscope, no hands, no extra medical tools.
```

[Zdrojový PNG](https://d8j0ntlcm91z4.cloudfront.net/user_3JF8pKSlv0zT1GVlKBvGahgg3Zx/hf_20260921_141313_e05a5cb1-340f-4fd3-ac3b-aa2dbed3b20b.png)

### Denní odškodné za úraz

```text
Exactly one immediately recognizable BROKEN BONE symbol: an ivory long bone with softly rounded double-lobed ends, divided near its middle by a clear narrow zigzag fracture gap. The two bone halves are slightly displaced so the break is unmistakable. Strong simple diagonal silhouette, gentle ivory material and subtle turquoise edge highlights. No hand, no skin, no blood, no red marks, no cast, no bandage, no calendar, no infinity sign. Clean non-graphic medical pictogram of a fracture.
```

[Zdrojový PNG](https://d8j0ntlcm91z4.cloudfront.net/user_3JF8pKSlv0zT1GVlKBvGahgg3Zx/hf_20260921_141356_47422223-d075-4b6e-9dfb-d8d94a11f90f.png)

### Trvalé následky úrazu

```text
One clear PERMANENT INJURY symbol: a small ivory broken long bone with rounded double-lobed ends and a clean central zigzag fracture gap, paired with a bold deep turquoise INFINITY sign below it. Bone on a gentle diagonal above, infinity centered below, visually integrated compact emblem. Both forms large and unmistakable, thick simple shapes; infinity's two holes fully open. No hand, no brace, no blood, no bandage, no calendar, no letters. The infinity sign is essential to distinguish permanent consequences from the ordinary broken-bone accident symbol.
```

[Zdrojový PNG](https://d8j0ntlcm91z4.cloudfront.net/user_3JF8pKSlv0zT1GVlKBvGahgg3Zx/hf_20260921_141356_bfae5cdb-554c-4afb-a46b-3a5ae1d04490.png)

### Pracovní neschopnost

```text
Exactly one clean deep turquoise WORK BRIEFCASE pictogram with a short rectangular top handle, featuring a large raised ivory PAUSE symbol (two thick parallel vertical bars) centered on its front. Represents work temporarily on hold. Solid chunky 3D graphic silhouette, simple ivory rim, no wallet, no calendar, no money, no letters, no cross.
```

[Zdrojový PNG](https://d8j0ntlcm91z4.cloudfront.net/user_3JF8pKSlv0zT1GVlKBvGahgg3Zx/hf_20260921_141357_cc1e1a8a-81bb-450b-854a-b4d741f2e90e.png)

### Hospitalizace

```text
Exactly one simple front-facing ivory HOSPITAL BUILDING pictogram: compact block with a large deep turquoise medical PLUS clearly centered near the top, a pair of broad turquoise entrance doors below, and only four simple recessed square windows. A readable hospital symbol, not an architectural diorama. Turquoise roof edge. No red cross, no bed, no room, no ambulance, no people.
```

[Zdrojový PNG](https://d8j0ntlcm91z4.cloudfront.net/user_3JF8pKSlv0zT1GVlKBvGahgg3Zx/hf_20260921_141356_6e9e9bd9-d81e-4e75-8370-1eeb2ec3dbfa.png)

## Ověření

Vizuálně zkontrolován společný náhled všech osmi symbolů a jejich průhlednost. Kontrola prohlížečem zahrnuje načtení všech osmi souborů v2, rozměry 1440, 768, 390 a 320 px bez vodorovného přetékání, světlé i tmavé zobrazení a český, anglický a ukrajinský text. Čtyři interaktivní karty nadále otevírají své dialogy. Report a snímky jsou v `.tmp/life-risks-higgsfield/`. Samostatná animace úvodu je popsána v `life-insurance-hero-motion-higgsfield.md`.
