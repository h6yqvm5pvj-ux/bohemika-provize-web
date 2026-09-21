# Animace úvodu životního pojištění

- Generování: Higgsfield / `seedance_2_5`, `omni_reference`, 6 s, požadavek 720p, bez audia.
- Generovaný klip: `3aad8533-769a-4653-99f7-f1c3e902696c`.
- Stejný počáteční i koncový obraz: `4071a1da-596f-48af-973d-0ce3171acc2e` — přijatá rodina pod skleněným obloukem.
- Webový soubor: `public/videos/life-insurance/family-protection-light-loop-v1.mp4`.
- Parametry ověřené ffprobe: 960 × 720, H.264, yuv420p, 24 fps, 145 snímků, 6,042 s, žádná zvuková stopa.
- Velikost: 194 162 bajtů.
- Optimalizace v sandboxu Higgsfield: FFmpeg, `scale=960:-2:flags=lanczos,fps=24`, `libx264 -preset slow -crf 24 -pix_fmt yuv420p -an -movflags +faststart`.
- Optimalizovaný export v Higgsfieldu: `7f862404-7b44-4e94-9620-fd9bff46fc2d`.
- Zapojení: `src/components/life-insurance/LifeInsuranceHeroMedia.tsx`.

## Přehrávání

Klip se opakuje bez zvuku a přehrává inline. Automatické přehrání je povoleno od 1024 px pouze bez preference omezeného pohybu, bez úspory dat a při zapnutých animacích aplikace. Na mobilu se zpočátku zobrazuje původní statický WebP. Video nemá v DOM zdroj, dokud není povolené přehrávání a úvod viditelný; samotná návštěva na mobilu tedy video nestahuje.

Přepínač umožňuje spustit animaci nebo se vrátit ke statickému obrázku. Má stabilní přístupný název, stav `aria-pressed` a český, anglický i ukrajinský text. Výslovné spuštění uživatelem funguje i na mobilu a při výchozím omezení automatických animací. Při opuštění viditelné části nebo skrytí dokumentu se video zastaví a odebere z DOM. Blokované automatické přehrání i chyba videa zachovají statický obrázek.

## Ověření

- Vizuálně zkontrolováno šest snímků v průběhu klipu: rodina, domek a kamera zůstávají klidné, odlesk přechází po oblouku.
- Chrome: skutečné přehrávání, mute, loop, inline, přepnutí na obrázek a zpět, zastavení mimo obrazovku, změna preference omezeného pohybu a nastavení animací aplikace.
- Mobil 390 px: žádné automatické stažení videa, úspěšné ruční spuštění a návrat na obrázek.
- Omezení pohybu a úspora dat: ověřeno nulové stažení videa při načtení.
- Simulované zamítnutí `play()` i chyba zdroje: funkční statický obrázek, žádná neobsloužená chyba JavaScriptu.
- Snímky a report: `.tmp/life-risks-higgsfield/motion-report.json`, `loop-frames.png`.
- ESLint a TypeScript bez emitování prošly.

## Finální zadání

```text
Create a very restrained six-second seamless cinemagraph of the supplied Bohemika life-insurance hero sculpture. The start and end reference images are the SAME accepted artwork and must match exactly.
LOCK THE CAMERA completely: identical framing, lens, perspective, scale, crop and background throughout. The ivory adult figures, child, their hands, faces, clothing, small house, stone plinth and the physical glass arch are INANIMATE SCULPTURES and remain absolutely rigid and stationary. Do not make the people breathe, blink, turn, sway, smile, gesture, move hands, change expression or come alive. No object or anatomical deformation.
The ONLY motion is a soft narrow pale-cyan studio reflection gliding very slowly along the EXISTING GLASS ARCH: from its left lower edge, up over the curve, down the right edge, then gently fading back to the original lighting by the final frame. Low amplitude, tasteful polished-glass glint, not a neon strip, not a particle trail. Preserve the clear glass transparency and subtle turquoise color. Overall scene exposure and the light on the statues remain stable.
The first and last frames should be visually identical for looping without a cut or brightness jump. Keep all objects in exactly the original locations, keep the navy background and ivory material, no new objects, no typography, no overlays, no particles, no zoom, no pan, no parallax. SILENT output, no music, no speech, no sound effects. Full 4:3 artwork retained.
```
