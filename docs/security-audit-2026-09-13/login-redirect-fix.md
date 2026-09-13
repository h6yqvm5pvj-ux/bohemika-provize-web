**Oprava návratové adresy po přihlášení — 13. 9. 2026**

Nález L-02 je opraven v místním projektu. Parametr `next` se zpracuje jako URL vůči skutečnému originu aplikace a musí zachovat stejné schéma, doménu i port. Do routeru se předává pouze normalizovaná místní cesta s dotazem a fragmentem. Oprava zatím není nasazena.

Kontrola odmítá absolutní a síťové adresy, zpětná lomítka, řídicí znaky i jejich nebezpečné zakódované podoby v cestě. Odmítá také výsledek, který by po odstranění `..` začínal `//` a při opětovném zpracování routerem změnil doménu. Návrat na přihlášení včetně variant s fragmentem, koncovým lomítkem a zakódovaným názvem se nepovolí, aby nevznikala smyčka. Stejná kontrola platí pro záložní cestu. Při neplatném vstupu se použije bezpečná záložní cesta, případně `/`.

Běžné cesty do aplikace, parametry, fragmenty a české znaky zůstávají funkční. Návrat na původní stránku po přihlášení tak pokračuje přes stávající `router.replace`.

Před opravou selhalo 30 z 50 nových regresních scénářů; po opravě prošlo všech 50. Pokrývají také původní důkazy ze zprávy, zakódované škodlivé odkazy, změnu adresy normalizací, bezpečnou záložní cestu a místní doménu s portem. Výsledné adresy se ověřují standardním `new URL`, které používá i instalovaný Next router.

Celá aplikační sada prošla: **2 032 testů ve 200 souborech**. Kontrola `tsc --noEmit --incremental false` a lint obou dotčených souborů prošly bez chyb a upozornění.

Ověřování proběhlo lokálně s vyhrazenými testovacími doménami a blokováním externích spojení. Žádný podvržený odkaz se neotvíral na živém webu. Produkční data se nečetla ani neměnila. Úplný build, skutečné přihlášení v prohlížeči a nasazení nebyly součástí této opravy.

Podklady: [kontrola návratové adresy](../../src/app/lib/authSession.ts), [50 regresních testů](../../src/app/lib/authSession.test.ts).
