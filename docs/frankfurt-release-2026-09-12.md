**Přesun produkčních funkcí do Frankfurtu — 12. 9. 2026**

Produkční doména [bohemka.app](https://bohemka.app) byla v 18:39:30 UTC (20:39:30 v Praze) přepnuta na `dpl_BJsEiRgSqD2HBFhbeeZw2FLW7xMe` v regionu `fra1`. Prošlo všech 15 kontrol připraveného nasazení a všech 15 následných kontrol živé domény. Závěrečné přímé API ověření v 18:41:34 UTC potvrdilo cílové nasazení domény i jeho region. Americká verze `dpl_G8ZJ4eutmWx6gf1wVzFoGu422V6W` zůstává ve stavu `READY` k dispozici pro návrat. [Manifest a přesná návaznost zdrojů](./frankfurt-release-2026-09-12.json).

Vydání vzniklo z přesné izolované kopie dosavadní produkce s již nasazenou optimalizací domovského přehledu. Jedinou změnou zdrojů je přidání `"regions": ["fra1"]` do `vercel.json`. Stejná konfigurace je také v hlavním pracovním adresáři pro následující sestavení. Rozpracované změny ostatních souborů hlavního workspace nebyly nasazeny. [Patch](./frankfurt-release-2026-09-12.patch).

API seznamu souborů obou nasazení potvrdilo shodu všech 1 226 nahraných zdrojových souborů s výjimkou `vercel.json`. Všechny soubory nového nasazení souhlasí i s kontrolními součty lokální připravené kopie. Nebyl přidán ani odstraněn žádný zdrojový soubor; diagnostické sondy v balíku nejsou. Tato kontrola porovnává nahrané zdroje, nikoli přihlášené běhové chování nebo sestavené klientské chunky.

Pět naplánovaných úloh má shodné cesty a časy. Nasazení používá stejné produkční prostředí a explicitní příznaky jako předchozí vydání: klientský cashflow worker zůstává zapnutý, serverové experimenty cashflow zůstávají vypnuté. Přesun neobsahuje změnu aplikačního kódu, databázového schématu ani migraci dat.

Nová verze byla nejprve sestavena s produkčním prostředím a bez přepnutí domény. Prošla kontrolou regionu `fra1`, stavu `READY`, zdrojových souborů a 15 nepřihlášenými HTTP kontrolami. Těsně před přepnutím skript ověřil, že doména stále míří na očekávanou americkou verzi. Teprve pak použil propagaci připraveného nasazení. Následné ověření živé domény a zachování amerického nasazení zachycuje [doklad nasazení](./frankfurt-deployment-2026-09-12.json).

Kontroly zahrnují dostupnost přihlašovací stránky, přesměrování chráněných stránek, odmítnutí API pošty, smluv, TIPů a výpisů bez přihlášení, vypnutý serverový shadow režim a nepřítomnost testovacích endpointů. Při kontrolách nebyly dodány aplikační přihlašovací údaje ani čtena či měněna klientská data. Vercel CLI používá oprávnění k hostingu pro přístup k chráněnému nasazení.

Nezměněná aplikace prošla při předchozím vydání [1 700 testy](./home-loading-unit-results-2026-09-12.json), dvěma SDK testy proti lokálnímu emulátoru a 18 lokálními prohlížečovými případy. Celá tato sada se pro změnu samotného regionu neopakovala; nové nasazení má vlastní úspěšný produkční build a nové HTTP kontroly. Přihlášení přes 2FA, skutečné portfolio, odeslání e-mailu a skutečné spuštění cronů se při přesunu neověřovaly.

Přínos podporuje předchozí [měření obou regionů](./region-verification-2026-09-12.md): jeden databázový dotaz měl medián 104,16 ms v USA a 33,42 ms ve Frankfurtu, pět postupných dotazů 540,55 ms a 151,14 ms. Jsou to syntetická měření databázové fáze s popsanými omezeními. Nepředstavují měření načtení celého přihlášeného webu ani záruku stejného zlepšení každé stránky.

Pro případ návratu je zachováno americké nasazení `dpl_G8ZJ4eutmWx6gf1wVzFoGu422V6W`. Z odpovídajícího propojeného Vercel projektu lze po ověření aktuálního stavu použít `vercel promote dpl_G8ZJ4eutmWx6gf1wVzFoGu422V6W --yes`; následně je potřeba ověřit doménu a zopakovat HTTP kontroly. Návrat nemá datovou migraci. Pro trvalý návrat dalších sestavení do USA je nutné zároveň upravit region v `vercel.json`; samotné přepnutí na staré nasazení lokální konfiguraci nemění.
