# Úvodní vizuál Bohemika — bydlení, ochrana majetku a investice

- Generování: Higgsfield plugin, model `gpt_image_2_5`.
- ID generování: `b9fc8fc2-b341-43de-987d-048b51fa11ee`.
- Datum: 2026-09-21.
- Původní výstup: `public/images/online-card-hero/bohemika-home-protection-investments-v1.png`.
- Webová verze: `public/images/online-card-hero/bohemika-home-protection-investments-v1.webp`.
- Rozměry: 1344 × 752 px; požadovaný poměr 16:9, skutečné rozměry vrátil model.
- Optimalizace: Sharp, WebP quality 86 / effort 6, původní rozlišení.
- Stav: zapojeno do úvodu veřejných vizitek `/vizitka/[slug]` přes `OnlineCardHeroVisual.tsx`.
- Načítání: prioritní WebP přímo z projektu, 34 420 bajtů, bez dalšího překódování.

## Vizuální směr a použití

Tmavě modrá kompozice vychází z barev úvodu v `src/components/OnlineCardMinimal.module.css`: #0c1923, #14222d, #087a9a a #88d9ef. Dům představuje bydlení a majetek, skleněný oblouk jeho ochranu, drobné zlaté slitky investice. Motiv je v pravé části, levá zůstává tmavá a klidná pro bílé jméno a kontaktní prvky. Jméno, logo ani kontaktní údaje nejsou součástí bitmapy a patří do HTML.

Na počítači obrázek pokrývá úvod, text a tlačítka jsou vlevo. Jemný tmavý přechod udržuje textovou oblast čitelnou. Do šířky 1000 px má obrázek samostatné místo pod textem a tlačítky, pravý ořez zachovává celý dům, oblouk i zlato a maska změkčuje okraje. Lokalita a hlavní přínos jsou ve spodním řádku úvodu.

Obrázek nahrazuje velký animovaný monogram ve veřejné šabloně. Původní obrazové soubory osobních značek a jejich mapování zůstávají pro stávající editor v nastavení. Dekorativní obrázek má prázdný alt a je skrytý před čtečkami; obsah a ovládání zůstávají v HTML. Byly odstraněny posluchače pohybu myši a animace související s původním monogramem.

## Kontrola

Vizuálně zkontrolován původní výstup: celý hlavní motiv zůstává uvnitř obrazu, textová zóna je volná, bez generovaných nápisů a log. PNG a optimalizovaný WebP mají shodné rozměry.

Po vložení prošly cílený ESLint a TypeScript bez emitování. Skutečná místní stránka `/vizitka/jakub-rauscher` byla ověřena v Chrome při šířkách 1440, 1024, 768, 390 a 320 px: obrázek načtený, bez vodorovného přetékání a bez chyb JavaScriptu, funkční otevření a zavření formuláře schůzky. Na 1440 a 390 px také tmavý režim a stažení kontaktu; na 320 px anglické rozhraní. Kontrolní návštěvy neposílaly analytické zápisy ani formuláře. Snímky a záznam ověření jsou lokálně v `.tmp/online-card-hero-check/`.

## Finální prompt

```text
Use case: ads-marketing / stylized-concept.
Asset type: one finished widescreen website hero background, no UI, no words. Brand: Bohemika, a Czech financial advisory business. Convey home, asset protection and long-term investment in one elegant coherent still-life.
Art direction: premium editorial architectural CGI, photoreal materials and physically plausible studio lighting, exceptionally restrained, tactile, sophisticated, trustworthy.
Composition: landscape 16:9. Keep the entire LEFT 48 percent almost empty, very dark low-contrast ink navy #0c1923, with only a subtle smooth atmospheric gradient; this is a deliberate text-safe area for a large white adviser name and contact controls added later in HTML. All recognizable objects, specular highlights and shadows should be within x=55–91 percent and y=18–81 percent. Leave calm breathing room around the right-hand sculptural group. No cropped objects. Do not generate any website layout or text.
Main subject: a beautifully detailed miniature contemporary Czech family house with an ivory limewashed facade, elegant graphite standing-seam gabled roof, a few large windows with a very gentle warm interior glow. It rests on one low, finely textured charcoal stone plinth. Behind and partially over the house, a single thick clear architectural glass arch with delicate muted petrol-cyan edges suggests shelter and protection; simple sculptural glass, not a giant badge or shield icon. In the foreground at the right of the house, place just two small realistically brushed champagne-gold bullion bars, understated and unmarked, visibly secondary to the home. This is one grounded still-life with consistent scale and lighting, not a collage, icon grid or cityscape.
Palette: background #0c1923 and #14222d, very restrained petrol #087a9a reflections and icy #88d9ef glass highlights, soft ivory, brushed silver, tiny warm champagne-gold accents. No vivid green, magenta or orange.
Lighting: large soft studio key from upper right, controlled rim light on glass, deep rich shadows, fine details, subtle ambient reflections, mostly matte ground with a faint soft reflection under the objects. High-end crafted financial brand campaign. Gentle perspective from slightly above, natural 60mm photographic lens, calm and balanced.
Constraints: no people, no portraits, no letters, no numbers, no typography, no logo, no watermark, no stock-market chart, no rising arrows, no stacks of coins, no neon, no lens flare, no ornate decoration, no crowded scene, no floating symbols. Left half must remain quiet and visibly usable for white text. Finished artwork only.
```
