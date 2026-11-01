# Následné C provize Kooperativy Auto

U produktu `kooperativaAuto` odpovídá výpisový kód `C1xx` následné provizi `B1xx` se stejným číselným pořadím: například `C102` patří k `B102`, `C103` k `B103`. Pravidlo je omezené na tento produkt; ostatní C kódy ani jiné produkty se nepřevádějí.

Cashflow a detail smlouvy používají shodné porovnávání kódů. Skutečná výplata nahradí odpovídající očekávanou provizi automaticky. Původní C kód, skutečně vyplacená částka, měsíc výplaty a zdrojový výpis zůstávají zachované. Výše částky ani blízkost data neurčují pořadí splátky. Záporné opravy a storna zůstávají samostatnými skutečnými pohyby.

Import výpisů porovnává C provize se stejnými očekáváními jako odpovídající B provize. Skutečný nedoplatek se stále zobrazí jako rozdíl. Vyšší skutečná výplata sama o sobě není nedoplatek. Filtr následných provizí v kontrole zahrnuje i tyto C výplaty.

Ruční přiřazování bylo odstraněno. Starší uložené `cashflowPayoutMatches` již neovlivňují výpočet; není nutná migrace ani změna výpisových záznamů. Starý endpoint `/api/contracts/payout-plan` po ověření přihlášení a rozsahu přístupu vrací `410 Gone` a nic nečte ani nezapisuje do smlouvy.

Ověření pokrývají testy společných pravidel kódů, cashflow generátoru, detailu smlouvy, importu výpisů, kontroly provizí a ukončeného endpointu. `tests/firestore/cashflowPayoutMatching.test.ts` ověřuje automatické promítnutí přes smluvní API, soukromí příjemců a absenci zápisů ze starého endpointu v lokálním emulátoru.
