# Šifrování smluv, výpisů a poptávek

Tato změna rozšiřuje aplikační šifrování uloženého obsahu. Je připravená v kódu; tento dokument nepotvrzuje nasazení ani převod produkčních dat.

## Rozsah

- Poptávky online vizitek: `requester` a `travel` i související název, text a metadata zprávy v poště. Push obsahuje obecné oznámení bez jména klienta.
- Provizní výpisy: celé HTML, název souboru, odvozené řádky, čísla smluv a výsledek zpracování.
- Smlouvy: jméno, kontakty, adresa, číslo smlouvy, vyhledávací kopie, původní čísla, údaje vozidla a související vnořené kopie. Stejná ochrana platí pro odvozené klientské vazby, číselné reference, nároky na unikátní číslo, účetní opravy, externí aktualizace, tipařské výplaty a dočasné cashflow kandidáty.

Přesný seznam polí a cest je v `src/lib/server/businessDataEncryption.ts`. `businessDataFirestore.ts` obaluje serverové `adminDb`, zápisy včetně batchů a transakcí i čtení a podporované dotazy. Offline servisní skripty používají stejnou vrstvu. Migrační skript jako jediný z těchto zapisujících skriptů záměrně pracuje s fyzickou reprezentací. Nepoužívat nový neobalený `getFirestore()` pro práci s těmito kolekcemi.

Obsah používá existující obálkové AES-256-GCM šifrování, náhodný datový klíč a autentizovaný kontext konkrétní cesty i pole. Komprese před šifrováním a binární ciphertext omezují zvětšení HTML a cashflow bloků. Vyhledávání rovnosti používá HMAC-SHA-256 se samostatným klíčem. Index není dešifrovatelný, ale odhaluje shodu hodnot; nejedná se o anonymizaci. Čísla smluv již nejsou přímo v nových ID `contractNumberClaims`.

Oprávnění nadále kontrolují stávající serverové guardy. Čtení vlastnických metadat neotevírá soukromý obsah; autorizaci je nutné provést před přístupem k chráněným polím. Přímé zápisy klientským SDK do `entries` jsou v pravidlech zakázané i administrátorovi, který používá autorizované serverové API. Nejde o end-to-end šifrování. Server s klíči obsah přečte. Identita poradců, vlastníci, směrovací identifikátory, časy a výpočetní metadata zůstávají čitelné. Existující identifikátory klientských karet nejsou touto změnou přejmenovány; nelze tvrdit, že databáze neobsahuje žádné osobní údaje v metadatech.

## Konfigurace a nasazení

1. Zachovat stávající `MAILBOX_ENCRYPTION_KEY`, jeho ID a starší dešifrovací klíče. V secret manageru připravit **nový nezávislý náhodný klíč o 32 bajtech v Base64** pod `BUSINESS_DATA_INDEX_KEY` pro web i servisní skripty. Nikdy jej nevkládat do repozitáře, výstupů ani `NEXT_PUBLIC_*`. Produkční build validuje oba klíče a vypisuje pouze jejich SHA-256 otisky.
2. Nasadit nové Firestore indexy z `firestore.indexes.json` a počkat na jejich dostupnost. Nasadit kompatibilní web, potřebné Functions a pravidla. Staré instance a servisní skripty nesmí dál zapisovat původní formát. Zatím ponechat `BUSINESS_DATA_ENCRYPTION_REQUIRED=false`. Stávající `PRIVATE_DATA_ENCRYPTION_REQUIRED` se nevypíná.
3. Se stejnými klíči jako nasazený web provést náhled:

   ```sh
   node scripts/migrate-private-data-encryption.mjs --project=FIREBASE_PROJECT_ID
   ```

4. Po kontrole náhledu a schválení produkčního převodu spustit:

   ```sh
   node scripts/migrate-private-data-encryption.mjs --project=FIREBASE_PROJECT_ID --apply --compatible-code-deployed --key-fingerprint=PRODUCTION_ENCRYPTION_KEY_SHA256 --index-key-fingerprint=PRODUCTION_INDEX_KEY_SHA256
   ```

   Použít otisky z ověřeného produkčního buildu. Skript kontroluje přesný projekt, konfiguraci a otisky. Záznamy načítá znovu v transakci, ověřuje šifrování a nahrazuje celé dokumenty, aby nezůstaly čitelné klíče v mapách. Staré ID nároku na číslo smlouvy nahradí novým ID transakčně; při kolizi jiného vlastníka smlouvy odmítne převod. Nevytváří čitelné zálohy a vypisuje jen počty.
5. Zopakovat náhled do `documentsPending: 0`, `filesPending: 0`, `failed: 0`. Ověřit hledání smluv, duplicity, převody, historii, PDF, klientský adresář, výpisy, cashflow a poptávky se syntetickými účty v nasazené aplikaci. Až potom nastavit `BUSINESS_DATA_ENCRYPTION_REQUIRED=true` a znovu nasadit. Dotazy potom používají jen nový index a čtení odmítá původní nešifrovaný obsah.

Chybějící klíč nevede k zápisu plaintextu. Zapnutí nového povinného režimu před migrací znepřístupní staré záznamy. Po migraci není bezpečný návrat ke kódu bez této vrstvy. `BUSINESS_DATA_INDEX_KEY` musí zůstat stabilní i při rotaci šifrovacího klíče; jeho výměna vyžaduje samostatný plán obnovy všech indexů a ID nároků. Současný skript takovou rotaci ID již převedených nároků neprovádí. Klíče zálohovat odděleně od databáze.

Historické zálohy, exporty, starší generace souborů a již doručené push zprávy tato migrace neodstraní. Jejich retenci je nutné ověřit u poskytovatele; produkční data ani zálohy se v rámci lokální opravy nemažou.

Pro toto rozšíření databázových polí lze náhled i převod omezit přepínačem `--documents-only`; výstup pak výslovně uvádí `filesSkipped: true` a nepotvrzuje kontrolu Storage. `--document-concurrency=8` zrychluje převod omezeným souběhem samostatných transakcí (výchozí hodnota 1, povolené 1/2/4/8/16). Každá transakce stále znovu načítá aktuální data a zachovává stejné kontroly konfliktů.

## Vývoj a ověření

Používat `adminDb`; nepřistupovat k interním SDK handleům. Chráněné pole zapisovat celé, nepoužívat vnořené field-path aktualizace ani `arrayUnion`/inkrementy. `merge: true` vrstva převádí na masku, která chráněné mapy nahrazuje atomicky. Interní `_businessLookup_*` nesmí být vstupem z API ani výstupem klientovi. Nepodporované SDK cesty obcházející šifrování explicitně selžou. Nové chráněné pole musí mít posouzené čtení, zápisy, dotazy, kopie, migraci a indexy.

Ověření: `npx tsc --noEmit --incremental false`, `npm run lint`, `npm test`, `npm run test:rules` (lokální Java a demo Auth/Firestore emulátory). `tests/firestore/businessDataEncryption.test.ts` ověřuje fyzické ukládání, čtení API, cizí přístup, transakce, převody, historii, staré i nové dotazy a migraci. Jednotkové testy ověřují manipulaci ciphertextu, kontext, klíče, rotaci a bezpečný migrační režim.
