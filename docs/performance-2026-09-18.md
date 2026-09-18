# Načítání administrace, pošty a síně slávy

## Administrace uživatelů

`GET /api/admin/users?view=directory` vrací seznam pro hledání, karty, filtry a souhrnné počty. Firestore čte jen potřebná profilová pole; časovou osu vyhodnotí server a do seznamu ji neposílá. MFA, online vizitka a časové údaje se načtou samostatně přes `?email=…` pro vybraný účet. Oba režimy zachovávají administrátorskou autorizaci a `Cache-Control: no-store`.

Rozpracovaný požadavek na detail se při změně výběru ruší. Opožděná odpověď nepřepíše jiný vybraný účet. Po uložení, bezpečnostní akci nebo změně vizitky se obnoví seznam i detail. Při přepnutí sekcí se seznam stejného administrátora může využít po dobu 30 sekund; ruční obnovení a změny tuto úsporu obcházejí.

## Síň slávy

Server ukládá čtyři malé souhrny kategorií každého poradce do `hallOfFameOwners/{hashEmail}`. Obsahují jen součty a revizi, nikoli smlouvy, kontakty nebo identitu návštěvníka. Nově spuštěný server načte souhrny hromadně místo opětovného čtení všech smluv. První návštěva po nasazení a první návštěva nového dne souhrny vytvoří.

Změny pojistného, frekvence, produktu, data podpisu, vlastníka nebo převzatého charakteru smlouvy zneplatní souhrn ve stejném Firestore batchi/transakci prostřednictvím `withContractHistory`. Převod zneplatní oba vlastníky. Přímé mazání smluv, odstranění duplicit a smazání uživatele přidávají vlastní invalidaci. Revize brání přepsání invalidace souběžně probíhajícím přepočtem. Následující čtení přepočítá pouze dotčené poradce.

Denní klíč používá `Europe/Prague`; změna dne obnovuje i hranice období a smlouvy s budoucím datem. Procesní cache hotových žebříčků zůstává 60 sekund, takže změna se může zobrazit s tímto zpožděním při dalším načtení. Nové importy nebo skripty zapisující přímo do smluv musí také volat `markHallOwnerDirty` ve stejné transakci/batchi. Přímé databázové změny bez invalidace se jinak projeví při denním přepočtu.

Pro existující kolekci nejsou potřeba nové indexy ani změny klientských pravidel; platí výchozí zákaz přímého klientského přístupu. Neúspěšné ukládání souhrnu neblokuje vrácení právě vypočteného výsledku.

## Pošta

Pravidelná kontrola pošty i počtu nepřečtených zpráv na domovské stránce se ve skryté záložce pozastaví. Návrat a událost focus sdílejí jedno obnovení. Souběžné periodické požadavky se slučují; změna zpráv během načítání vyvolá jeden následný dotaz.

Živý kanál se při skrytí odpojí. Otisk ID zpráv a přesných časů jejich aktualizace umožňuje přeskočit nezměněný úvodní snímek při opětovném připojení kanálu. Shluk událostí se slučuje; chybová připojení mají rostoucí prodlevu do 30 sekund. Po viditelném návratu se stav pošty znovu načte.

## Balíčky a ověření

Dialogy a PDF editory kalkulačky, další administrační sekce, panely výpisů a PDF export se načítají až při použití. Odvozená data a výpočty zůstávají beze změny.

Srovnání s předchozím místním produkčním sestavením (velikost JavaScriptu potřebného při prvním otevření; nejde o měření odezvy produkční sítě):

| Stránka | Před změnami, gzip | Po změnách, gzip |
| --- | ---: | ---: |
| Kalkulačka | 336 992 B | 321 370 B |
| Provizní výpisy | 332 815 B | 323 144 B |
| Administrace | 262 155 B | 257 557 B |

Ověřeno TypeScriptem, produkčním sestavením v oddělené kopii s testovací konfigurací Firebase, cílenými/regresními testy a místním Chromem s testovacími daty. Kontroly zahrnují souběžné změny souhrnů, přechod dne/roku, autorizaci seznamu a detailu, přepínání uživatelů, ukládání, skrytou záložku, obnovu kanálu a načtení dialogů až při otevření. Měření skutečné latence databáze a prohlížeče na produkci není součástí těchto lokálních kontrol.
