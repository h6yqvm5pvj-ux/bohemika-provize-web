# Oprava revokace přihlášení — 17. 9. 2026

Stav: oprava je připravená v pracovním stromu. **Produkční aplikace ani pravidla zatím nebyly změněny touto opravou.** Automatická kontrola oprávnění zamítla i přípravu samostatného produkčního deploymentu na Vercelu: pokyn k opravě nepovažovala za souhlas s nahráním soukromého kódu. Před nahráním a následným přepnutím aplikace i pravidel je nutný souhlas uživatele. Starší auditní podklady popisují historické nasazení.

## Co oprava pokrývá

- Každá odvolávající operace nejprve transakčně zapíše serverový záznam `accountBlocks/{uid}.revocation`. Existující trvalé blokace ve stejném dokumentu se zachovávají. Ten kontrolují Firebase Admin facade, serverové cookies a všechna povolující pravidla Firestore. Během operace je přístup uzavřený; časy jsou zaokrouhlené do následující sekundy, takže neprojde ani token vzniklý ve stejné sekundě.
- Odhlášení ostatních zařízení, administrátorské odvolání relací, citlivé změny účtu, změny claims a smazání účtu procházejí společnou vrstvou. Každá souběžná operace má vlastní příznak; dokončení starší operace nepřepíše novější revokaci ani neodblokuje stále běžící operaci.
- Passkey/custom token nese podepsanou generaci revokace. Dříve vydaný custom token nelze po odvolání úspěšně vyměnit za oprávněný přístup, ani když Firebase výměně přiřadí novější `auth_time`.
- Potvrzení obnovy hesla z e-mailu nově volá vlastní serverové API. Server nejprve ověří jednorázový kód u Firebase bez jeho spotřebování, odvodí účet z odpovědi Firebase a uzavře přístup před samotnou změnou hesla. Endpoint omezuje velikost vstupu, původ a četnost požadavků a nevypisuje hesla ani kódy.
- Cookies nových relací obsahují čas skutečného ověření identity. Zpožděný požadavek založený na starém přihlášení si vytvořením novější cookie neobnoví přístup.
- Povinné přihlášení se v pravidlech kontroluje u každého `allow`. Kontroly manažerů byly zjednodušené, aby opakované vyhodnocování revokace a předchozích nadřízených nevyčerpalo limit výrazů. Regresní testy zahrnují posledního manažera v obou desetiprvkových seznamech a osm úrovní nadřízených/podřízených.
- Součástí připraveného nasazení je i dříve otestovaná oprava podvržených IP adres v evidenci zařízení.

## Výsledky ověření

| Kontrola | Výsledek |
| --- | --- |
| Aplikační testy | 4 241 prošlo, 282 souborů |
| Firebase Auth + Firestore emulátory | 287 prošlo, 8 souborů |
| TypeScript | Bez chyb |
| ESLint | 0 chyb, 4 dřívější varování navigace |
| Produkční sestavení | Prošlo na místním macOS; syntetická konfigurace; autentizační proxy zaregistrovaná |
| HTTP sestavené aplikace | 7 kontrol prošlo: CSP/nonce, přesměrování nepřihlášených návštěvníků, nový endpoint odmítá cizí původ a nesprávný typ obsahu |
| Skutečně vydaný starý token | Před revokací Firestore 200, po revokaci 403; samostatný původní Admin SDK token také odmítne |
| Výměna starého custom tokenu po revokaci | Firestore 403 |
| Nové přihlášení | Firestore 200; po přidání trvalé blokace i tento čerstvý token dostane 403 |

Celkem **4 528 testů**. [Strojový souhrn a otisky zdrojů](./verification.json), [důkaz revokace](./revocation-proof.json), [HTTP kontroly](./local-http.json). Po změně pravidel byly zopakovány všechny integrační testy, po konečném sjednocení záznamů také celá aplikační sada, TypeScript, lint a build. Emulátorové passkey scénáře používají skutečné custom/ID tokeny se syntetickým serverovým důkazem MFA; neověřují skutečné hardwarové passkey nebo TOTP zařízení.

## Provozní postup

Nasadit společně aplikaci i Firestore pravidla: nejprve sestavit a ověřit samostatný produkční deployment, přepnout aplikaci, poté publikovat otestovaný `firestore.rules` a zpětně ověřit shodu zdroje. Pravidla jsou kompatibilní s účty, které zatím revokační záznam nemají. Samotné nasazení bez nové revokace plošně neodhlašuje uživatele. Nové revokace vyžadují nové přihlášení; nepoužívat mazání záznamu jako způsob obnovení přístupu.

Pro běžné odvolání použít administraci aplikace nebo `node scripts/revoke-account-sessions.mjs UID` (pouze kontrola) a následně stejný příkaz s `--apply`. Skripty změn admin claims, obnovy účtu a dřívější bezpečnostní nápravy nyní používají stejnou vrstvu. Nikdy nevkládat skutečné UID nebo přihlašovací údaje do veřejných protokolů.

Pád procesu nebo chyba při závěrečném zápisu může ponechat `pendingOperations` neprázdné. Účet pak zůstane uzavřený i pro nové přihlášení. Nejprve ověřit stav Auth a určit, které operace se dokončily; při údržbě zastavit všechny změny daného účtu. Ponechat záznam, znovu odvolat obnovovací tokeny v Auth a teprve po potvrzení úspěchu transakčně v poli `revocation` nastavit novou náhodnou generaci, nový čas minimálně `floor(now/1000)+1` a odstranit ověřeně opuštěné příznaky. Zápis podmínit nezměněnou verzí záznamu a případnou souběžnou změnu řešit znovu. Při opravě zachovat všechny trvalé blokující údaje mimo pole `revocation`. Příznaky nemají automatické vypršení: to by mohlo po chybě znovu otevřít staré přihlášení. Tento nouzový postup nebyl prováděn na skutečném účtu.

## Meze ověření

Ochrana okamžité revokace se vztahuje na uvedené aplikační cesty a aktualizované správcovské skripty. Přímé změny v konzoli Firebase, samostatných Cloud Functions nebo přes klientské Auth API mimo tento server záznam samy nevytvoří. To zahrnuje stávající klientské odregistrování MFA. Takové zásahy vyžadují koordinované odvolání uvedeným nástrojem; nelze o nich tvrdit stejnou okamžitou ochranu přímého Firestore přístupu. Zdrojové kódy samostatných Cloud Functions nejsou součástí tohoto repozitáře. Tato oprava neprokazuje úplnou bezpečnost celé infrastruktury.

Testy revokace používají skutečně vydané tokeny výhradně lokálních Firebase emulátorů a syntetické účty. Nikdo nebyl přihlášen za skutečného uživatele, nebylo měněno jeho heslo a nebyly mu odvolány relace. Místní build používá syntetickou konfiguraci v odděleném `/tmp` adresáři. Produkční build na Linuxu a ověření živých pravidel zbývají po schválení nasazení.

Princip návaznosti databázových pravidel na evidenci revokace popisuje [Firebase Admin — správa relací](https://firebase.google.com/docs/auth/admin/manage-sessions). Ověření kódu před jeho spotřebováním vychází z [oficiální specifikace `accounts.resetPassword`](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/resetPassword).
