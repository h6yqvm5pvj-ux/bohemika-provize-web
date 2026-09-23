**Přihlášení a povinné nastavení 2FA**

Chybějící TOTP účet nedeaktivuje. Uživatel se přihlásí heslem na `/login`, potvrdí nový šestimístný kód ze svého e-mailu, přidá účet do Authenticatoru a zadá jeho aktuální kód. Po úspěchu aplikace automaticky dokončí přihlášení. Administrátor nemusí účet znovu aktivovat. Stejný postup platí po resetu 2FA.

Historicky ověřený e-mail nestačí: každé nové nastavení 2FA vyžaduje čerstvý kód do aktuální schránky. U dosud neověřené adresy stejný kód zároveň umožní serveru dokončit ověření přes Firebase akci svázanou s adresou; klient obnoví token před vytvořením TOTP. Samostatný e-mailový odkaz není v tomto postupu potřeba. Dřívější dočasná operátorská výjimka bez e-mailu je zrušená. Existující přihlášení s již nastaveným TOTP se nemění.

Přihlášení heslem se předá do oddělené relace pouze v paměti. Do potvrzení obou kódů nevzniká aplikační session a uživatel nemá přístup k API ani obchodním datům ve Firestore. Heslo ani token se nepředávají přes URL nebo browser storage. Po obnovení stránky a ztrátě rozpracované relace se uživatel vrací na `/login`. Výslovné zahájení přes `/ucet/zabezpeceni?recovery=1` zůstává dostupné.

E-mailový kód je svázaný s účtem, jeho aktuální adresou a čerstvým přihlášením heslem. Platí deset minut, má nejvýše pět pokusů a nelze ho použít opakovaně. Opakované zaslání má minutový odstup a nejvýše tři žádosti za deset minut. Teprve platný kód dovolí serveru zahájit TOTP a vrátit klíč pro lokální QR. Enrollment session zůstává šifrovaná na serveru.

Záznam `accountBlocks` s důvodem `missing-totp` představuje pouze podmínku dokončení nastavení, nikoli deaktivaci přihlášení. Po ověření TOTP server transakčně odstraní tuto podmínku, zachová revokace starých relací a vydá přihlašovací token přes chráněnou Auth fasádu. Neúspěšné automatické přihlášení po dokončeném nastavení nabídne návrat na login; uživatel použije heslo a Authenticator. Nezávislá blokace administrátorem ani souběžný reset se automaticky nemažou. Přidání faktoru přímo přes Firebase nesplní rozpracovanou podmínku e-mailového potvrzení.

V administraci je účet bez 2FA označen jako „Aktivní · nastavení 2FA“. Reset odstraní starý faktor a zneplatní relace, ale aktivní účet nedeaktivuje. Pokud administrátor účet nezávisle zablokoval, reset ho neodblokuje. Akce „Zablokovat účet“ dál uzavírá přihlášení i data. Reset se provádí až po ověření totožnosti žadatele; správce od něj nevyžaduje heslo, TOTP klíč ani jednorázové kódy.

**Převod historických automatických blokací**

`node scripts/migrate-mfa-setup.mjs` vypíše pouze souhrnný plán. Po nasazení nové verze `node scripts/migrate-mfa-setup.mjs --apply` převede staré záznamy `missing-totp` na povinné nastavení a povolí dříve deaktivované účty. Smaže i stará oprávnění k přeskočení e-mailu. Jiné blokace a probíhající revokace ponechá. U dokončeného starého nastavení vyžaduje shodu faktoru a záznamu e-mailového potvrzení; nejasný stav označí `requires-reset` a nemění ho. Skript lze opakovat, nevypisuje osobní údaje a nemaže účty ani obchodní data.

Operátorské příkazy `scripts/account-recovery.mjs prepare|activate UID [--apply]` zůstávají pouze pro řešení historických stavů. Normální nastavení je již nepotřebuje.

**Doručování kódu**

Server potřebuje `RESEND_API_KEY` a `AUTH_EMAIL_FROM` s ověřeným odesílatelem domény bohemka.app. Přijetí zprávy poskytovatelem není důkaz doručení do schránky; vstup povolí až skutečně zadaný správný kód. Při chybě odeslání se výzva zneplatní a stránka nabídne opakování. Místní vývoj bez poštovní konfigurace odkáže na produkční přihlášení. Produkční citlivé hodnoty se nevypisují do logů ani neexportují přes diagnostická API.
