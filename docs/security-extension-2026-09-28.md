# Rozšíření ochrany soukromých dat — 28. 9. 2026

Navazuje na [první rozšíření šifrování](private-data-encryption-2026-09-28.md). Stav webu a samostatně nasazené Cloud Function je nutné rozlišovat.

## Změny webu a migrace

- Poznámky ke smlouvám šifrují text, jméno klienta a číslo smlouvy. Šifruje se také starší poznámka přímo v základním smluvním záznamu. Detail a seznam poznámek dešifrují až po autorizaci. Převod smlouvy zachovává původní umístění poznámek a autentizovaný kontext; oprávnění se dál odvozují od aktuálního správce a týmových rolí.
- Historie smluv šifruje název události a všechny původní/nové hodnoty. Zahrnuje změny přes společný zapisovač, například importy, výplaty, přílohy a převody. Zachovává transakční zápis události se změnou smlouvy, stránkování a historii po převodu.
- Samostatná evidence výročí šifruje poznámku, termín schůzky a číslo smlouvy; její historické události šifrují poznámky a schůzky. Stabilní `privateReviewPath` se přenáší s evidencí při změně správce. Dotazovací a stavová pole zůstávají dostupná pro řízení agendy.
- Uživatelské požadavky šifrují text, odpověď administrátora a požadované osobní údaje pro nový účet. Úprava cizího požadavku se odmítá před dešifrováním. Screenshoty už chrání předchozí změna.
- Sdílené plány/exporty šifrují obsah i metadata obou kopií v interní poště a samostatný uložený náhled exportu. Náhled ověřuje odesílatele/příjemce před dešifrováním. Zahrnuta jsou také starší HTML pole v migraci.
- Připomínky smluv, odložené pošty a nevyřízených odpovědí používají obecné push texty. Text zprávy, jméno klienta ani číslo smlouvy se nevkládají do oznámení. Poškozený šifrovaný záznam zabrání vlastnímu zpracování a nezastaví ostatní připomínky.
- Společná politika v `src/lib/server/privateRecords.ts` váže pole na konkrétní záznam. Používá stávající AES-256-GCM obálky a serverový klíč; nejde o end-to-end šifrování.
- Migrační skript rozšiřuje původní bezpečný převod o smluvní poznámky, obě historie, inline poznámky, výročí, požadavky a sdílené náhledy. Zachovává režim pouze pro čtení, ověření cílového projektu, otisku nasazeného klíče, transakční nové načtení a úplné nahrazení map. Zápisy smluv nyní procházejí i stávající ochranou konzistence cashflow.

Základní vyhledávaná pole smluv a provozní indexy dál spoléhají na oprávnění a šifrování poskytovatele. Historické zálohy, exporty a staré generace souborů nejsou automaticky přepisovány ani mazány. Operátorský výpis úložišť potvrzuje, že aplikační bucket má měkké smazání po dobu 30 dnů a nemá zapnuté běžné verzování. Přepis při migraci tedy může zachovat předchozí kopii v této chráněné retenční vrstvě; nejde o veřejně dostupný aktuální soubor. Zálohy a retenční nastavení se tímto během nemění. Veřejné vizitky zůstávají veřejné. Žádná z těchto změn není tvrzením o absolutní bezpečnosti celého webu.

Další kontrola odstranila jméno klienta a číslo smlouvy také z automatických cloudových připomínek výročí a nezaplacených smluv. Detail zůstává dostupný po přihlášení. Kontrola produkčních závislostí našla v původním cloudovém lockfile 12 hlášení (3 vysoká); opraveny byly `@grpc/grpc-js`, `jws`, `form-data`, `@tootallnate/once` a tranzitivní `uuid`. Nebyla vynucena nová hlavní verze Firebase Admin SDK. `npm audit --omit=dev` po instalaci hlásí nulu pro web i Cloud Functions.

Opravený archiv byl nasazen do všech 12 funkcí pouze změnou `buildConfig.source`. Znovu stažené zdroje mají SHA-256 `745fb3e80ed07eb7bd51cfec62f1664ab4d690b929f43d5c11e314183b17a6e3`; všechny funkce jsou `ACTIVE`. Zachovány role, triggery, konfigurace secretů a invokační politiky. Veřejně volatelné API handlery odmítají chybějící autentizaci HTTP 401; čtyři funkce na pozadí odmítají anonymní invokaci HTTP 403.

## Ověření produkce a nasazení

**Hotovo: produkční web, Cloud Functions, pravidla i převod aktuálních soukromých dat jsou nasazené a ověřené.** Hlavní doména `bohemka.app` běží na verzi `dpl_3fdNmsNXRDyoZwKg4Ty33DyJ6PSw`; sestavení potvrzuje `PRIVATE_DATA_ENCRYPTION_REQUIRED=true`. Serverový otisk klíče odpovídá migračnímu klíči. Povinné šifrování bylo zapnuto až po nulovém výsledku závěrečných kontrol.

- Databáze: převedeno 992 starších záznamů; nezávisle ověřeno 5336 záznamů, zbývá 0 převodů a 0 chyb.
- Úložiště: nezávisle načteno a kryptograficky ověřeno 1568 aktuálních souborů, žádný nezašifrovaný nebo poškozený soubor. Ověřeny všechny tři soukromé prefixy; screenshoty a interní dokumenty byly v době běhu prázdné.
- Firestore ruleset `9bad8707-99bc-4e30-a488-9f25f67cce99`, SHA-256 `95259572981eaaadc23963cfe103a9605d45246c877a4fae55eef3e34f690cc6`, načten po nasazení a porovnán. Výslovně blokuje přímé čtení klíčů konceptů, včetně jejich autora.
- Všech 12 cloudových funkcí používá ověřený opravený archiv; invokační politiky, runtime/build identity, konfigurace secretů a triggery byly zachovány.
- Dva nepoužívané Firebase servisní klíče z ledna 2026 byly deaktivovány; aktivní zůstává pouze aktuální zářijový klíč. Před změnou byly veřejné otisky porovnány s produkčním, náhledovým i vývojovým prostředím Vercelu a nebyly nalezeny přepisující konfigurace větví. Uživatel potvrdil, že klíče používá pouze tento web. Konečný stav IAM byl znovu načten a následný produkční test proběhl s nově získanými přihlašovacími tokeny.
- Dva skutečné dočasné účty s heslem a TOTP ověřily stabilní a odlišné klíče konceptů, odmítnutí podvrženého vlastníka, šifrované karty, poznámky, historii i PDF. Cizí obsah byl nepřístupný. Stažené PDF se shodovalo bajt po bajtu. Stejný test prošel na konečné hlavní doméně s povinným šifrováním.
- Dočasný serverový převod odmítal anonymní i jiný přihlášený TOTP účet a nikdy nevracel obsah souborů. Po dokončení byl odstraněn jeho Vercel deployment, oba testovací účty i soubory s jejich přihlašovacími údaji. Další účty a obsah z aplikačních testů byly rovněž uklizeny. Nebyly posílány e-maily, SMS ani testovací notifikace skutečným uživatelům.

Nasazovací zdroj vychází z tehdejší produkce `184912551772b6b9972e0427351441970b29558c` a přidává změny PDF a zabezpečení. Rozpracované optimalizace týmu a síně slávy nejsou součástí tohoto nasazení. Návrat na starý web po převodu není bezpečný rollback; další nasazení musí obsahovat nové čtečky a zapisovače šifrovaných dat.

Test na Vercelu zachytil prázdný POST stream u požadavku na klíč konceptů. Endpoint přijímá prázdný stream a nadále odmítá jakýkoli zaslaný obsah nebo určení jiného vlastníka. Oprava prošla regresními i nasazenými testy.

První produkční pokusy se zcela novými testovacími účty dostaly u poznámek odpověď 403 „Uživatel nemá interní profil v systému.“ Důvodem byla stávající pětiminutová cache uživatelského stromu na již zahřáté instanci. Do testu byla doplněna kontrola dostupnosti nového profilu s omezeným opakováním pouze při této konkrétní odpovědi. Závěrečný běh už touto kontrolou prošel bez dalšího čekání a ověřil skutečný úspěšný zápis i čtení. Oprávnění ani cache nebyly kvůli testu oslabeny; i neúspěšné pokusy uklidily své syntetické účty a data.

Deaktivace klíčů je vratná; identifikátory a předchozí stav jsou v soukromém lokálním dokladu. Deaktivace již vydané krátkodobé tokeny nezneplatní, doběhnou svou platnost. Postup odpovídá [dokumentaci Google IAM](https://docs.cloud.google.com/iam/docs/keys-disable-enable). Ověření konfigurace Vercelu použilo [oficiální API proměnných prostředí](https://vercel.com/docs/rest-api/projects/retrieve-the-decrypted-value-of-an-environment-variable-of-a-project-by-id); soukromé hodnoty se nevypisovaly ani neukládaly do dokladu. Nastavení MFA osobních účtů vlastníků Google Cloud a Vercelu tímto během nebylo nezávisle ověřeno.

Místní převod byl kvůli pomalému uploadu a dočasnému výpadku spojení bezpečně dokončen serverovým během. Generační podmínky chránily novější souběžné změny. Konečná úplná kontrola má nulové chyby; částečné průběžné výstupy nejsou potvrzením dokončení. Sanitizovaný souhrn je v [ověřovacím záznamu](security-extension-2026-09-28-verification.json). Soukromé zálohy konfigurací a podrobné nasazovací doklady jsou pouze v ignorované `.tmp/security-extension-20260928/` s omezenými souborovými oprávněními.

## Validace

Kryptografické testy ověřují záměnu autorů/záznamů/polí, chybný klíč, poškozený obsah, odmítání čitelných záznamů po zapnutí přísného režimu a opakovatelnou migraci. API testy prověřují skutečné zapisovače i čtečky poznámek, historii po převodu, obě kopie sdílení, náhled exportu a role u požadavků. Notifikační testy kontrolují celý odesílaný payload, včetně starších čitelných zpráv.

- Celá pracovní sada Vitest: 371 souborů, 5 284 testů úspěšně před závěrečnou opravou prázdného POST; po opravě prošlo 24 cílených testů včetně čtyř nových regresních případů.
- Konečný izolovaný nasazovací zdroj: 369 souborů, 5 251 testů úspěšně, včetně opravy prázdného POST a souběžného převodu souborů.
- Skutečný emulátor Auth + Firestore: 15 souborů, 328 testů úspěšně, jeden původní benchmark přeskočen.
- Cloud Functions: 62 testů úspěšně po instalaci opravených závislostí; zahrnují skutečné handlery obou denních připomínek a kontrolu celého push payloadu.
- TypeScript, ESLint změněných částí, místní produkční build Webpack a skutečný Vercel build Turbopack prošly.
- Kontrola proxy a veřejných JS balíků prošla; serverové klíče ani kolekce klíčů se nedostaly do klientských balíků.
- Převod a evidence cashflow: 29 cílených testů včetně omezení souběžnosti na čtyři/osm souborů a pokračování po jednotlivém selhání. Průběžné výstupy obsahují pouze počty. Dalších 52 cílených testů ověřilo kryptografii, čtečky souborů a pravidla převodu před doplněním posledního případu souběžnosti.
