# Můj tým — načítání souhrnů, 28. 9. 2026

Optimalizace se týká souhrnů smluv poradců v `GET /api/team-overview`. Dřívější pětiminutové zneplatnění při dalším otevření znovu procházelo celou historii příslušných poradců. Nová cesta používá uložené souhrny a obnovuje jen dotčené vlastníky. Členství v týmu, oprávnění, profily a produkční cíle se nadále načítají aktuálně.

## Načítání a konzistence

- `teamOverviewProjection.ts` čte revizi vlastníka a jeho souhrn v jedné transakci pouze pro čtení. Výběr polí vynechává součty síně slávy a duplicitní původní týmová pole.
- Souhrn je uložen v `teamOverviewTotals/{email}.projection`, má vlastní verzi, revizi zdroje, všechny/aktivní statistiky a časové hranice platnosti. Původní dokumenty `teamOverviewTotals` a `teamOverviewMonthly` se zapisují současně, takže administrátorská diagnostika zůstává kompatibilní. Samotný původní dokument bez nových metadat není důkazem platnosti.
- Revizi sdílí síň slávy a produkce domovské stránky. `withContractHistory` mění revizi ve stejné transakci nebo dávce jako smlouvu; převod mění oba vlastníky. Mazání smluv již zapisovalo revizi atomicky.
- Sledovaná pole nyní zahrnují také stav, počátek, konec a dobu trvání smlouvy. Tím se zachytí změny aktivního portfolia, importy výpisů a automatické dožití. Dva opravné skripty zapisující konec pojištění či identitu vlastníka nově zapisují revizi ve stejné dávce; jejich velikost dávek je přizpůsobena dalším zápisům. Skripty nebyly spuštěny nad produkcí.
- Přepočet načte pouze pole používaná statistikami, bez klientských jmen, příloh, poznámek a provizních položek. Nejvýše čtyři dávky po deseti vlastnících běží současně.
- Před zveřejněním výsledku transakce znovu ověří revizi. Souběžná změna opakuje výpočet pouze dotčených vlastníků, nejvýše třikrát. Trvale měnící se podklady nebo chyba čtení vrátí chybu, nikoli částečné či neověřené součty. Selhání samotného zápisu cache dovoluje odpověď jen po úspěšném nezávislém ověření revizí.
- Načítání poradců, TIP statistik a cílů běží souběžně nad jedním společným časem výpočtu. Odpověď má `Cache-Control: private, no-store`.

## Čas a zachování výpočtu

Výpočet kategorií, pojišťoven, ročního pojistného, storen, dožití a převzatých smluv byl přesunut beze změny do `teamOverviewStats.ts`. Zachovává přednost `contractSignedDate ?? createdAt`, podporované historické formáty dat i původní deduplikaci vlastníka a ID smlouvy. Převzaté smlouvy zůstávají v portfoliu, ale ne v nové měsíční produkci.

Platnost souhrnu není jen časový limit:

- Změna místního kalendářního dne obnoví také aktivní portfolio a období.
- Budoucí sjednání v aktuálním měsíci zneplatní souhrn přesně v okamžiku sjednání, včetně milisekund.
- Srovnání minulého měsíce používá původní posouvanou hranici dne a času. Cache sleduje následující sjednání v původní časové ose minulého měsíce, takže zachovává kratší měsíce a změny letního času. Návrat hodin dozadu vyvolá nový výpočet.
- Klíč obsahuje časové pásmo serveru a zachovává dosavadní kalendář routy. Tato změna nepřevádí týmové statistiky na jiné pásmo.
- Nejpozději po šesti hodinách následuje kontrolní přepočet. Přímé zásahy do databáze mimo aplikační zapisovače musí ve stejné dávce zneplatnit revizi; jinak je zachytí až tento přepočet. Oprávnění přímých administrátorských zápisů se touto změnou nemění.

## Ověření

- Celá aplikační sada: **5 181 testů ve 354 souborech**.
- Celá databázová/bezpečnostní sada na čerstvém lokálním Firestore/Auth emulátoru: **322 úspěšných testů, jeden volitelný benchmark přeskočen**, 14 souborů.
- Nové jednotkové testy navíc běžely v pásmech UTC i Europe/Prague. Pokrývají přesné časové hranice, únor, půlnoc, nový rok, letní čas, poškozené/staré souhrny, výpadky a souběžné změny.
- Pět nových integračních testů používá skutečné Firestore transakce. Porovnává projekci s úplnými dokumenty, provádí vytvoření, úpravy, převod a odstranění smlouvy a ověřuje API včetně změny týmu, TIP statistik a zamítnutí přístupu i s naplněnou cache.
- Nezávislé porovnání s původními funkcemi uloženými před úpravou: **1 000 scénářů po 200 smlouvách**, rozděleno mezi UTC a Europe/Prague; všechny výsledky totožné. Zahrnuje různá data, kategorie, frekvence, částky, stavy a duplicity.
- Produkční build, TypeScript, ESLint změněných oblastí, syntaktická kontrola obou skriptů a `git diff --check`.

Syntetický tým se dvěma poradci po 1 000 smlouvách:

| Situace | Přečtené smlouvy |
| --- | ---: |
| První sestavení souhrnů | 2 000 |
| Opakované načtení po 20 minutách, beze změn | 0 |
| Úprava jedné smlouvy jednoho poradce | 1 000 |

Nula se vztahuje na smlouvy, nikoli na všechny databázové operace: načítají se revize, souhrny a aktuální týmový kontext. Původní cesta by po 20 minutách četla opět všech 2 000 smluv. Toto měření neprokazuje konkrétní zrychlení produkční odezvy.

## Rozsah

Statistiky tipařů mají dosavadní zdroje a výpočty, pouze běží souběžně s poradci. Stávající krátká cache stránky v prohlížeči se nemění. Nové databázové indexy ani migrace nejsou potřebné; souhrny vzniknou při prvním načtení. Změna je zahrnuta do [kompletního vydání z 28. 9. 2026](all-changes-release-2026-09-28.md).
