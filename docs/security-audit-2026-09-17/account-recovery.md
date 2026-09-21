**Obnovení účtu po blokaci kvůli chybějícímu TOTP**

Účty bez TOTP nemají přístup k aplikaci, API ani přímému Firestore. Stejná podmínka platí pro tipaře a administrátory. Reset 2FA v administraci nyní účet zároveň zablokuje.

Administrátor nejprve nezávisle ověří totožnost žadatele. TOTP klíč ani jednorázové kódy si od něj nevyžaduje. Nesmí nahrazovat ztracený faktor pouhým odblokováním v konzoli Firebase.

1. Z Firebase Authentication zjistit UID účtu. Spustit `node scripts/account-recovery.mjs prepare UID` pro kontrolu a potom stejný příkaz s `--apply`. Umožní pouze autentizaci potřebnou pro nastavení; trvalá blokace obchodních dat zůstává.
2. Je-li potřeba ověřit e-mail, stránka nastavení po přihlášení vyžádá ověřovací e-mail přímo přes Firebase. Uživatel otevře odkaz ve své schránce, vrátí se na stránku nastavení a klikne na „E-mail je ověřený, pokračovat“. Před vytvořením TOTP klíče stránka znovu ověří aktuální stav účtu a obnoví token. Vlastnictví adresy se administrátorsky nepotvrzuje bez skutečného ověření.
3. Uživatel otevře `https://bohemka.app/ucet/zabezpeceni`, přihlásí se svým heslem a nastaví TOTP ve své autentizační aplikaci. Odkaz na nastavení se zobrazuje také při blokaci na přihlašovací stránce. Stránka používá oddělenou relaci jen v paměti, nečte obchodní data a nevytváří aplikační cookie.
4. Administrátor spustí `node scripts/account-recovery.mjs activate UID` a po úspěšné kontrole stejný příkaz s `--apply`. Aktivace vyžaduje aktuálně zapsaný TOTP a ověřený e-mail; poté zneplatní staré relace a odstraní pouze blokaci typu `missing-totp`.
5. Uživatel se přihlásí znovu na `/login` heslem a TOTP. Následně může používat svůj registrovaný passkey.

Skript nesděluje UID, adresy, hesla ani klíče do logů. Přístup k místním servisním přihlašovacím údajům mají mít pouze oprávnění správci. Nově založený účet také nedostane přístup k datům před TOTP a ověřením e-mailu; tento oddělený postup nastavení lze použít i pro něj.
