# Vlastní stránka pro potvrzení e-mailu a nové heslo

Stránka `/ucet/akce` používá český vzhled přihlášení a funguje bez přihlášeného účtu. Vydání navazuje na nasazené odesílání přes Resend. Stav nasazení a přesné otisky jsou v [záznamu vydání](security-audit-2026-09-13/auth-action-release.json).

Nasazeno 13. 9. 2026 v 13:07 CEST na `bohemka.app`, verze `dpl_48bcUawQaeF8e24MPLf5q6qQr9nz` ve Frankfurtu. Kontrola všech 1 246 nahraných souborů potvrdila shodu s otestovaným vydáním; změnilo se jen deset vyjmenovaných implementačních a testových souborů.

- Ověření: nejprve `checkActionCode` a kontrola typu `VERIFY_EMAIL`, poté explicitní tlačítko s `applyActionCode`. Pouhé otevření zprávy nepotvrdí adresu.
- Heslo: `verifyPasswordResetCode`, dvě shodná zadání hesla a `confirmPasswordReset`. Minimum je 8 znaků; případné přísnější požadavky Firebase se vynucují službou a chyba je přeložená. Stránka nikoho automaticky nepřihlašuje ani nemění role.
- Prošlý nebo neplatný/použitý odkaz má vlastní vysvětlení a postup k získání nového e-mailu. Síťová chyba umožňuje ruční opakování; automaticky se neprovádí další zápis.
- Nové odkazy vytvářené serverem míří na pevné `https://bohemka.app/ucet/akce`. Kód je ve fragmentu za `#`, takže se neposílá v HTTP požadavku na web. Po načtení se odstraní z aktuální adresy a zůstává pouze v paměti stránky.
- Pro kompatibilitu se čtou i standardní query parametry Firebase. Parametry s cizím API klíčem, účtem nebo návratovou adresou se ignorují; používá se konfigurace vlastního projektu a pevný návrat na `/login`. Duplicitní nebo rozporné parametry jsou odmítnuté.
- Odpověď má `no-store`, `no-referrer`, `noindex` a zákaz vložení do rámu. Na stránce se nezobrazuje e-mail ani jednorázový kód a nelogují se surové chyby Firebase.
- Další odkaz otevřený ve stejné záložce načte stránku znovu, aby se nezpracoval původní kód.

Není potřeba další proměnná prostředí, nová šablona Resendu ani změna globálních Firebase Templates. Dříve doručené odkazy nadále vedou na původní stránku Firebase; nově generované odkazy z aplikace používají vlastní stránku. Nepodporované akce, například vrácení změny adresy, se nepřesměrovávají z globálního Firebase handleru.

Ověření: 1 792 testů v 191 souborech, TypeScript, ESLint, produkční sestavení a kontrola registrace autentizační proxy. Místní Firebase Auth emulátor s blokovanou vnější sítí potvrdil jednorázové ověření, reset, odmítnutí použitých kódů, přihlášení novým heslem a odmítnutí starého. Chrome ověřil desktop, mobil i úspěšné/chybové stavy se smyšlenými odpověďmi Firebase. Při této úpravě se neposílal další skutečný e-mail ani se neměnil produkční účet.

Náhledy: [nové heslo](security-audit-2026-09-13/account-action-previews/reset-mobile.png), [ověření adresy](security-audit-2026-09-13/account-action-previews/verify-mobile.png), [prošlý odkaz](security-audit-2026-09-13/account-action-previews/expired-mobile.png).

Dokumentace: [Firebase – vlastní obsluha e-mailových akcí](https://firebase.google.com/docs/auth/custom-email-handler), [Firebase Admin – generování odkazů](https://firebase.google.com/docs/auth/admin/email-action-links).
