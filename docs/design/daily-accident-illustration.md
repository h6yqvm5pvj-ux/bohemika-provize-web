# Ilustrace denního odškodného za úraz

- Asset: `public/images/life-insurance/daily-accident-recovery-transparent.webp`
- Generation: built-in `image_gen` tool (not CLI).
- Use: introductory illustration in the daily accident benefit dialog.
- Delivery: 1200 × 800 WebP with alpha transparency, optimized from the generated edit without flattening.
- Original edit target: `public/images/life-insurance/daily-accident-recovery.webp`.
- Verified on the page in light and dark modes, including mobile layout; the image element has no CSS background.

## Final prompt

Use case: background-extraction. Input image is the edit target: the existing 3D illustration of a white first-aid case with a turquoise plus, a white rolled bandage and a desk calendar. Remove ONLY the pale blue-grey background and ground plane. Output a genuinely transparent RGBA image with alpha zero outside the objects, not a solid colour background and not a drawn checkerboard. Preserve the three objects, their exact positions, proportions, original white and turquoise colours, details, composition, framing, lighting and realistic materials. Preserve cutout gaps such as the space inside the first-aid case handle. Clean antialiased edges with no grey or white matte fringe, suitable on both white and dark navy website backgrounds. Keep all objects fully visible. No new elements, no text, no scene redesign. Any small contact shadow should be subtle and semitransparent with no opaque floor. Keep the original landscape 3:2 composition.

## Original generation prompt

Use case: stylized-concept. Asset type: editorial 3D illustration for a Czech insurance advisor website, in the detail modal about daily compensation during recovery from an injury. Create one refined studio still life: a white first-aid case with a small turquoise plus symbol, a softly rolled white medical bandage and a minimal standing desk calendar with a subtle turquoise check mark. No words, numbers, brand marks or logo. Calm, reassuring, professional, not toy-like. Matte porcelain white, pale turquoise #a7ddee, deeper teal #087a9a and a few restrained brushed silver accents, matching a clean Bohemika financial advisor website. Compact balanced composition, three-quarter camera view, all objects fully visible with generous margin, soft realistic contact shadows. Background: uniform very pale blue-grey #edf2f4. Landscape composition, 3:2 aspect ratio, clean premium 3D rendering with tactile materials, no people, no injury depiction, no money, no clutter. The calendar suggests days of recovery, never an instant payout promise.
