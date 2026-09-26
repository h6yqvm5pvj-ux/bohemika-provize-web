# Cloud Functions a cloudová oprávnění — 26. 9. 2026

> **Historický stav před opravou.** Níže je původní audit. Aktuální stav a produkční ověření jsou v [záznamu nápravy](remediation.md); tato zpráva se zachovává jako doklad původních nálezů.

**Výsledek: potvrzené závažné nedostatky v nasazených Cloud Functions a příliš široká servisní oprávnění. Tato kontrola je neopravila ani neměnila produkční konfiguraci. Stav MFA osobního účtu vlastníka projektu nelze z dostupných IAM API potvrdit.**

Zkontrolován projekt `bohemikasmlouvy`: všech 12 Cloud Functions druhé generace, jejich Cloud Run služby, projektová a servisní IAM oprávnění, metadata uživatelsky spravovaných klíčů, přístupové politiky čtyř tajných hodnot a dva plánovače. Cloud Functions API vrátilo úplný seznam, bez nedostupných regionů; první generace je prázdná.

Nasazené zdroje byly staženy z konkrétních generací objektů uvedených v konfiguraci funkcí, nikoli odhadnuty z lokálního webového repozitáře. Bylo provedeno **40 bezpečných HTTP kontrol** obou veřejných adres funkcí a **32 místních reprodukcí** skutečného nasazeného kódu se simulovaným Firebase a HTTP. Číslo 32 znamená úspěšně doložené scénáře, nikoli 32 bezpečnostních kontrol bez nálezu.

Produkční požadavky obsahovaly pouze prázdná data, bez přihlášení nebo se zjevně neplatným tokenem. Testy neposílaly skutečné notifikace, nespouštěly placené AI dotazy, neměnily účty ani klientské záznamy. Hodnoty tajných klíčů se nečetly; načetly se pouze jejich metadata a IAM politiky.

## Potvrzené nálezy

### CF-01 — Vysoká: týmové zprávy bez autentizace a autorizace

`sendTeamMessage` má na Cloud Run přidělené `roles/run.invoker` pro `allUsers`. Její nasazený handler neověřuje token. Přijímá `managerEmail` ze vstupu a pro `target: selected` načítá libovolné zadané příjemce, bez kontroly jejich vztahu k manažerovi.

- Produkce: obě adresy bez přihlášení i s neplatným tokenem zpracovaly prázdný vstup a vrátily HTTP 400 „Chybí managerEmail.“.
- Přesná kopie nasazeného kódu: anonymní požadavek s podvrženým manažerem a příjemcem z jiného týmu dosáhl simulovaného odeslání zprávy a HTTP 200; počet kontrol tokenu byl nula.
- Dopad: vydávání se za manažera a odesílání podvodných týmových notifikací uživatelům, kteří mají v očekávaných profilových polích uložený push token. Skutečná doručitelnost ani přítomnost těchto tokenů u konkrétních uživatelů nebyla testována.

Ochrana webové `/api/team-message` se přímým voláním funkce obejde. Oprava musí být v samotné funkci nebo na její přístupové hranici; samotná změna webové stránky nestačí. Ověřenou identitu je nutné svázat s manažerem a ověřit oprávnění ke každému příjemci.

Zdroj: [nasazený handler, řádek 1453](../../.tmp/cloud-audit-20260926/sources/184f458002df/index.js#L1453).

### CF-02 — Vysoká: placený AI asistent bez přihlášení a omezení frekvence

`aiAssistant` má rovněž veřejné IAM a neověřuje token. Neprázdný prompt předává přímo placenému API. Nasazený handler nemá vlastní omezení frekvence ani aplikační limit délky promptu.

- Produkce: obě adresy bez autentizace nebo s neplatným tokenem vrátily HTTP 400 kvůli prázdnému promptu.
- Izolovaná reprodukce s neprázdným syntetickým promptem: HTTP 200, jedno simulované placené API volání, nula kontrol tokenu.
- Dopad: neoprávněná spotřeba placené služby a nákladů Cloud Functions. Tento handler sám nečte klientské smlouvy; kontrola neprokázala jejich únik touto cestou.

Je potřeba ověření účtu, MFA, revokace, oprávnění, limit velikosti vstupu a sdílený limit frekvence přímo u funkce. Přímé adresy nesmějí obcházet limity webového API.

Zdroj: [nasazený handler, řádek 1387](../../.tmp/cloud-audit-20260926/sources/184f458002df/index.js#L1387).

### CF-03 — Vysoká: pět funkcí obchází požadavky na MFA a odvolání přístupu

Týká se `cuzkSuggestAddress`, `cuzkLookupByAddress`, `cuzkLookupByAdresniMisto`, `rsvVehicleLookup` a `sendTestPush`.

Společné pomocné funkce volají pouze `admin.auth().verifyIdToken(token)` bez `checkRevoked: true`. Neověřují současný stav účtu, ověření e-mailu, MFA, aplikační `accountBlocks` ani revokační generaci. Handlery navíc nemají vlastní sdílené omezení frekvence. Aktuální ochrany webové aplikace se na samostatně nasazený kód automaticky nepřenášejí.

Produkce chybějící token správně odmítá HTTP 401. Neplatný token chybně mapuje na HTTP 500; to samo neznamená jeho přijetí. Chybějící další kontroly jsou doložené nasazeným zdrojem a 25 izolovanými scénáři. Ty simulovaly token bez MFA, neověřený e-mail, odvolání, deaktivovaný účet a aplikační blokaci. Nebyly vydávány ani odvolávány tokeny skutečných produkčních uživatelů.

Pro dva katastrální lookupy skončil test po přijetí identity na HTTP 400 kvůli chybějícím parametrům; u našeptávače, vozidel a testovací notifikace prošel k simulovanému výsledku HTTP 200. Odvolaný nebo deaktivovanému uživateli vydaný token je relevantní do své expirace. [Firebase výslovně uvádí, že základní ověření ID tokenu nekontroluje jeho odvolání](https://firebase.google.com/docs/auth/admin/verify-id-tokens).

Oprava: sjednotit přímou ochranu těchto funkcí s aktuální bezpečnostní politikou aplikace včetně podpory legitimních passkey/custom-token přihlášení. Samotné přidání `true` neřeší chybějící MFA a aplikační blokace.

Zdroj: [pomocné funkce, řádky 28 a 37](../../.tmp/cloud-audit-20260926/sources/184f458002df/index.js#L28); stejné nedostatky obsahuje i srpnová varianta katastrálních funkcí.

### IAM-01 — Vysoká: společný runtime s rolí Editor a široká možnost zastupování servisních účtů

Všech 12 funkcí běží jako výchozí Compute servisní účet. Ten má projektovou roli `roles/editor` a přístup ke všem čtyřem tajným hodnotám, přestože jednotlivé funkce potřebují jen část z nich nebo žádnou.

Čerstvě načtená definice role Editor obsahuje mimo jiné změny funkcí, čtení/zápis/mazání Firestore entit, změny Firebase uživatelů a vytváření servisních klíčů. Nejde tedy jen o oprávnění spustit funkci. Kompromitace jedné funkce by měla výrazně širší dopad než její vlastní účel. **Kontrola neprokázala vzdálené spuštění kódu ani převzetí tohoto účtu.**

Firebase Admin SDK servisní účet má navíc `roles/iam.serviceAccountTokenCreator` na celém projektu, nikoli pouze na konkrétním cílovém účtu. To umožňuje zastupovat jiné servisní účty projektu, včetně účtu s rolí Editor. Má také projektové `roles/storage.admin` a administrátorská oprávnění Firebase. Na projektu nebyla nalezena žádná IAM deny politika. [Google upozorňuje na eskalaci oprávnění při projektovém přidělení Token Creator](https://docs.cloud.google.com/iam/docs/best-practices-service-accounts).

V projektové roli Editor jsou tři servisní identity: Compute default, App Engine default a Google APIs service agent. Systémové service agenty nelze bez posouzení odstraňovat.

Oprava: samostatné runtime účty podle potřeb funkcí, minimální role a přístup k jednotlivým secretům. Token Creator omezit na konkrétní nezbytné cílové účty a prověřit, zda je vůbec potřebný. Změnu provádět s inventářem závislostí, testem funkcí a připraveným návratem, ne plošným odebráním rolí.

### IAM-02 — Střední: dva aktivní dlouhodobé klíče bez praktické expirace

Firebase Admin SDK servisní účet má dva povolené uživatelsky spravované klíče, vytvořené 15. a 17. ledna 2026. Jejich stáří při kontrole bylo 253 a 251 dní a expirace je nastavena do roku 9999. Ostatní dva vypsané servisní účty žádné uživatelsky spravované klíče nemají.

To není důkaz úniku klíče. V kombinaci s výše uvedenými oprávněními ale jde o významné přístupové údaje, jejichž použití nevyžaduje MFA člověka. Účinné projektové politiky nezakazují vytváření ani nahrávání servisních klíčů a neblokují automatické základní role výchozích účtů.

Nejdříve zjistit skutečné používání obou klíčů a závislosti nasazení, poté bezpečně rotovat/odstranit nepotřebný klíč. Preferovat krátkodobé identity tam, kde to hosting podporuje. Klíče se při auditu nerotovaly ani nezneplatňovaly.

### CF-04 — Střední: opakovaný webhook prodlužuje předplatné znovu

`fakturoidWebhook` při každém přijetí zaplacené faktury prodlužuje `paidUntil` o další měsíc. `lastInvoiceId` zapisuje, ale před aktualizací neověřuje, zda stejnou fakturu již zpracoval. Dvojí doručení stejného oprávněného webhooku tak může opakovaně prodlužovat předplatné. Reprodukce proběhla pouze v paměti se syntetickou fakturou a dvěma simulovanými zápisy.

Dále je kontrola tokenu podmíněna jeho neprázdnou hodnotou. Při prázdném konfigurovaném secretu by handler pokračoval bez autorizace; **tento stav v produkci zjištěn nebyl**. Produkční webhook odmítl chybějící i neplatnou autorizaci HTTP 401 na obou adresách.

Oprava: atomická evidence zpracovaných faktur/událostí a odmítnutí provozu při chybějící konfiguraci tokenu. Zdroj: [webhook, řádek 1592](../../.tmp/cloud-audit-20260926/sources/184f458002df/index.js#L1592).

## Cloudoví správci a MFA

- Projektová IAM politika má jediného lidského vlastníka: osobní účet Gmail. Nemá nadřazenou organizaci ani složku.
- V přečtených politikách 12 služeb, tří servisních účtů a čtyř secretů nejsou další explicitní lidská nebo skupinová přidělení. Projektové role se samozřejmě dědí.
- MFA vlastníka **není potvrzené ani vyvrácené**. Google Cloud IAM u osobního Google účtu jeho nastavení dvoufázového ověření neposkytuje. Uživatel byl požádán o ověření v nastavení tohoto účtu; do uzavření zprávy nepřišlo potvrzení.
- MFA dvou aplikačních administrátorů ověřené v předchozím auditu není dokladem MFA cloudového vlastníka: jde o jiný systém identity.
- Google požaduje MFA pro přístup osobních účtů ke Cloud/Firebase konzoli. Dokumentace ale výslovně rozlišuje konzoli od CLI a pracovních identit; úspěšné použití existujícího OAuth přihlášení proto není důkazem současného nastavení MFA konkrétního účtu. [Aktuální dokumentace Google](https://docs.cloud.google.com/docs/authentication/mfa-requirement).

Pro úplné uzavření tohoto bodu je potřeba u vlastníka ověřit zapnuté dvoufázové ověření, ideálně s bezpečnostním klíčem/passkey a uloženými obnovovacími prostředky. Pro centrální správu politik lidských účtů by bylo potřeba spravované firemní identity; samotná projektová IAM role tuto politiku nenahrazuje.

## Co je chráněné a hranice kontroly

`notifyAdminOnUserRequest`, `notifyManagerOnNewEntry`, `notifyAutoAnniversary` a `notifyUnpaidContracts` nemají veřejného invokera. Všech osm anonymních kontrol přes jejich dvě adresy vrátilo HTTP 403. Oba plánovače používají OIDC token servisního účtu. Secret hodnoty jsou u příslušných funkcí připojené přes Secret Manager.

Cloud Asset API je vypnuté (`403 SERVICE_DISABLED`), takže neproběhl jeho doplňkový souhrnný inventář všech IAM politik všech typů zdrojů. To nebránilo přímému čtení výše uvedených projektových, funkčních a servisních politik. API se nezapínalo.

Globální Cloud Run seznam vrátil známých 12 služeb, ale označil pět jiných regionů za nedostupné; nelze ho vydávat za úplný audit všech samostatných Cloud Run služeb. Samostatný globální seznam Cloud Functions byl úplný a všechny jeho služby byly zkontrolovány přímo.

Tato kontrola nevyšetřovala historické zneužití a neprokázala únik klientských dat. Neprováděla zatěžovací útoky, plošné načítání soukromých záznamů ani testování s opravdovými uživatelskými tokeny. Nebyly měněny produkční služby, IAM, secrets, uživatelé ani konfigurace MFA.

## Pořadí nápravy a důkazy

1. Opravit a nasadit autentizaci/autorizaci `sendTeamMessage` a `aiAssistant`, včetně omezení frekvence. Ověřit obě přímé adresy každé funkce.
2. Sjednotit MFA, revokaci a blokace u ostatních pěti veřejných uživatelských funkcí. Doplnit odmítací i oprávněné průchody v testech.
3. Rozdělit runtime identity, omezit projektové zastupování servisních účtů a zrevidovat dlouhodobé klíče.
4. Dokončit ověření MFA cloudového vlastníka a opravit idempotenci webhooku.

Při přípravě nasazení zachovat novější srpnovou variantu dvou katastrálních funkcí a květnovou úpravu `notifyManagerOnNewEntry`; stažené funkce pocházejí ze tří různých zdrojových archivů. Nasazení jedné staré společné kopie přes všechny funkce by mohlo vrátit dřívější změny.

- [Strojový souhrn](verification.json) neobsahuje tajné hodnoty ani celé e-maily uživatelů.
- [Místní reprodukční skript](../../.tmp/cloud-audit-20260926/reproduce-offline.mjs) a [jeho výsledky](../../.tmp/cloud-audit-20260926/offline-reproduction.json).
- [Výsledky produkčních HTTP kontrol](../../.tmp/cloud-audit-20260926/http-probes.json).
- Úplná bezpečnostní metadata a zdrojové archivy jsou v ignorovaném `.tmp/cloud-audit-20260926/`, přístupná místně. Nejsou součástí tohoto dokumentu ani nasazení webu.
