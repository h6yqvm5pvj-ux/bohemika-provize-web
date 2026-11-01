# Zápis a hledání klientských jmen

`src/app/lib/clientNamePresentation.ts` sjednocuje zápis osob při vytvoření a úpravě smlouvy, ve vracených smlouvách a v klientských kartách. Zachovává diakritiku, tituly a identitu klienta. Rozšíření Unicode nebo titulů nesmí změnit identitu ani překročit limit 200 znaků.

Firmy rozpoznané podle právní formy zachovávají původní obchodní název. Klientská karta s vyplněným IČO zachovává i značku bez právní formy. Samostatné velké zkratky zůstávají zachované. Bez právní formy nebo údaje o typu nelze obecně rozlišit osobu od obchodní značky; IČO se tímto pravidlem neověřuje.

Vyhledávání a nabídka shod používají samostatné firemní tokeny. Ignorují velikost písmen, diakritiku a pořadí slov a rozpoznávají varianty `sro`, `s. r. o.`, `s.r.o.` a neúplné `s.r.`. Formy `a.s.` a `s.r.o.` zůstávají odlišené. Opakovaná slova vyžadují odpovídající počet výskytů; samotná právní forma nevybere všechny firmy.

Vyhledávací shoda nemění ID klientské karty, neslučuje firmy a nerozšiřuje oprávnění. `clientIdentityKey()` a `clientSlugForName()` zachovávají původní význam. Případné budoucí skutečné sloučení vyžaduje ověřenou totožnost, vyřešení konfliktů a zachování vazeb i šifrovacího kontextu soukromých karet a poznámek.

## Oprava existujících rozdílů ve velikosti písmen

Servisní skript standardně pouze čte:

```sh
node scripts/normalize-client-name-case.mjs --project=FIREBASE_PROJECT_ID
```

Vybere pouze rozdílné varianty stejného jména v portfoliu téhož vlastníka. Zachovává diakritiku, pořadí slov, firmy i ID smluv. Výstup obsahuje jen počty a SHA-256 otisk konkrétního plánu, nikoli osobní údaje.

Po kontrole a schválení konkrétní opravy:

```sh
node scripts/normalize-client-name-case.mjs --project=FIREBASE_PROJECT_ID --apply --plan-hash=HASH_Z_NAHLEDU
```

Skript odmítne jiný projekt nebo změněný plán. Každou smlouvu znovu načte v transakci, ověří původní jméno, vlastníka a stabilní klientské ID a společně zapíše jméno, vyhledávací údaje, klientský index a šifrovanou historii. Neodstraňuje smlouvy, nepřesouvá karty a nepřestavuje tipařské výplaty. Respektuje stávající protokol sledování cashflow změn.

Po opravě ověří zapsané hodnoty. Nový samostatný náhled má pro opravené skupiny vrátit nulu. Zbývající firemní varianty vyžadují ověření obchodního názvu a IČO; tento skript je nepřejmenovává.
