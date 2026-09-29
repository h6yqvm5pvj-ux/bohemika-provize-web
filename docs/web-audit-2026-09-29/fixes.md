# Opravy nálezů z auditu — 29. 9. 2026

Všech 11 nálezů původního auditu je opraveno v pracovní kopii. Změny nejsou nasazené; produkční data ani produkční plánovač se neměnily.

| Nález | Provedená oprava |
| --- | --- |
| 1. Nové karty | NEON a plán produkce otevřou prázdnou kartu během uživatelského kliknutí, odpojí `opener` a pak načtou dokument. Skutečné zablokování vyskakovacích oken má vlastní chybový stav. Nahrání výpovědi používá odkaz do nové karty a zachová původní formulář. |
| 2. Interaktivní výpisy a mobilní PDF | Sdílené pevné skripty jsou povolené přes přesný SHA-256 hash pouze na příslušných cestách. Výpisy i PDF používají sandbox bez přístupu k původu aplikace. Cizí skripty a inline události zůstávají zakázané. |
| 3. Týdenní report | Pouze `/muj-tym/tydenni-report?source=weekly-report&embed=mailbox` povoluje vložení ze stejného původu. Přihlášení je stále povinné; jiné varianty a cizí původy zůstávají blokované. |
| 4. BYTEX | Dodané `provize-CPP-BYTEX-200313-01.pdf` je beze změny přidáno jako `public/provize/bytexprovize.pdf` (3 strany, 116 855 bajtů). Odkaz v kalkulačce opět vrací PDF. |
| 5. AutoKelly | Blokovaný externí iframe je nahrazen vysvětlením a existujícím odkazem do AutoKelly. Na stránce zůstávají získané údaje nabídky a použití ceny pro limit. |
| 6. Naplánovaná oznámení | Do `vercel.json` je přidáno minutové spouštění chráněného `/api/cron/admin-broadcasts`. |
| 7. Připomínky Pošty | `/api/cron/mailbox-snooze-reminders` je plánovaný každých 5 minut místo jednou denně. Denní připomínky poznámek mají původní rozvrh. |
| 8. Jazyk vizitky | Odkazy, načtení podstránek vozidel/života/zlata, změna jazyka a návrat na vizitku zachovávají `lang`. Cestovní stránka zachovává jazyk návratu; její stávající český obsah se nepřekládal. |
| 9. Mobilní měřítko | Podle upřesnění uživatele je `initialScale: 1` a `minimumScale: 1`, přiblížení je povolené. Lze se vrátit na 100 %, nikoliv pod výchozí měřítko. |
| 10. Chybějící stránka | Vlastní česká 404 s vysvětlením a odkazem na úvodní stránku. |
| 11. Závislost | Nepoužívaný `nodemailer` a jeho typová deklarace jsou odstraněné. Nový `npm audit` nehlásí žádnou známou zranitelnost. |

## Ověření

- **5 383 / 5 383 testů**, 379 souborů; finální běh `npm test -- --maxWorkers=4`.
- TypeScript bez chyb, ESLint bez chyb. Zůstávají 4 původní varování přímé interní navigace v administraci, detailu smlouvy a AppLayout; nejsou nově zavedená těmito opravami.
- Produkční sestavení Next.js 16.3.6 prošlo v izolované kopii se syntetickou konfigurací, včetně kontroly registrace autentizačního proxy.
- Chrome 154 ověřil rozbalení a opětovné sbalení výpisu klávesnicí, odmítnutí cizího skriptu i inline handleru a nemožnost přístupu iframe k rodičovskému dokumentu.
- PDF scénáře se vešlo do rámce širokého 350 px i po zúžení na 280 px. Týdenní report se vložil ze stejného původu; běžná stránka reportu i vložení z cizího původu byly odmítnuté.
- NEON provedl jeden požadavek na dokument a otevřel náhled bez falešné chyby; plán otevřel HTML náhled s `opener === null`. Simulované skutečné blokování obou popupů správně zobrazilo chybu a nevytvořilo kartu.
- Na skutečném místním produkčním sestavení: česká 404 vrací HTTP 404; BYTEX vrací HTTP 200, správný MIME typ a shodné bajty s dodaným dokumentem. Mobilní dotyková gesta změnila měřítko **1 → 2 → 1**, pokus o další oddálení zůstal na 1. Také stránka účtu přebírá `minimum-scale=1`.
- Kontaktní formulář zablokoval prázdné odeslání, po simulovaném selhání zachoval vstupy, opakovaný pokus uspěl a Escape zavřel dialog. Bez JavaScriptových výjimek. Všechna odeslání byla nahrazená testovacími odpověďmi.

První plný běh souběžný s produkčním buildem narazil na časový limit jednoho existujícího výkonnostně náročného cashflow testu. Samostatný finální běh celé sady s omezením počtu workerů prošel bez změny testu či aplikace kvůli tomuto limitu.

Důkazy: [náhledy a popupy](fixes-browser.json), [produkční web a dotyková gesta](fixes-production.json), [audit závislostí po opravě](npm-audit-after-fixes.json). Browserové testy používají lokální izolovaný Chrome a simulovaná data; nereprezentují průchod všemi přihlášenými produkčními účty. Pro opravy nebylo potřeba měnit Firestore pravidla; jejich původní emulátorové ověření je v auditu. Nové rozvrhy úloh začnou platit až po nasazení konfigurace.
