**Oprava soukromého předvyplnění výpovědi — 13. 9. 2026**

Nález L-03 je opraven v místním projektu. Předvyplnění nyní přechází ze smlouvy do výpovědi jednorázově v paměti stejné záložky. Nové osobní údaje se nezapisují do `sessionStorage` ani `localStorage`. Oprava není nasazena.

Přenos je svázán s aktuálním Firebase UID, případným administrátorským zastoupením a konkrétním přihlášením. Odhlášení, přepnutí účtu nebo změna zastoupení zruší staré předání. Identita se zachytí před asynchronním načítáním PDF, takže opožděný výsledek nemůže po odhlášení znovu uložit údaje nebo přesměrovat další účet do formuláře. Stará reference není platná ani po novém přihlášení stejného uživatele.

Při zahájení odhlášení se data odstraní ještě před HTTP požadavkem. Platí to také při výpadku sítě nebo chybě serveru. Pokud odhlášení selže a účet zůstane přihlášený, uživatel může zahájit nové předvyplnění; zrušený přenos se neobnoví.

Staré kopie pod přesným prefixem `bohemika:contract-termination-prefill:` se odstraňují z obou úložišť bez čtení jejich hodnot. Úklid běží při spuštění nové aplikace, odhlášení a změně identity, obnovení stránky a při relevantních událostech úložiště. Ostatní koncepty, nastavení a Firebase přihlášení se tím nemažou. Na zařízeních se starou verzí proběhne úklid až po nasazení a spuštění aktualizované aplikace.

V paměti zůstává nejvýše jedno dosud nevyzvednuté předání. Po vyzvednutí, nahrazení novým předáním nebo třiceti minutách se odstraní. Vyhodnocení času při čtení navíc odmítá prošlá data i v pozastavené záložce, která ještě neprovedla časovač. Při změně účtu se znovu vytvoří celý formulář včetně náhledů. Před uložením do historie prohlížeče se vyprázdní; při obnově z této historie se stránka znovu načte a ověří přihlášení.

Úplné obnovení dokumentu nebo otevření v jiné záložce předvyplnění z paměti nepřenáší. V takovém případě je třeba předvyplnění znovu otevřít ze smlouvy. Běžný přechod přes stávající `router.push` v téže záložce je zachován.

| Ověření | Výsledek |
| --- | --- |
| Cílené testy předvyplnění, úklidu, odhlášení a formuláře | 42 prošlo, včetně 24 nových regresních scénářů. |
| Celá aplikační sada | 1 982 testů ve 199 souborech prošlo. |
| TypeScript | `tsc --noEmit --incremental false` prošel. |
| Lint všech upravených a nových aplikačních souborů | Bez chyb. Jedno stávající upozornění na interní navigaci přes `window.location.href` v jiné části detailu smlouvy. |

Regresní scénáře pokrývají jednorázový přenos všech polí bez zápisu do úložiště, expiraci, změnu uživatele a zastoupení, odhlášení včetně neúspěšného požadavku, opožděný zápis, opětovné přihlášení stejného účtu, zachování formuláře při běžném oznámení stejné identity, historické kopie a nedostupné úložiště. Samotná stránka výpovědi byla testována v prostředí `happy-dom` s náhradami Firebase, síťových požadavků a okolního layoutu. Nešlo o přihlášení do produkce ani o úplný test v reálném prohlížeči.

Pro testy se použila smyšlená data a blokování externí sítě. Produkční data, konfigurace ani databázová pravidla se neměnily. Úplný build ani nasazení se neprováděly. Úspěšné testy Firestore z původního auditu nebylo nutné opakovat, protože oprava databázová pravidla ani serverové ukládání nemění.

Podklady: [přenos a úklid](../../src/app/lib/contractTerminationPrivacy.ts), [regresní testy přenosu](../../src/app/lib/contractTerminationPrivacy.test.ts), [reakce na změny přihlášení](../../src/components/ContractTerminationPrivacyCleanup.tsx), [oddělení formuláře podle přihlášení](../../src/components/ContractTerminationSession.tsx), [testy skutečné stránky formuláře](../../src/app/pomucky/vypoved-smlouvy/page.privacy.test.tsx).
