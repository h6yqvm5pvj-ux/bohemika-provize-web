# Přehled přihlášení pro administrátory

Panel `/admin/zadosti?section=loginActivity` umožňuje filtrovat přihlášení a pokusy podle období, země, výsledku a účtu. Zahraniční IP může patřit uživateli na cestách nebo VPN; sama o sobě neprokazuje útok. Země bez důvěryhodných údajů zůstává neznámá. Počty a filtry se vztahují na načtené stránky; další načte tlačítko „Načíst starší historii“.

## Zdroje a hranice důkazů

- **Web:** úspěšný vstup vytváří `_authActivity` záznam atomicky se serverovou relací. Když zápis selže, relace nevznikne. Odmítnuté požadavky na vytvoření relace a ověření passkey se zapisují bez původních tokenů. HTTP 429 se jednotlivě neukládají. Opakovaná shodná odmítnutí se v minutovém okně slučují, takže jde o historii událostí, nikoli přesný počet požadavků. Při výpadku úložiště zůstává požadavek odmítnut, ale záznam může chybět; server vydá `AUTH_ACTIVITY_WRITE_FAILED`.
- **Hlášení prohlížeče:** neúspěch hesla / 2FA nahlášený klientem nemůže potvrdit vlastnictví uvedeného účtu. Přímý klient může takové hlášení vynechat nebo poslat nepravdivé. Proto má jiný výsledek i zdroj než serverem ověřené události. Chyba 2FA nemění počítadlo neúspěšných hesel.
- **Firebase:** oddělený zdroj čte přímo Identity Platform activity logs, včetně pokusů mimo web. Úspěšný první faktor není důkaz dokončeného MFA či přístupu do aplikace. Provider někdy neposkytuje výsledek nebo e-mail; panel je nevymýšlí. Logy mohou mít zpoždění a neposkytují zemi. Aktivity před zapnutím loggingu nelze obnovit.
- **Starší relace:** jednorázový opakovatelný převod dostupných záznamů. Poloha může být poslední pozorovaná poloha relace; odlišný čas je v tabulce uveden. Nová přihlášení se tímto převodem neduplikují. Neuložené starší neúspěchy nelze zpětně vytvořit.

Přehled se obnovuje tlačítkem; automatické notifikace ani blokování zemí neprovádí.

## Ochrana dat

API `/api/admin/login-activity` vyžaduje serverem ověřenou roli `admin`, platnou současnou identitu a společnou bezpečnostní politiku účtu (MFA, blokace, odvolání tokenů). Odpovědi mají `private, no-store`; API má limit 30 požadavků za minutu na administrátora. Firestore pravidla zakazují přímý klientský přístup i klientům s administrátorským tokenem.

Web ukládá pouze e-mail, výsledek, krok, čas, důvěryhodnou zemi/město, zkrácenou IP a stručné zařízení. Neukládá hesla, OTP, bearer tokeny, cookies ani session ID. Geografická metadata přijímá pouze na Vercelu spolu s platnou důvěryhodnou IP. Do odpovědí Firebase se vybírají pouze výslovně povolené položky; původní request/response se nevracejí.

Webová historie má 90denní TTL v poli `expiresAt` a dotaz omezený obdobím. Mazání pomocí Firestore TTL je asynchronní. Firebase historie používá existující 30denní bucket `_Default` a pohled `bohemika_auth_activity`, jehož filtr je omezený na log `identitytoolkit.googleapis.com/requests`. Runtime dostává `roles/logging.viewAccessor` pouze na tomto pohledu, žádné oprávnění k ostatním logům. Původní cloudové logy mohou obsahovat více osobních údajů než maskovaný přehled.

## Nasazení

Konfiguraci mění identita operátora přes `firebase login` nebo výslovný `GOOGLE_OPERATOR_ACCESS_TOKEN`, nikoli runtime aplikace. Nastavení může podléhat běžnému účtování Google Cloud podle objemu; nevyžaduje placený Vercel Observability doplněk.

```sh
node scripts/configure-login-monitoring.mjs prepare .tmp/login-monitoring-release
node scripts/configure-login-monitoring.mjs apply .tmp/login-monitoring-release
node scripts/configure-login-monitoring.mjs verify .tmp/login-monitoring-release
node scripts/backfill-login-activity.mjs
# Teprve po nasazení nové webové verze:
node scripts/backfill-login-activity.mjs --apply --activate-web
```

`prepare` uloží původní konfiguraci pro kontrolu. `apply` zapne logging, nastaví omezený pohled, přístup a TTL; stávající nesouvisející pole ani oprávnění nemaže. `verify` ověří nastavení. Převod je ve výchozím stavu pouze čtení; `--apply` vytváří deterministické historické záznamy a nikdy nepřepisuje existující. `--activate-web` zaznamená začátek nasazeného sledování, aniž by při opakování posunul již uložený čas.

Po nasazení ověřit: odmítnutí neautorizovaného API požadavku; atomický zápis relace a auditu; skutečný syntetický neúspěch provideru bez reálného účtu; úspěšné čtení vyhrazeného logového pohledu runtime identitou a odmítnutí čtení `_AllLogs`; aktivaci TTL a historický převod. Soukromé výsledky patří do ignorovaného adresáře s omezeným přístupem, nikoli do Gitu.
