# Tvorba PDF – 28. 9. 2026

Editor na `/pomucky/tvorba` podporuje více samostatných stran A4. Strany lze přidávat, duplikovat, přesouvat, odebírat a poslední odebranou stranu vrátit. Každá uchovává vlastní text, formátování a obrázky. Hlavička, kontaktní vizitka a číslování se opakují na všech stranách.

Export má vlastní název souboru, tři úrovně kvality, průběh a údaj o skutečné velikosti výsledného PDF. Poslední výsledek lze otevřít nebo stáhnout znovu. Změny dokumentu vyžadují nový export. Jednorázové heslo se po úspěšném exportu smaže.

Obrázky z výběru souborů i schránky se zpracovávají v prohlížeči: delší strana nejvýše 2 000 px, JPEG pro fotografie v JPEG, WebP s průhledností pro ostatní podporované formáty. Malé soubory se nepřekódují na větší. Každá stránka se exportuje samostatně pomocí html2canvas-pro a JPEG se skutečně nastavenou kvalitou, poté se uvolní canvas. Export používá rozměry A4 nezávisle na přiblížení náhledu.

Dlouhý text může automaticky pokračovat na další straně; automatické stránkování lze vypnout. Editor upozorní na nevyřešený přesah; export kontroluje všechny strany a při přesahu skončí s konkrétní chybou místo oříznutí. Kontroluje také načtení obrázků a překrytí obsahu příliš vysokou vizitkou. Text v PDF je zatím rastrový a není vyhledávatelný; QR se vykresluje samostatně vektorově. Koncept dokumentu se ukládá šifrovaně do IndexedDB v aktuálním prohlížeči; kontaktní vizitka využívá dosavadní ukládání profilu.

## Moderní vzhled a QR vizitka

Dokument má kompaktní hlavičku s modrým akcentem, výraznější typografii a tmavou kontaktní kartu. QR je ve výchozím stavu zapnutý a lze jej skrýt v nastavení vizitky. Odkazuje na aktivní online vizitku z profilu. Bez aktivní online vizitky obsahuje vCard 3.0 s aktuálními kontaktními údaji; prázdný kontakt se negeneruje. Dlouhé řádky se skládají po 75 bajtech bez rozdělení znaků UTF-8.

Náhled vykresluje QR jako SVG. Export používá vektorové obdélníky se čtyřmodulovým bílým okrajem, které JPEG komprese neovlivňuje. Online QR má navíc klikací odkaz. Příprava exportu vytváří QR přímo z aktuálních údajů a nečeká na asynchronní obrázek náhledu.

Ověřeno 16 automatickými testy, lintem, TypeScriptem a skutečným exportem v Chromu. PDF.js vykreslil dvoustránkovou ukázku z režimu „Malý soubor“; BarcodeDetector přečetl na obou stranách úplnou vCard včetně českých znaků. Velikost ukázky je 147 979 B (145 kB). Ukázka s fiktivním kontaktem: `.tmp/tvorba-check/modern-qr.pdf`, náhled: `.tmp/tvorba-check/modern-qr-page-1.png`.

## Ověření

- `npx vitest run src/app/pomucky/tvorba`: 10 testů, včetně zachování obsahu stránek, pořadí, vrácení smazání, exportu aktuálních úprav, chyb a opakování exportu.
- `npx eslint src/app/pomucky/tvorba` a `npx tsc --noEmit --incremental false`.
- Skutečný Chrome, izolovaný místní editor s nahrazeným přihlášením a aplikačním obalem, skutečnými styly, kompresí a PDF knihovnami. Desktop 1440 px a mobil 390 px; bez vodorovného přetečení aplikace.
- Syntetický PNG 3400 × 2500 px, 26 477 883 B (25,3 MB), po vložení 2000 × 1471 px a přibližně 1,7 MB. Tři stránky s obrázkem širokým 300 CSS px: vyvážený export 289 916 B (283 kB), malý soubor 144 311 B (141 kB). Velikost jiných dokumentů závisí na obsahu, počtu stran a kvalitě.
- PDF.js potvrdil 3 stránky A4 v běžném i mobilním exportu, český název a autora, nutnost hesla a otevření správným heslem. Zkontrolován také vykreslený obsah skutečného PDF a shoda opakovaného stažení.

Pracovní podklady z prohlížeče jsou v ignorovaném adresáři `.tmp/tvorba-check/`.

## Přepracovaný levý panel

Nástroje dokumentu mají samostatné sekce pro typografii, obrázky, AI a nastavení. Jednotná tlačítka formátování používají ikony a stav `aria-pressed`, písmo a velikost mají pojmenované nativní výběry. Přidaný „Odstavec“ umožňuje vrátit nadpis na běžný text. Obrázky lze přetáhnout do panelu; název vybraného obrázku a jeho smazání se zobrazují podle výběru. AI funguje jako rozbalovací panel s pojmenovanými poli a volitelnými podrobnostmi. Nastavení ukazuje kvalitu a stav hesla. Stahování je pouze v horní liště.

Ověřeno 16 stávajícími testy, lintem a TypeScriptem. Chrome potvrdil zachování výběru textu při změně formátování, písma, velikosti a barvy; nadpis/odstavec, zarovnání, vložení obrázku přetažením, smazání, rozbalení AI, otevření nastavení a stažení PDF. Mobilní šířka 390 px nepřetéká ani s otevřenou paletou. Náhledy: `.tmp/tvorba-check/sidebar-desktop.png`, `sidebar-expanded.png`, `sidebar-mobile.png`.


## Koncepty a automatické stránkování

Jeden rozepsaný koncept na skutečné UID přihlášeného autora se automaticky ukládá po 500 ms nečinnosti, při skrytí stránky a při opuštění editoru. Tlačítko „Uložit koncept“ vyvolá uložení okamžitě. IndexedDB uchovává všechny stránky, optimalizované obrázky, aktivní stranu, název, hlavičku, kvalitu PDF a volby QR/stránkování. Heslo PDF se neukládá. Uložení je místní, bez synchronizace mezi zařízeními. Rozpracovaný dokument se načte před povolením úprav; přepnutí uživatele vytvoří oddělenou instanci editoru. Selhání úložiště se zobrazí a lze opakovat uložení bez ztráty obsahu v editoru.

„Nový dokument“ nabídne nahrazení aktuálního konceptu. Předchozí dokument lze vrátit do obnovení/opuštění stránky. Není to knihovna více pojmenovaných konceptů.

Automatické stránkování měří skutečnou velikost textu v A4 nezávisle na přiblížení. Zachovává HTML formátování, české znaky, číslování seznamů i kurzor. Přetečení pokračuje v navazujících automaticky vytvořených stranách; ručně vložené strany tvoří samostatné části a obrázky zůstávají na své původní straně. Při zkrácení textu se obsah z následujících stran zatím nestahuje zpět. Nevejdoucí se prvek nezpůsobí oříznutí: text zůstane zachovaný a editor nabídne opravu. Automatické dělení lze vypnout a vyvolat ručně.

Ověření této změny: 23 testů editoru/exportu/QR/stránkování, ESLint, TypeScript a Chrome. V prohlížeči ověřeno uložení a obnovení pětistránkového dokumentu s obrázkem, zachování kurzoru, úplnost textu na všech stranách, dlouhý odstavec (10 stran), číslovaný seznam, ruční zalomení a skutečný export 5 stran (1 519 378 B). Test přepnutí uživatelů ověřuje oddělení konceptů; test selhání úložiště ověřuje zachování obsahu a opakování zápisu. Náhledy: `.tmp/tvorba-check/improved-editor.png`, `improved-mobile.png`; export: `autopaginated.pdf`.


## Zabezpečení konceptů – pouze autor

Původní oddělení podle e-mailových klíčů v IndexedDB nebylo bezpečnostním opatřením. Nové úložiště `bohemika-encrypted-document-drafts` obsahuje pouze AES-256-GCM ciphertext, náhodný 96bitový nonce a UID autora. Šifruje se celý obsah včetně názvu, všech stran a obrázků; UID je navíc součástí autentizovaných doplňkových dat. Každý zápis používá nový nonce. Implementace používá [Web Crypto AES-GCM](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams).

Klíč vydá pouze `POST /api/document-drafts/key` po ověření přihlášení, MFA a blokací přes existující serverový guard. Vlastníka určuje skutečné UID tokenu. Endpoint odmítá jakýkoliv parametr vlastníka, tělo požadavku a administrátorské zastoupení; role správce ani nadřízeného nepřidává výjimku. Odpovědi mají `private, no-store`, klíč zůstává pouze v paměti relace a importuje se jako neexportovatelný CryptoKey. Serverové klíče v `documentDraftKeys` nejsou přístupné přes klientský Firestore SDK ani administrátorům aplikace. Do serverových logů se neposílají klíče ani obsah.

Editor se nepřipojí bez přihlášení ani v režimu zastoupení. Při odhlášení/přepnutí účtu se celý dokument odpojí a zavře se přístup ke klíči. Asynchronní odpovědi i čtení/zápis znovu kontrolují aktuálního autora. Selhání odemknutí nebo dešifrování drží editor zamčený; chybný či nedostupný koncept se nepřepíše prázdnou verzí. K otevření je potřeba připojení k serveru; obsah samotný se nadále nesynchronizuje mezi zařízeními. Nejde o ochranu před provozovatelem serveru s přístupem k jeho databázi nebo před napadením již odemčené relace autora.

Převod starých dat zachovává práci autora: až po serverovém ověření se jeho stará lokální kopie zašifruje a po dokončeném zápisu odstraní plaintext. Existující šifrovaná verze má přednost. Staré koncepty jiných nebo anonymních účtů se nečtou ani nemažou automaticky: pokud v prohlížeči zbývají, editor zůstane zamčený. Ostatní autoři mohou převést vlastní kopie přihlášením; anonymní nebo opuštěné kopie vyžadují rozhodnutí o odstranění. Staré kopie nejsou zpětně zabezpečené, dokud převod/odstranění neproběhne.

Ověření: 1 339 testů editoru, šifrování, autorizace klíčů a matice nepřihlášených/neplatných/odvolaných účtů prošlo; ESLint a TypeScript bez chyb. Chrome ověřil skutečný šifrovaný zápis, obnovení po načtení, oddělení dvou autorů, odhlášení a zablokování zastoupení. Ověřen je také skutečný převod původní nešifrované kopie třetího autora, zachování novější šifrované verze a blokace do vyřešení zbývajících starých kopií. Pro přímé čtení/zápis klíčů všemi klientskými rolemi je přidaný test `tests/firestore/documentDraftKeys.test.ts`. Emulátorový test se v tomto prostředí nespustil, protože chybí Java runtime; dosavadní catch-all pravidlo již tyto cesty odmítalo, nová explicitní sekce zákaz dokumentuje. Nic nebylo nasazeno.
