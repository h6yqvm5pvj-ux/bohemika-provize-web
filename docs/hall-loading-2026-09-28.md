# Načítání Síně slávy

Síň slávy při obnově součtů používala dotaz podle poradců, který načetl celou historii jejich smluv. Časové období se omezovalo až po přenosu ze serveru. Nový `readHallEntryDocuments` omezuje datum sjednání i vytvoření v databázi na nejdelší nabízené období (12 kalendářních měsíců včetně aktuálního, do konce dneška).

## Zachování výsledků

- Období se počítá v Europe/Prague včetně změny letního času a roku, nezávisle na časovém pásmu serveru. Pozdější čas dnešního dne se započítává stejně jako dosud.
- Datum sjednání má přednost; datum vytvoření je náhradou pouze při chybějícím/null datu sjednání. Nedávno importovaná stará smlouva se proto nestane aktuální produkcí. Přítomné neplatné datum sjednání nadále nezpůsobí použití data vytvoření.
- Databázové Timestamp a číselné milisekundy mají samostatné omezené dotazy. Spodní hranice Timestamp dotazu má rezervu jedné milisekundy: Admin SDK při `toDate()` zaokrouhluje jemnější přesnost a záznam těsně před půlnocí mohl dosavadní výpočet započítat do následujícího dne. Konečný filtr používá stejný převod jako dříve.
- Textová data, česká data, serializované timestampy a další původně podporované formáty zůstávají v samostatném kompatibilním čtení. To využívá řazení podle typu prostřednictvím `orderBy(...).startAt("")`. Tyto starší formáty nelze bezpečně omezit společným časovým filtrem, proto se jejich historie stále čte. Nepřepisujeme smlouvy ani jejich data.
- Výsledky dotazů se slučují podle plné cesty dokumentu. Zachovává se původní pořadí dokumentů při starších duplicitách se stejným poradcem a ID na různých cestách. Převzaté smlouvy, kategorie, pojistné, všechny čtyři intervaly a řazení výsledků se zpracovávají původním kódem.
- Na dávku nejvýše deseti poradců připadá šest dotazů, z toho nejvýše dva současně. Dosavadní limit osmi dávek znamená nejvýše šestnáct souběžných dotazů na smlouvy. Používají se existující skupinové indexy `userEmail + contractSignedDate` a `userEmail + createdAt` ve vzestupném pořadí; soubor indexů se nemění.

## Souběžné změny a cache

Při změně revize během čtení se nově znovu načítají pouze dotčení poradci, nejvýše třikrát. Starší výsledek se nevrátí ani neuloží do minutové paměťové cache. Pokud se zdroj nepřestane měnit nebo některý dotaz selže, stránka dostane chybu a může načtení zopakovat; neúplný žebříček se nezobrazí jako úspěšný.

Při pouhém selhání zápisu cache lze dál použít vypočtené hodnoty, ale až po samostatném úspěšném ověření revizí. Nelze-li ověřit ani revize, načtení selže. Verze uložených součtů je zvýšena na 2; první návštěva po vydání je přepočítá. Další návštěvy opět používají uložené součty. Dosavadní minutová cache hotového žebříčku, kontrola českého dne, autorizace a oddělení identity návštěvníka se nemění.

## Ověření a praktické meze

- Aplikační sada: 5 155 testů ve 353 souborech prošlo. Po zpřesnění zaokrouhlování času prošlo znovu všech 44 cílených testů a 10 databázových testů Síně slávy a domovské stránky.
- Celá databázová sada na čerstvých lokálních emulátorech: 317 testů prošlo, 1 volitelný benchmark se přeskočil. Finální produkční sestavení, TypeScript, ESLint a kontrola diffu prošly.
- Skutečný lokální Firestore emulátor porovnává původní úplný dotaz s novými dotazy: native Timestamp, číselná, textová i česká data, mapy a pole, chybějící a neplatná data, překryvy dotazů, starší importy, převzaté smlouvy, půlnoc a jemnější časová přesnost, změna času a roku. Shodují se položky i výsledné žebříčky pro všechna čtyři období.
- Ověřeno přidání, změna pojistného, přesun data mezi obdobími, převod, odstranění a změna probíhající během výpočtu. Pokryté jsou také chyby čtení a zápisu cache, opakovaná změna revize a použití uložených součtů bez dalšího čtení smluv.
- Syntetický vzorek obsahuje 1 000 starých smluv a 12 aktuálních. Původní dotaz načte 1 012 dokumentů; nové dotazy načtou celkem 24 dokumentů (aktuální smlouvy se vracejí podle obou dat) a po sloučení zůstane 12. Další načtení uložených součtů provede nula dotazů na smlouvy.
- Jde o počet vrácených dokumentů ve vzorku, nikoli měření produkční latence nebo vyúčtovaných čtení. Největší přínos se očekává u rozsáhlejší historie uložené jako databázová data. U portfolia obsahujícího převážně aktuální smlouvy nebo staré textové formáty nemusí být první načtení rychlejší: více dotazů má vlastní režii. Již uložené součty se používají stejně jako dříve.

Lokální záznamy ověření jsou v ignorovaném `.tmp/hall-loading-20260928/`. Úprava je zahrnuta do [kompletního vydání z 28. 9. 2026](all-changes-release-2026-09-28.md).
