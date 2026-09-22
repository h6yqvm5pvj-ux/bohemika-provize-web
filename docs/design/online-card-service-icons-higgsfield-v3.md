# Kompaktní karty služeb — ikony Higgsfield v3

Historická verze; aktuální minimalistické vizitky používají [ikony v4 s animací v CSS](./online-card-service-icons-higgsfield-v4.md).

- Datum: 2026-09-22.
- Generování: Higgsfield plugin, model `gpt_image_2_5`, quality `high`, resolution `1k`, poměr `1:1`, pozadí `transparent`.
- Osm samostatných generování, sjednocený prompt, paleta a kamera.
- Webové soubory: `public/images/online-card-services/*-v3.webp`, 384 × 384 px, skutečná průhlednost alfa.
- Export: Sharp, WebP quality 88 / alphaQuality 100 / effort 6; všech osm souborů dohromady 123 284 bajtů.
- Použití: minimalistické veřejné vizitky přes `AdvisorProfileSections.tsx` a `OnlineCardMinimal.module.css`.

## Rozložení

Osm menších karet tvoří jeden řádek; při běžné šířce 1280 px a více jsou viditelné všechny. Na menších displejích řada vodorovně roluje, včetně ovládání klávesnicí. Ikony mají vyhrazený prostor 88 × 88 px. Výška celé řady v češtině na 1440 px je přibližně 255 px. Názvy, popisy a čtyři existující prokliky jsou zachované. Původní obrazové soubory zůstávají v projektu.

## Soubory a generování

| Ikona | Soubor | Higgsfield job ID |
| --- | --- | --- |
| life | `life-v3.webp` | `98d0dd3c-4e6d-458d-8199-1db3763debad` |
| property | `property-v3.webp` | `afae8fb0-8e45-4a29-b0fe-9667e5bce769` |
| vehicle | `vehicle-v3.webp` | `0e1e2c0a-5bf1-4453-a3b8-c723ffd626ed` |
| travel | `travel-v3.webp` | `16fe606b-6b99-42d0-99d5-8b75c40e5170` |
| foreigners | `foreigners-v3.webp` | `4ca4dd5c-c3c8-4d3a-88cb-05249fc9e3b9` |
| investments | `investments-v3.webp` | `620dc908-3d1d-457d-a890-ed6ae300cb4c` |
| mortgage | `mortgage-v3.webp` | `5b1d9557-f001-4237-9e6c-a4dfd57b4361` |
| precious-metals | `precious-metals-v3.webp` | `16c8ea1c-f529-404b-ae66-eeab1df63f56` |

## Ověření

Všechny výstupy vizuálně zkontrolovány v přehledu a v prohlížeči. Chrome: šířky 1440, 1280, 1024, 768, 390 a 320 px, světlý a tmavý režim, čeština, angličtina a ukrajinština. Osm scénářů prošlo bez chyb JavaScriptu, rozbitých obrázků, přetékajícího textu nebo vodorovného přetékání stránky. Ověřeno osm karet na jedné řádce, čtyři odkazy a posouvání včetně klávesnice a dosažení posledního odkazu. Cílený ESLint, TypeScript bez emitování a `git diff --check` prošly. Snímky, původní PNG a kontrolní report jsou v `.tmp/service-icons-v3/`.

## Společný finální prompt

Ke společnému promptu níže je připojen příslušný popis motivu.

```text
Use case: stylized-concept.
Asset: one refined compact 3D service icon for the Bohemika financial advisory website. This is part of ONE coordinated set of eight icons.
Art direction: clean premium sculptural product icon, softly beveled simple geometry, tactile satin materials, clear silhouette readable at 88px. A tasteful balance of realistic material and simplified geometry, neither a detailed product photograph nor a childish cartoon.
Palette: restrained deep petrol teal #087a9a, icy cyan #88d9ef highlights, warm ivory #f1eee7, satin silver, charcoal small details. Gold only where the subject explicitly requests an ingot.
Lighting and camera: soft broad studio light from upper left, gentle restrained shadows, front three-quarter view slightly from above, orthographic feel, consistent across the set.
Composition: square 1:1, single compact centered object or coherent group, fully visible, use about 78–84 percent of the canvas with even transparent breathing room. No cropped edges.
Background: genuinely transparent alpha, including gaps in the object. No solid background, no checkerboard painted into the image, no floor, no pedestal, no scene, no halo or cast floor shadow. Normal opaque solid objects; the alpha applies to the background only.
Avoid: lettering, numbers, words, watermarks, company/manufacturer logos, stock symbols, busy microtexture, tiny decoration, excessive reflections, neon, magical sparkles, glass bubbles, extra objects.
Subject:
```

## Motívy

### life

```text
A rounded deep-teal protective shield with a single softly sculpted ivory heart inset into its front. A clear symbol of life and income protection; one coherent object.
```

### property

```text
One compact contemporary ivory house with a deep-teal pitched roof, one doorway and a few broad dark windows. Simple elegant architectural icon, complete house visible; no landscaping.
```

### vehicle

```text
One unbranded compact estate car, deep-teal body, satin-silver trim, charcoal windows and tires. Elegant realistic proportions simplified into a compact 3D icon, three-quarter front view, complete car visible.
```

### travel

```text
One deep-teal cabin suitcase with a short silver handle and small wheels. A simple ivory airplane silhouette is embossed on its front. No stickers or luggage tags.
```

### foreigners

```text
One closed deep-teal passport-sized booklet with a simple ivory globe emblem, paired with one small ivory medical badge carrying a TEAL plus symbol. A compact coherent icon representing health insurance for foreigners. No national seals, flags, red cross or readable text.
```

### investments

```text
Three compact deep-teal columns of increasing height with two small satin-silver coin discs resting at the base. Broad geometric forms, a simple investment-growth icon. No floating arrows, no currency symbols or inscriptions.
```

### mortgage

```text
One substantial satin-silver house key with a rounded deep-teal house-shaped bow. The house shape has a simple square cutout. Diagonally arranged as one coherent object with a short legible toothed key blade.
```

### precious-metals

```text
A restrained pair of small investment ingots, one brushed champagne-gold bar and one satin-silver bar overlapping at a slight angle. Broad beveled edges, clearly distinct warm gold and cool silver materials. No stamps, writing, extra coins or tall piles.
```
