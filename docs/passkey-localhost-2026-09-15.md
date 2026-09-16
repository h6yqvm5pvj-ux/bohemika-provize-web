# Passkey na localhostu — 15. 9. 2026

Opraveno čekání bez konce při přihlášení přístupovým klíčem. Příprava a serverové ověření mají limit 15 sekund včetně čtení odpovědi. Ověření zařízením má samostatný limit 60 sekund a během přípravy i ověřování je dostupné tlačítko **Zrušit přihlášení**. Pozdější odpověď již zrušeného či vypršelého kroku nepokračuje k přihlášení.

## Zjištění

Uživatelův log ukazuje přípravu `/api/auth/passkeys/authentication-options` trvající 21,5 až 95 sekund a později `TypeError: Failed to fetch` při restartu serveru. To nastávalo před ověřením zařízením. Klient neměl časový limit tohoto požadavku a už během čekání na server vyzýval k otisku.

Při aktuální diagnostice již stejný endpoint odpověděl HTTP 200 za 644 ms, s RP ID `localhost` a limitem pokusů uloženým ve Firestore. Nezávislá čtení náhodného neexistujícího diagnostického dokumentu trvala 331 ms přes REST a 430 ms přes gRPC. Dlouhé zdržení ze snímku se v tomto měření neopakovalo; konkrétní síťová příčina proto není prokázaná. Transport Firebase ani nastavení domén se neměnily.

## Změny

- [passkeys.ts](../src/app/lib/passkeys.ts): časové limity, rušení požadavků i dialogu zařízení, ochrana před pokračováním opožděné odpovědi, česká chyba při nedostupném serveru a možnost znovu načíst browser modul po selhání.
- [Přihlášení](../src/app/login/page.tsx): rozlišení přípravy, ověřování a dokončení; zrušení aktuálního pokusu a úklid při odchodu ze stránky. Kontrola limitu přihlášení má také časový limit. Běžné zrušení už nevytváří chybový záznam v Next dev overlay.
- [Loader](../src/app/login/PasskeyLoginLoader.tsx): odpovídající text jednotlivých kroků a tlačítko pro zrušení.

Rušení aktivního WebAuthn dialogu používá veřejné API `WebAuthnAbortService.cancelCeremony()` z instalované knihovny. [Dokumentace SimpleWebAuthn](https://simplewebauthn.dev/docs/13.3.x/packages/browser#webauthnabortservice).

## Ověření

Cílených 23 testů přihlášení a passkey prošlo. Zahrnují vypršení požadavku, čekání na tělo odpovědi, ignorování opožděné odpovědi, opakování přihlášení, zrušení a vypršení dialogu zařízení a zachování kontrol účtu i serverové relace.

Finální celá sada prošla: 2 569 testů ve 253 souborech. TypeScript, cílený ESLint a kontrola whitespace prošly. První celý běh zachytil nesouvisející nestabilní test `AuthEmailActionPage.test.tsx` (dvojí událost změny URL); beze změny tohoto souboru prošel samostatný i následný celý běh.

V izolovaném Chrome na skutečné místní přihlašovací stránce prošlo pět scénářů: zrušení přípravy, patnáctisekundový timeout, nedostupný server, nový pokus po chybě a zrušení ověřování zařízením. Naměřený návrat k formuláři po timeoutu byl 15,5 sekundy včetně čekání automatizace. Po zrušení nebyl odeslán požadavek k dokončení autentizace. Ověřeno také na šířce 390 px. API a dialog zařízení byly v těchto prohlížečových scénářích nahrazeny syntetickými odpověďmi.

Skutečné přihlášení uživatelovým otiskem ani dostupnost jeho konkrétního klíče v systémové klíčence nebyly provedeny. Místní příprava passkey byla měřena jedním běžným požadavkem, který vytvořil pouze dočasnou přihlašovací výzvu. Klientské a obchodní dokumenty se nečetly ani neměnily. Změna není nasazená na produkci.
