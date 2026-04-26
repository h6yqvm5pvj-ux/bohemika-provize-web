# Security Audit Summary: Integrace ČPP Extranet (SOAP)

Datum auditu: 23. 4. 2026  
Projekt: `bohemika-provize-web`  
Scope: Integrace `StavSmlouvyZP` přes `https://wsextra.cpp.cz/extranet/extranet.asmx`, API vrstva Next.js, auth/autorizace, ukládání statusu smluv.

## 1) Executive Summary

Integrace je navržená tak, aby komunikace s ČPP probíhala pouze server-server přes HTTPS a nikdy přímo z klienta s tajnými údaji. To je správný základ.

K dnešnímu dni je sync ČPP statusu v kódu **explicitně vypnutý** (`CPP_STATUS_SYNC_ENABLED = false`), takže produkční riziko z této konkrétní funkce je aktuálně nízké.

Pokud bude sync zapnut, řešení je použitelné, ale před go-live doporučuji doplnit několik kontrol (viz sekce 4), hlavně:
- centralizovaný rate limit (ne jen in-memory),
- robustnější XML parser místo regex,
- hardening kolem minimizace dat a provozního monitoringu.

## 2) Ověřená fakta (k 23. 4. 2026)

### ČPP endpoint a protokoly
- Endpoint je dostupný na `https://wsextra.cpp.cz/extranet/extranet.asmx`.
- Ve veřejné service dokumentaci jsou dostupné obě varianty: **SOAP 1.1 i SOAP 1.2**.
- Operace `StavSmlouvyZP` používá SOAPAction `https://extranet.cpp.cz/StavSmlouvyZP`.

### Transport security (TLS)
- Ověřeno živě: endpoint akceptuje **TLS 1.2**.
- Ověřeno živě: **TLS 1.0 a TLS 1.1 jsou odmítnuté** (handshake failure).
- Ověřeno živě: certifikát `*.cpp.cz` je validní, vystavitel DigiCert/Thawte, platnost od 16. 2. 2026 do 19. 3. 2027.

### Chování endpointu při neplatném partnerovi
- SOAP request s neplatným `IDpartner` vrací HTTP 200 a business chybu v XML:
  - `PrubehOK=false`
  - `Popis=Partner nenalezen.`

## 3) Co je v projektu už teď správně

### Server-side only integrace
- Volání ČPP je implementováno v backend API (`src/app/api/contracts/_lib/contractsApi.ts`), ne v klientu.
- `IDpartner` je čteno z environment proměnných (`CPP_WSEXTRA_IDPARTNER` / `CPP_IDPARTNER`), není hardcoded v UI.

### AuthN/AuthZ
- API vyžaduje Firebase bearer token, validace přes `verifyIdToken(..., true)` (kontrola revokace).
- Přístup ke smlouvě je omezen na ownera a jeho oprávněnou hierarchii.
- Firestore pravidla blokují přímý klientský zápis do `users/{userEmail}/entries/{entryId}` (zápis jen přes backend/Admin SDK).

### Input validace a ochrana proti zneužití
- Patch endpointy validují povolená pole a datové typy (`normalizePatchUpdates`, whitelist).
- Je zaveden rate limiting pro `GET/POST/PATCH/DELETE` contracts API.
- Na externí call je timeout přes `AbortController` (20 s).

### Logování a citlivá data
- Kód neloguje SOAP request/response payloady ani `IDpartner`.
- Z odpovědi `StavSmlouvyZP` se ukládají jen nutná pole pro status (`contractNumber`, `status`, `endDate`).

## 4) Nálezy a doporučení před zapnutím produkční synchronizace

## Vysoká priorita

1. Distribuovaný rate limit  
Současný rate limiter je in-memory (`globalThis`), tedy per-instance. Ve škálovaném prostředí lze limit obejít rozdělením provozu mezi instance.  
Doporučení: přesunout limit do Redis/Firestore/Cloud Memorystore.

2. Robustní XML parsing  
SOAP response je parsována regexem (`extractXmlBlocks`), což je křehké na edge-cases XML namespace/struktury.  
Doporučení: použít bezpečný XML parser (`fast-xml-parser` / `xmldom` + strict mode), explicitně mapovat očekávané elementy.

## Střední priorita

3. Data minimization / privacy hardening  
Volání `StavSmlouvyZP` vrací široký dataset (včetně osobních údajů), i když aplikace využívá jen malou část.  
Doporučení: u ČPP ověřit nejméně datový režim (parametry/alternativní operace), interně zavést DPIA záznam a retention policy.

4. Hardening CSP režimu  
Middleware má strict nonce CSP, ale enforce je podmíněný env (`CSP_STRICT_ENFORCE`).  
Doporučení: v produkci vynutit strict CSP enforce režim a průběžně monitorovat reporty.

5. Explicitní oddělení “disabled” route  
`/api/contracts/sync-cpp-status` aktuálně vrací statickou odpověď bez auth (bez side effect).  
Doporučení: vracet 404/410 nebo přidat stejný auth guard jako ostatní contracts endpointy pro konzistenci.

## Nízká priorita

6. Sanitizace hodnot v SOAP envelope  
`IDpartner` a `dateFrom` jsou skládány přímo do XML stringu.  
Doporučení: přidat XML escaping helper i pro “trusted” vstupy (defenzivní programování).

## 5) Go-Live rozhodnutí (k dnešku)

Stav k 23. 4. 2026:
- Integrace ČPP sync je v kódu přítomná, ale **vypnutá**.
- Bezpečnostní základ je dobrý (server-side call, auth/autorizace, validace, timeout).
- Pro bezpečný produkční provoz doporučuji před zapnutím implementovat body 1 a 2 z vysoké priority.

Po splnění těchto bodů je řešení vhodné k nasazení z hlediska bezpečnosti a provozní odolnosti.

## 6) Relevance kódu (reference)

- `src/app/api/contracts/_lib/contractsApi.ts`
  - SOAP endpoint + action: řádky kolem `511`, `512`, `2529+`, `3764+`
  - auth context: `2986+`
  - rate limiting: `3068+`, `3316+`, `3650+`, `4179+`
  - update whitelist validace: `2016+`
- `src/lib/server/rateLimit.ts`
- `src/lib/server/firebaseAdmin.ts`
- `firestore.rules` (zápis do entries pouze admin/backend)
- `middleware.ts` (CSP + connect-src)
- `next.config.ts` (security headers včetně HSTS)

