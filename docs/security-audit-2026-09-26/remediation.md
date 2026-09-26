# Náprava Cloud Functions a oprávnění — 26. 9. 2026

Původní [audit](report.md) zachycuje stav před opravou. Zde se evidují provedené změny. Projekt: `bohemikasmlouvy`.

## Opravené a nasazené funkce

| Nález | Provedená oprava |
| --- | --- |
| CF-01 | Týmové zprávy vyžadují ověřenou identitu manažera a kontrolu vztahu ke všem příjemcům před prvním odesláním. Cizí tým ani podvržený manažer neprojdou. |
| CF-02 | AI vyžaduje přihlášení, MFA a platný účet. Má sdílený limit 30 požadavků/minutu/uživatel, limit promptu 12 000 znaků a odpovědi 2 000 tokenů. |
| CF-03 | Všech sedm uživatelských HTTP funkcí ověřuje revokaci tokenu, aktuální stav účtu, ověřený e-mail, TOTP, aplikační blokace a UID interního profilu. Podporuje legitimní passkey/custom-token přihlášení se stejnou revokační generací jako web. |
| CF-04 | Webhook odmítá chybějící konfigurovaný secret a atomicky eviduje zpracované faktury. Opakované i souběžné doručení stejné faktury neprodlouží předplatné vícekrát. |
| IAM-01 | Každá z 12 funkcí používá vlastní runtime účet; build používá další samostatný účet. Výchozí Compute účet ztratil Editor i přístup ke všem čtyřem secretům. Projektový Token Creator byl odebrán Firebase účtu webu. |

Kód všech funkcí je nyní verzovaný v [functions](../../functions/README.md). Byly porovnány tři původní zdrojové archivy a zachováno skutečně nasazené chování každého handleru, včetně úmyslně vypnutého `notifyManagerOnNewEntry`. Handlery srpnové katastrální varianty byly proti základní verzi totožné; nesouvisející změny z tohoto archivu se nepřenášely do ostatních funkcí.

Všech 12 funkcí je `ACTIVE`, Node.js 22. Nasazený archiv byl znovu stažen z konkrétních generací zdrojů všech 12 funkcí a má shodný SHA-256:

`902bad5edd3973e8b19aa0ee5f8ec6879d0eb435a41104ce645d277c7975078f`

Verzovaná kopie následně odstranila čtyři původní řádky s koncovými mezerami v `index.js`; všech šest nasazovaných souborů se s archivem shoduje po normalizaci koncových mezer. Strojový záznam rozlišuje přesnou shodu a tuto kosmetickou odchylku.

Původní adresy, event triggery, identity plánovačů, verze secretů a omezení počtu instancí zůstaly zachované. Čtyři interní funkce mají soukromé IAM; původní spouštěcí účet má invoker pouze u těchto čtyř služeb. Veřejná dosažitelnost ostatních HTTP funkcí slouží Firebase Bearer autentizaci a fakturačnímu webhooku, není dokladem anonymního oprávnění uvnitř handleru.

## Rozsah oprávnění

Runtime funkce mají podle účelu pouze čtení Firestore, nebo čtení/vytváření/aktualizaci bez mazání; uživatelské endpointy navíc `firebaseauth.users.get`, odesílající funkce `cloudmessaging.messages.create`. Tajné hodnoty jsou přidělené jednotlivým runtime účtům jen podle jejich potřeby. Účet pro build nemá přístup k aplikačním secretům.

Firestore IAM pracuje na úrovni databáze, nikoli jednotlivých kolekcí. Aplikační kontroly proto nadále tvoří důležitou bezpečnostní hranici. Build účet má standardní roli Cloud Build Builder; nejde o účet s nulovými oprávněními mimo sestavování.

Firebase účet webu má vlastní roli pro databázové operace, správu uživatelů a FCM; druhá role dovoluje běžné operace se soubory pouze v aplikačním bucketu. Odebrány byly projektové role Firebase SDK Admin Service Agent, Firebase Auth Admin, Firebase App Check Admin a Storage Admin. Po propagaci IAM prošlo 14 skutečných kontrol, včetně databázové transakce, souboru, vytvoření/změny/smazání syntetického účtu, výpisu uživatelů a odmítnutých infrastrukturních oprávnění. Všechny syntetické objekty byly odstraněné. Podrobnosti jsou ve [strojovém záznamu nápravy](remediation-verification.json); přesné role a identity v [IAM manifestu](iam-manifest.json).

Nasazování Firestore pravidel a změny projektové konfigurace TOTP nyní používají přihlášeného operátora (`firebase login` nebo explicitní `GOOGLE_OPERATOR_ACCESS_TOKEN`), nikoli soukromý klíč webu. Čtením byla ověřena shoda produkčních Firestore pravidel s repozitářem pod operátorskou identitou. Skript TOTP se při této opravě nespouštěl a nastavení MFA uživatelů se neměnilo.

Googlem spravovanému service agentovi nebyly plošně odebírány systémové role. Výchozí App Engine účet má stále původní Editor; aplikace App Engine se nenašla a žádná z 12 funkcí tento účet nepoužívá. Nejde o potvrzení úplného soupisu všech dalších služeb projektu.

## Ověření

- 58 testů skutečných handlerů a bezpečnostních pomocných funkcí: odmítací i legitimní průchody, MFA/revokace/blokace, hierarchie příjemců, limity, chybové stavy a webhook.
- 2 integrační testy ve skutečném lokálním emulátoru Firestore: souběžná idempotence faktur a atomické omezení frekvence.
- 40 produkčních HTTP kontrol obou přímých adres: 32 odpovědí 401 a 8 odpovědí 403. Žádné přijetí anonymního/neplatného tokenu ani předchozí chyby 500.
- U všech 12 runtime identit se před odebráním starých oprávnění skutečně ověřilo čtení Firestore, potřebné syntetické zápisy, případně čtení Auth a oprávnění k jednotlivým secretům. Hodnoty secretů se při těchto kontrolách nečetly.
- Zastupování výchozího Compute účtu přes Firebase účet webu po odebrání Token Creator končí 403; lokální podpis Firebase custom tokenu dál funguje.
- TypeScript a lint prošly; lint uvádí čtyři dřívější varování v navigaci, bez chyb. Testy neposílaly skutečné notifikace ani placené AI dotazy a neměnily klientské záznamy.

## Otevřené body

**IAM-02 — rotace klíčů je rozpracovaná.** Nový servisní klíč byl vytvořen, nakonfigurován lokálně i pro všechny tři prostředí Vercelu a ověřen proti Google API. Nasazení webu a jeho ověření se eviduje samostatně. Dva lednové klíče zůstávají povolené do potvrzení všech jejich spotřebitelů. Za 90 dní byla v dostupné metrice autentizací nalezena aktivita pouze u klíče ze 17. ledna; absence metrik u druhého klíče není důkazem nepoužívání, zejména pro lokální podpisy. Uživatel byl požádán o potvrzení dalších integrací. Staré klíče nelze považovat za zneplatněné.

**MFA osobního cloudového vlastníka zůstává nepotvrzené.** Google IAM nevystavuje stav osobního Google účtu potřebný k tomuto ověření. Nutné je potvrdit dvoufázové ověření přímo v zabezpečení účtu vlastníka, ideálně s passkey/bezpečnostním klíčem a obnovovacími prostředky. Zapnutá MFA uživatelů aplikace ani platné CLI přihlášení tuto kontrolu nenahrazují. [Dokumentace Google k rozsahu požadavku MFA](https://docs.cloud.google.com/docs/authentication/mfa-requirement).

Idempotence webhooku rozpoznává novou evidenci i poslední fakturu uloženou před opravou (`lastInvoiceId`). Starší historicky uhrazené faktury, které v této evidenci nejsou, nelze bezpečně zpětně identifikovat bez historie poskytovatele. Pro plnou ochranu proti přehrání libovolné historické faktury je potřeba ověřený import této historie.

Původní omezení inventáře (vypnuté Cloud Asset API, nedostupné regiony samostatného Cloud Run seznamu) nadále platí. Tato oprava není vyšetřením historického incidentu ani zárukou absence dalších zranitelností.

## Důkazy a obnova

[Strojový záznam nápravy](remediation-verification.json) obsahuje pouze bezpečná metadata. Původní konfigurace, IAM politiky, zdroje, provozní ověření a zálohy přístupových údajů jsou místně v ignorovaném `.tmp/cloud-fix-20260926/` s omezeným přístupem. Klíče ani jejich zálohy nejsou v Gitu či Vercel uploadu. Při obnově zachovat nové bezpečnostní handlery; neobnovovat plošně původní Editor/Token Creator nebo anonymní zpracování.
