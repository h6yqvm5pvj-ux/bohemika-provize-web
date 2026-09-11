# 3D úvod srovnání cestovního pojištění

Úvod používá skutečnou animovanou WebGL scénu. Geometrie ostrova, palem a letadla je sestavená přímo v kódu; scéna nevyužívá generované obrázky, textury ani externí modely. Původní bitmapová ilustrace byla na žádost uživatele nahrazena a její nepoužívaný WebP odstraněn z projektu.

## Soubory

- `src/app/pomucky/cestovni-pojisteni-cpp-vs-kooperativa/TravelHeroScene.tsx`: klientská komponenta, načtení rendereru, ovládání pozastavení a vlastní vektorová náhrada pro zařízení bez WebGL.
- `src/app/pomucky/cestovni-pojisteni-cpp-vs-kooperativa/travelSceneRenderer.ts`: geometrie, matné materiály, světlo, ortografická kamera, animace a správa prostředků.
- `src/app/pomucky/cestovni-pojisteni-cpp-vs-kooperativa/travelScene.module.css`: průhledné plátno, náhradní ilustrace a ovládání animace.

Použita již instalovaná knihovna OGL. Renderer se načítá dynamicky až v prohlížeči; srovnání a jeho text se vykreslí nezávisle. Scéna se přizpůsobuje šířce banneru a nezasahuje do textu ani ovládání srovnání.

## Pohyb a prostředky

Letadlo obíhá po eliptické dráze přibližně jednou za 26 sekund, palmy se jemně pohupují a shader moře posouvá vlnky. Vykreslování je omezeno na 30 fps a poměr fyzických pixelů nejvýše 2.

Animaci lze pozastavit tlačítkem. Automaticky stojí mimo viditelnou oblast, na skryté kartě, při `prefers-reduced-motion` nebo aplikačním nastavení `data-motion="off"`. Při návratu pokračuje bez započítání doby pozastavení. Při odpojení komponenty se ruší animace, pozorovatelé, listenery, geometrie, programy a WebGL kontext. Pokud WebGL není dostupné nebo se kontext ztratí, zobrazí se ručně sestavená statická vektorová ilustrace.

## Ověření 11. 9. 2026

- ESLint a TypeScript zdrojových souborů prošly; při kontrole typů jsou vynechány dříve zjištěné zastaralé `.next/types` artefakty.
- V izolovaném náhledu skutečné komponenty v Chromu ověřeno vykreslení WebGL a změna snímků během animace, shodné snímky při ručním pozastavení, omezení pohybu a aplikačním vypnutí animací.
- Ověřeno zastavení animation-frame callbacků po odscrollování a obnovení při návratu, náhradní ilustrace při nedostupném WebGL i po ztrátě kontextu.
- Zkontrolovány šířky 320, 390, 640, 768, 900, 1024, 1280, 1440 a 1600 px bez vodorovného přetékání. Vizuálně ověřeny desktop a mobil. Původní generovaný obrázek se nenačítá.
- Náhled nahrazuje aplikační obal a autentizaci. Nejde o test celé přihlášené aplikace ani o nasazení. Headless kontrola používá SwiftShader; varování ovladače při pořizování snímků (`ReadPixels`) nejsou chyby scény.
