# Kooperativa Auto: přiřazení C výplat k cashflow

C101 a další kódy řady C1xx se uchovávají jako původní kódy z výpisu. Legenda zpracovaných výpisů je označuje jako neočekávanou provizi; zahrnují také opravy. Čítač C není spolehlivým čítačem následných B provizí. Zúčtovací období výpisu samo neprokazuje pojistné období výplaty.

## Chování

- Kladná C výplata Kooperativy Auto je v cashflow označena „Vyplaceno — nepřiřazeno k plánu“, dokud není potvrzená vazba.
- U kladné C výplaty ve výpisu po prvním výročí smlouvy se navíc zobrazuje „Pravděpodobná následná provize“. Jde o vysvětlení časové návaznosti, nikoli důkaz konkrétního pojistného období. Stejné označení je v cashflow, historii provizí a přehledu přiřazení. Záporné řádky a C kódy s opravou stejného příjemce se takto neoznačují.
- V detailu smlouvy je sekce „Přiřazení C výplat k cashflow“. Načítá se až po otevření. Příjemce vybírá konkrétní nevyplacenou B provizi podle počátku období a plánovaného měsíce. Výběr není předvyplněný.
- Potvrzená vazba odstraní právě jeden odhad. Skutečná částka, měsíc výplaty, C kód a odkaz na výpis zůstávají zachované. Vazbu lze zrušit.
- C kódy jiných produktů, import výpisů, koeficienty a přepočty pojistného se tímto pravidlem nemění.
- Bez doloženého pojistného období nevzniká automatická vazba podle čísla C, podobnosti částky ani blízkosti měsíce. Nové nejednoznačné importy zůstávají k ručnímu přiřazení; již potvrzené vazby se automaticky promítají do výpočtu cashflow.
- Je-li výplata starší než všechna dostupná období plánu, přehled na to přímo upozorní. Rozestup skutečných výplat sám nemění evidovanou frekvenci placení pojistného.

## Uložení a kontroly

Samostatné pole `cashflowPayoutMatches` obsahuje klíč a otisk zdrojové výplaty, plánovaný kód/měsíc/počátek období/frekvenci a příjemce s časem a autorem potvrzení. Původní `commissionPayouts` se neupravují. Stejný import s novým časem zpracování vazbu zachová.

API `/api/contracts/payout-plan` používá čerstvá oprávnění, příjemce ze serverového kontextu a Firestore transakci s kontrolou revize náhledu. Správce může přiřadit svou meziprovizi ve vlastním plánu; nemůže tím měnit přiřazení jiné osoby. API filtruje uložené vazby stejnými pravidly jako výplaty. Sdílená historie zaznamená úkon bez částek a detailů výplaty. Uložení invaliduje cashflow cache.

Změna zdrojové částky/období/příjemce, chybějící řádek, změna frekvence, obsazený či odstraněný cíl, duplicitní kód nebo storno stejného C kódu původní vazbu zneplatní. Skutečné platby i opravy se dál zobrazují samostatně. Zneplatněnou vazbu lze zrušit nebo znovu potvrdit po kontrole podkladů.

Verze protokolu serverové cache a wire formátu se mění na v2, aby se nepoužily starší výsledky bez těchto informací.

## Ověření

- `src/app/cashflow/payoutPlanMatching.test.ts`: náhrada jediného odhadu, zachování skutečných výplat, žádné odhadované C→B převody, storna, opravy, zneplatnění, izolace příjemců a wire formát.
- `src/app/lib/kooperativaCPayoutMeaning.test.ts`: rozpoznání možné následné provize podle časové návaznosti, chybějící či neplatná data, opravy, oddělení příjemců a produktů.
- `src/app/api/contracts/payout-plan/route.test.ts`: oprávnění, zastaralý náhled, serverový plán, správce a odstranění vazby.
- `tests/firestore/cashflowPayoutMatching.test.ts`: skutečné transakce v lokálním emulátoru, souběžné potvrzení, filtrování citlivých údajů a načtení vazby přes cashflow API.
- Prohlížeč: načtení na vyžádání, prázdný výběr, potvrzení a zrušení, zachování storna; šířky 320, 390, 768 a 1100 px.

Soukromý náhled nad dříve načtenými výpisy je v ignorované `.tmp/kooperativa-codes-2026-09-18/matching-preview.json`. Kontrola nezapisuje do produkční databáze a neurčuje neprokázané vazby.
