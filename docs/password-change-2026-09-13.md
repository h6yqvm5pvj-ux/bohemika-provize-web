# Změna hesla v nastavení — 13. 9. 2026

## Chování

Formulář nejdříve ověří původní heslo. Účty s TOTP musí dokončit Firebase MFA výzvu; u účtů bez MFA doručí Resend jednorázový šestimístný kód na adresu získanou serverem z účtu. Nové heslo se předá serveru až při závěrečném potvrzení. Po úspěchu formulář vymaže hesla a kódy z vlastního stavu a nabídne nové přihlášení.

Po potvrzené změně server vytvoří upozornění „Vaše heslo v BohemkaApp bylo změněno“. Zpráva neobsahuje heslo ani údaje klientů. Doručení se zkouší hned, při neúspěchu ještě po odpovědi požadavku. Neodeslaná oznámení zůstávají v privátní frontě a zkouší se znovu denním cronem v 08:00 UTC; jde o omezení existujícího tarifu Vercel Hobby. Přijatá oznámení se z fronty odstraňují. Opakované pokusy používají stejný Resend idempotency key. Stav formuláře odlišuje úspěšnou změnu od nepotvrzeného doručení zprávy.

## Ověření na serveru

- Platný Firebase token včetně kontroly odvolání; UID, adresa i MFA faktory se kontrolují proti aktuálnímu záznamu Firebase Auth. Klient neposílá adresu příjemce ani volbu způsobu ověření.
- Server vytvoří výzvu před novým ověřením heslem. `auth_time` musí být novější než tato výzva; znovu použitý nedávný token nestačí. Pro TOTP se kontroluje i skutečný identifikátor zapsaného faktoru v podepsaném tokenu.
- Kód se ukládá jen jako HMAC se serverovým tajemstvím, navázaný na účel, výzvu a UID. Platnost je nejvýše 10 minut, maximálně 5 chybných pokusů. Zahájení nové změny zneplatní předchozí výzvu. Po úspěchu je výzva spotřebována transakcí před změnou u Firebase.
- Omezení pokusů podle účtu a IP selhává do uzavřeného stavu při nedostupnosti úložiště. Omezená velikost JSON, kontrola původu, zákaz klientem dodané adresy, odpovědi `no-store`.
- Původní ani nové heslo, prostý kód a SDK chybové odpovědi se neukládají do záznamů ani nelogují.
- Nejistý výsledek mutace u Firebase vede na pokyn ověřit přihlášení, nikoliv na automatické opakování změny nebo nepravdivé potvrzení jejího neúspěchu.

## Hranice ochrany

Tato změna vynucuje potvrzení v novém postupu nastavení a v jeho serverovém API. **Nevypíná přímé Firebase/Identity Platform `accounts:update` ani ostatní nativní cesty změny/resetu hesla.** Firebase nadále umožňuje oprávněnému uživateli změnit heslo přímo podle vlastních pravidel. E-mailové potvrzení této aplikace proto není plošný zákaz takové operace v celém Firebase projektu. Rozhraní pro blokující funkce nevystavuje obecný hook před změnou hesla. Plošné vynucení by vyžadovalo další změnu autentizační architektury. Stejně tak tato implementace není globální auditní notifikací změn provedených mimo nový postup nastavení.

Primární dokumentace: https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/update a https://firebase.google.com/docs/auth/extend-with-blocking-functions .

## Validace

- 1 837 testů / 197 souborů prošlo; cíleně 53 testů včetně stávajících e-mailových funkcí. TypeScript a ESLint bez chyb, produkční sestavení i povinné kontroly runtime/proxy prošly.
- Čtyři integrační testy na lokálních emulátorech Firestore a Firebase Authentication. Skutečně změněno heslo pouze smyšleného účtu: původní přihlášení odmítnuto, nové přijato; původní token odmítnut při kontrole odvolání. Dva souběžné požadavky využily výzvu jen jednou. Ověřeno ukládání neúspěšných pokusů i zákaz čtení/zápisu z prohlížeče včetně administrátorských claims.
- Aktuální produkční Firestore rules načteny přes již přihlášené Firebase CLI a hash souhlasí s pravidly použitými v emulátoru. Produkční klientská data se nečetla ani neměnila.
- Chrome: skutečný Firebase klientský SDK, skutečný hook a formulář; odpovědi Firebase/API nahrazené syntetickými. E-mailové ověření, chybný kód, MFA resolver a prošlé potvrzení prošly. Vizuální kontrola 1 000 / 390 / 320 px. Testovací náhled před finálním sestavením odstraněn.
- Nebyl odeslán skutečný testovací e-mail ani změněno heslo skutečného účtu.

Nasazení vychází z produkční verze `dpl_FK81FV8LqN1GtKUuYeQdui8zuaC6`, zachovává region Frankfurt a obsahuje pouze soubory nové změny hesla, doručování oznámení a testy. Ostatní rozpracované místní úpravy nastavení se do nasazení nepřenesly.

## Dokončené nasazení

Produkční `bohemka.app` byla 13. 9. 2026 v 14:17 UTC přepnuta na `dpl_HRwV453ULAdBoKExZWzXChZTBBPy` v regionu `fra1`. Audit všech 1 262 nahraných souborů potvrdil shodu s připraveným sestavením: 13 přidaných, 4 změněné, žádný odebraný. Původní `/ucet/akce` zůstala zachovaná a testovací náhled není součástí nasazení.

Všech 11 kontrol prošlo před přepnutím i na živé doméně: nepřihlášená změna hesla a neautorizovaný cron vrací `401` s `no-store`, přihlášení a stránka e-mailových akcí jsou dostupné a úvodní stránka odkazuje na `/login`. Při těchto kontrolách nebyl odeslán e-mail ani změněn účet. Záznamy auditu, přepnutí a kontrol jsou v sousedním adresáři `password-change-2026-09-13/`. Pro případ návratu je zaznamenané předchozí nasazení `dpl_FK81FV8LqN1GtKUuYeQdui8zuaC6`.
