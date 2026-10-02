# Ochrana soukromých dat – 28. 9. 2026

Aktuální migrační skript má rozšířený rozsah a vyžaduje také samostatný indexový klíč a `--index-key-fingerprint`. Pro nové nasazení použijte [aktuální postup](business-data-encryption.md); údaje níže popisují dřívější nasazení.

Následné rozšíření o poznámky a historii smluv, výročí, uživatelské požadavky a sdílené plány včetně aktuálního stavu nasazení je v [navazujícím záznamu](security-extension-2026-09-28.md). Níže je původní rozsah a společný postup migrace.

## Rozsah změn

- Celá soukromá klientská karta je obálkově šifrovaná včetně rodného čísla, dokladů a kontaktů. Stejné ukládání používají ruční úpravy i importy e-mailu a IČO z PDF. Importní skript umí číst šifrované karty.
- Text soukromé klientské poznámky a jméno klienta ve frontě připomínek jsou šifrované. Připomínky v poště a push oznámeních nově obsahují jen obecnou výzvu a odkaz na autorizovanou poznámku.
- Klientské tipy nemají výjimku z šifrování pošty. Obě kopie zprávy jsou šifrované; tipařský záznam navíc šifruje předmět, text a vyplněná pole. Seznamy a detail dešifrují až po autorizaci. Push neposílá předmět s klientskými údaji. Úprava staré zprávy nevytváří čitelnou kopii.
- PDF smluv, screenshoty požadavků a nahrané interní dokumenty se ukládají v autentizovaném binárním obalu. Soubor je navázán na bucket i cestu. PDF se před předáním do odpovědi celé ověří; kontroluje se také původní SHA-256. U smluv je rozsah omezen limitem nahrávání 12 MB. Stahování proto krátce drží celý soubor v paměti serveru.
- Klíče lokálních PDF konceptů se v databázi ukládají zašifrované serverovým hlavním klíčem. Starý klíč se při autorizovaném načtení zabalí v transakci bez změny hodnoty, takže existující koncepty zůstanou dostupné.
- Přehledy smluv, hledané výrazy, údaje patičky a rozepsaná kariéra nemají čitelnou kopii ve Web Storage. Smlouvy a rozepsané formuláře používají paměť otevřené stránky; přehled domovské stránky používá svou stávající krátkodobou paměťovou cache. Změna účtu a odhlášení mažou sdílenou paměť i starší cache. Obnovení stránky zahodí dočasná rozepsaná jednání a kariéru; uložené profily se znovu načtou ze serveru.
- Projekce výkonu dál ukládá plány lokálně, ale s AES-GCM, klíčem dostupným jen ověřenému autorovi a vazbou na UID a typ plánu. Ukládání je serializované. Chyba odemčení neotevře editor a nepřepíše existující plán. Režim zastoupení nelze použít k odemčení cizího plánu.

- Společná obálka odpovědí autorizovaných API vynucuje `private, no-store` a `Vary: Authorization, Cookie`, aby se dešifrovaný obsah neukládal do HTTP cache prohlížeče nebo CDN.

## Klíče a hranice ochrany

Používá se stávající otestovaná obálková kryptografie pošty (AES-256-GCM, náhodný datový klíč a IV pro každé uložení) se samostatným autentizovaným kontextem `private:` / `private-file:`. Konfigurace:

- `MAILBOX_ENCRYPTION_KEY` – 32 náhodných bajtů v Base64, pouze na serveru.
- `MAILBOX_ENCRYPTION_KEY_ID` a `MAILBOX_ENCRYPTION_PREVIOUS_KEYS` – identifikace a zachování přístupu po rotaci.

Databáze neobsahuje hlavní klíč. Nepoužívá se náhradní veřejný ani odvozený klíč; chybějící konfigurace zabrání zápisu. Produkční build již validuje klíč přes `scripts/check-security-config.mjs`. Staré klíče neodstraňovat, dokud existují data, která je potřebují. Zajistit jejich zálohu v úložišti tajných údajů odděleném od databáze.

Jde o další ochranu uloženého obsahu nad šifrováním poskytovatele, nikoli o end-to-end šifrování. Autorizovaný server obsah dešifruje. Identifikátory, vlastníci, směrovací údaje, časy, názvy souborů a pole potřebná pro oprávnění a dotazy zůstávají běžnými databázovými metadaty. Stávající role a týmový přístup ke smlouvám se nemění; soukromé karty a koncepty zachovávají omezení na autora. Veřejné vizitky a avatary se záměrně nemění.

Tato změna není tvrzením o absolutní bezpečnosti celého webu. Nemění hromadně základní smluvní záznamy, jejich vyhledávací indexy, historii smluv ani ostatní firemní agendy. Ty nadále spoléhají na šifrování poskytovatele a existující autorizaci.

## Převod dosavadních dat a nasazení

Web, cloudové funkce a pravidla jsou nasazené. Převod aktuálních dat je dokončen: ověřeno 5336 záznamů a 1568 souborů, zbývá 0 převodů a 0 chyb. Povinné šifrování je zapnuté. Podrobnosti a hranice ověření eviduje [navazující záznam](security-extension-2026-09-28.md).

1. Ověřit, že cílové prostředí má správný klíč a jeho bezpečnou zálohu. Z produkčního výstupu `check-security-config` získat **otisk klíče**, ne samotný klíč.
2. Nasadit kompatibilní čtení i všechny nové zapisující cesty. Teprve potom převádět starší data. Starší verze aplikace nemusí šifrované mapy nebo soubory přečíst; návrat na starý kód po migraci není bezpečný rollback.
3. Spustit náhled se správnými serverovými přihlašovacími údaji a stejným klíčem jako na webu:

   ```sh
   node scripts/migrate-private-data-encryption.mjs --project=FIREBASE_PROJECT_ID
   ```

4. Po úspěšném náhledu spustit převod s ověřeným otiskem nasazeného klíče:

   ```sh
   node scripts/migrate-private-data-encryption.mjs --project=FIREBASE_PROJECT_ID --apply --compatible-code-deployed --key-fingerprint=PRODUCTION_KEY_SHA256
   ```

5. Zopakovat náhled. Požadovaný výsledek: `documentsPending: 0`, `filesPending: 0`, `failed: 0`. Ověřit se dvěma skutečnými testovacími účty čtení karet, tipů, PDF a konceptů v nasazené aplikaci.
6. Po dokončeném převodu nastavit serverovou proměnnou `PRIVATE_DATA_ENCRYPTION_REQUIRED=true` a znovu nasadit. Tím se vypne přechodné čtení čitelných soukromých záznamů a souborů; chybějící či odstraněný šifrovací obal pak přístup zablokuje. Zapnutí před dokončením převodu by znepřístupnilo nepřevedená data.

Skript vypisuje pouze počty. Záznamy znovu načítá v transakci, šifrování ověří před zápisem a nahrazuje celé mapy, aby nezůstaly původní čitelné položky. U souborů používá podmínku na generaci objektu, odstraňuje případné staré download tokeny a ověřuje i znovu stažený výsledek. Konflikt či selhání zvýší `failed` a vrátí nenulový exit kód. Již úspěšně převedené položky se při opakování znovu nepřepisují. Skript nevytváří čitelné exporty ani zálohy.

Převod se týká aktuálních záznamů a aktuálních verzí objektů. Historické databázové zálohy, exporty, měkké smazání a starší generace objektů musí být zkontrolovány podle jejich retenčního nastavení; tímto skriptem se nemažou.

Starší plány a PDF koncepty na zařízeních se převádějí až po ověření příslušného autora. Jeho původní kopie se odstraní teprve po úspěšném šifrovaném zápisu. Pokud zbývají koncepty jiných či anonymních účtů, editor se zablokuje a vyžádá jejich převod; cizí obsah nepřebírá ani potichu nemaže. Obsah cizích starších kopií nelze na dálku převést bez přihlášení jejich autorů. Pro dokončení na sdílených počítačích je třeba dokončit tento místní převod a zavřít staré verze aplikace.

## Ověření

- Testy kryptografie: jiný autor, jiný záznam či pole, upravený ciphertext, záměna souboru, chybějící klíč.
- Testy autorizace a API: vlastní karty, importy, poznámky, připomínky, obě kopie tipu, seznamy a detail; cizí účet nemá přístup.
- Testy převodu: zachování původní hodnoty, idempotence, aktualizace během transakce, generační konflikt souboru, režim bez zápisu, vynucení cílového projektu a kompatibilního nasazení.
- Testy prohlížečového úložiště: čitelné cache se nezapisují, starší kopie se odstraní, šifrované plány přežijí obnovení stránky, změna identity a poškození dat zabrání otevření.
- Celá sada Vitest: **366 souborů, 5 262 testů úspěšně**. TypeScript prošel bez chyb. ESLint změněných částí nemá chyby; v AppLayout zůstávají dvě původní upozornění na plné přesměrování při odhlášení.
- Produkční sestavení `next build --webpack` prošlo. Standardní Turbopack zde selhal na omezení prostředí při otevření pomocného portu (`EPERM`), proto byl použit podporovaný Webpack. Při ověření byly tři globální tiskové selektory projekce navázány na lokální třídu `.report`, aby platily v obou bundlerech.
- Kontrola výsledného autentizačního proxy prošla. Ve veřejných klientských JS balících nebyly nalezeny odkazy na serverové klíče ani jejich databázovou kolekci.
- Chrome se syntetickými účty a skutečným Web Crypto: šifrovaný zápis, obnovení plánu po reloadu, oddělení autorů A/B, vyčištění editoru při odhlášení a odmítnutí poškozeného ciphertextu; žádné chyby prohlížeče. Screenshot: `.tmp/private-encryption-check/planner.png` (lokální ignorovaný testovací artefakt).
- Následné ověření doplnilo dočasný Java runtime a skutečné testy Auth/Firestore: 328 testů prošlo. Pravidla jsou nasazená; podrobnosti a aktuální počty jsou v navazujícím záznamu.
