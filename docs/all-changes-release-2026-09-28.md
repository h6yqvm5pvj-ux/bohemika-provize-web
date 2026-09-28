# Kompletní vydání — 28. 9. 2026

Na výslovný pokyn uživatele „nahraj všechny změny“ jsou do jednoho vydání zahrnuty všechny dosavadní změny aplikace, skriptů, pravidel, cloudových funkcí, testů a dokumentace.

- [Moderní PDF editor, QR vizitka, komprese, více stran a šifrované koncepty](pdf-editor-2026-09-28.md).
- [Rozšířené šifrování a kontrola přístupů](security-extension-2026-09-28.md), včetně již dokončené migrace produkčních dat a vypnutí dvou nepoužívaných servisních klíčů.
- [Optimalizace Můj tým](team-loading-2026-09-28.md) a [Síně slávy](hall-loading-2026-09-28.md), které předchozí izolované bezpečnostní nasazení neobsahovalo.

## Ověření společné verze

- Celá aplikační sada: **5 290 úspěšných testů ve 371 souborech**.
- TypeScript bez chyb. ESLint všech změněných zdrojů bez chyb; dvě existující upozornění na přesměrování při odhlášení v AppLayout.
- Kontrola změněných souborů nezachytila soukromé klíče, soubory prostředí ani aktuální tajné hodnoty z místní konfigurace.
- Vzdálená větev před vydáním odpovídala místnímu výchozímu commitu 184912551772b6b9972e0427351441970b29558c.

Cloudové funkce a databázová pravidla již odpovídají tomuto zdroji a jejich produkční ověření popisuje bezpečnostní záznam. Opravné databázové skripty se při nahrání zdrojů automaticky nespouštějí. Lokální přihlašovací údaje a dočasné migrační prostředí nejsou součástí vydání.

Nasazení musí zachovat povinné šifrování a ověřený serverový klíč. Předchozí bezpečnostní zpráva a její identifikátor deploymentu představují historické ověření před tímto kompletním vydáním. Nasazovací a následné HTTP doklady tohoto vydání jsou v ignorovaném adresáři .tmp/all-changes-20260928/.
