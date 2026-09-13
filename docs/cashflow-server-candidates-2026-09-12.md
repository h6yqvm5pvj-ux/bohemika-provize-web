# Cashflow — uložené diagnostické výsledky, 12. 9. 2026

Navazuje na [ověřovací výpočet](./cashflow-server-shadow-2026-09-12.md). Infrastruktura pro sledování změn, ukládání a ověření obnoveného výsledku je implementovaná v pracovní verzi. **Není nasazená ani zapnutá na živých účtech. Zobrazení nadále používá současný výpočet v prohlížeči. Automatická obnova na pozadí a použití uložených částek pro běžné uživatele ještě nejsou implementované.**

Navazující [lokální pilot](./cashflow-pilot-2026-09-12.md) již ověřil samostatné načtení výsledku, přinesl časové metriky a odhalil opravené hraniční případy formátu měsíců a velikosti dávek. Lokální měření zatím zrychlení neprokázalo; údaje v části Ověření níže zachycují stav před tímto pilotem.

## Co je připravené

- **Společná revize:** `_cashflowCache/control` obsahuje náhodnou epochu, rostoucí revizi a počet otevřených změn. Každá sledovaná změna konzervativně zneplatní kandidáty všech účtů. To zjednodušuje kontrolu, ale při častých změnách snižuje využitelnost cache a soustřeďuje transakce do jednoho dokumentu.
- **Vícefázové zápisy:** `cashflowMutationTracking.ts` obaluje celou logickou operaci. Trvalá blokace se otevře před prvním skutečným SDK zápisem a uzavře až po všech dávkách a vnořených úlohách. Čtení, zamítnutí před zápisem a dry-run samotné stav nevytvářejí. Při neúspěšném SDK zápisu, neúplném zpracování nebo pádu procesu zůstává blokace otevřená. Není zde automatické odemčení podle času.
- **Pokrytí změn:** smlouvy, převody a dožití, import/opakované zpracování/přestavba z výpisů, odvozené TIP výplaty, týmová struktura, profily/účty/předplatné a související metadata. Devatenáct opravných a migračních skriptů sdílí stejný mechanismus přes `scripts/cashflow-mutation.mjs`; expiry skript volá sledovanou lifecycle funkci. Testy statického pokrytí hlídají známé SDK zápisy i nové skripty zapisující známé podklady.
- **Čerstvé podklady:** kandidát získá revizi před prvním čtením profilu. Interní volba `freshCashflowContext` obchází lokální cache týmu a předplatného; neovládá ji hlavička ani parametr z prohlížeče. Účet a UID pocházejí z ověřeného tokenu. Pilot odmítá zastupování a ověřuje shodu identity také po načtení profilu.
- **Přesný kontext:** klíč obsahuje e-mail, UID, verzi, IANA pásmo, všechna nastavení a přesný `asOfMs`. Stejný kalendářní den nestačí: některé dosavadní výpočty závisejí i na konkrétním okamžiku. Otevření s novým `asOfMs` se záměrně nesdílí. Tato etapa proto ještě nedokládá přínos opakovaného použití cache mezi návštěvami.
- **Celý výsledek:** verzovaný `cashflowSnapshotWire.ts` převádí šest polí `Date` na epochu a zpět. Validuje položky, měsíce, typy a meze; vadný výsledek odmítá celý. Uložení má strop 16 MiB, neměnné části po 512 KiB a SHA-256 kontrolu úplnosti. Ukazatel se publikuje transakčně pouze při stále stejné dokončené revizi. Čtenář ověřuje revizi i ukazatel znovu po načtení všech částí.
- **Platnost a úklid:** kandidát je logicky platný nejvýše pět minut, také musí vyhovět aktuálnímu dni a kontextu. Pole `expiresAt` samo nezajišťuje fyzické odstranění. Připravený příkaz `cleanup` odstraňuje expirované ukazatele i osiřelé části v omezených transakcích. Úlohu je potřeba skutečně spouštět. Dokončené a obnovené záznamy mutací zůstávají jako provozní historie; jejich retenční úklid zatím není zavedený.

Shadow routa ukládá pouze při shodě vstupů a výstupů. Ihned potom výsledek znovu načte a porovná otisky obnovených položek i měsíců. Při aktivním ukládání odpověď doplňuje `candidate: verified | not_stored | revision_changed | storage_mismatch`. `verified` dokládá kontrolu v okamžiku posledního ověření čtenáře. Neopravňuje k budoucímu použití částek po změně dat a nepřepíná zdroj zobrazení.

Nedostupná revize, probíhající změna, selhání úložiště nebo poškození nezablokují současnou stránku. Odpověď ani diagnostický log neobsahují uložené částky či osobní údaje. **Samotné serverové dokumenty obsahují výstupní položky včetně osobních údajů** a potřebují odpovídající přístup a úklid; integrační testy ověřují odmítnutí přímého klientského přístupu včetně administrátorského účtu.

## Přepínače a pořadí pilotu

Výchozí hodnota všech přepínačů je vypnuto. První etapa vyžaduje `NEXT_PUBLIC_CASHFLOW_SHADOW_ENABLED=1`, `CASHFLOW_SHADOW_ENABLED=1`, konkrétní účty v `CASHFLOW_SHADOW_EMAILS` a místní session opt-in popsaný v první dokumentaci. Perzistence navíc vyžaduje současně `CASHFLOW_CANDIDATES_ENABLED=1` a `CASHFLOW_CACHE_TRACK_WRITES=1`.

1. Nejdříve nasadit stejnou verzi sledování na všechny zapisující instance a předat přepínač i používaným maintenance skriptům. Starší procesy a probíhající úlohy musí dokončit práci. Přímé konzolové/SDK zápisy je nutné provozně ošetřit, protože aplikační obaly je nezachytí.
2. V testovacím prostředí zapnout `CASHFLOW_CACHE_TRACK_WRITES=1` a ověřit změny smluv i vícefázové importy. Kontrolní stav lze explicitně inicializovat příkazem níže; první sledovaná změna jej také vytvoří, pokud chybí a neexistuje historie mutací. Poškozený stav se automaticky neopravuje.
3. Zapnout omezený shadow pilot a `CASHFLOW_CANDIDATES_ENABLED=1`. Spouštět pravidelný úklid, kontrolovat otevřené/selhané operace, shodu obnovených výsledků a dodatečnou latenci/zátěž. Ukládání a okamžité kontrolní načtení přidávají práci.
4. Vypnutí `CASHFLOW_CANDIDATES_ENABLED` zastaví ukládání. Před vypnutím sledování zápisů nejdříve vypnout kandidáty a nechat staré požadavky/úlohy doběhnout. Před dalším pilotem znovu ověřit pokrytí všech zapisovačů a nevyužívat kandidáty vzniklé před nesledovaným zásahem.

Pokud se při zapnutém sledování nepodaří otevřít trvalou blokaci, související obchodní zápis se nespustí. To chrání konzistenci, ale může zhoršit dostupnost při výpadku evidence. Selhání závěrečného uzavření už úspěšný obchodní zápis zpětně nehlásí jako chybný; ponechá nedostupné kandidáty. Také záměrně odmítnutá transakce může vyžadovat ruční obnovu, pokud již otevřela blokaci. Proto se tato infrastruktura nezapíná plošně bez provozního ověření.

## Provozní nástroj

Příkazy používají prostředí aktuálního projektu stejně jako ostatní maintenance skripty. V rámci této práce běžely pouze testy, syntaktické kontroly a `--help`; žádný z těchto příkazů neběžel nad živou databází.

```sh
node scripts/cashflow-cache-state.mjs --help
node scripts/cashflow-cache-state.mjs status
node scripts/cashflow-cache-state.mjs init --apply
node scripts/cashflow-cache-state.mjs cleanup --apply --limit=100
```

`status` je pouze čtení, vrací konzistentní revizi a nejvýše 100 otevřených/selhaných operací. `cleanup` odstraní nejvýše zadaný počet dokumentů z každé ze dvou kolekcí na jedno spuštění; při zaplnění limitu je potřeba další běh.

Po přerušení zapisovače je nutné prokázat, že již neběží, a zkontrolovat či opravit jeho částečné zápisy. Aktivní opuštěnou operaci lze teprve potom označit `fail-active` a následně provést `recover`; již selhaná operace potřebuje pouze `recover`. Obě operace vyžadují `--apply`, konkrétní `--operation=UUID`, aktuální `--epoch=UUID`, `--revision=N` ze statusu a výslovné `--writer-stopped-and-data-verified`. Zastaralá revize se transakčně odmítne. Po `fail-active` je nutný nový status, protože se revize změnila. Obnova jedné operace neodblokuje ostatní. Čas od posledního zápisu není důkaz, že zapisovač skončil, a řídicí dokument se za tímto účelem nemaže.

## Co zbývá před zobrazením z cache

Přímé zápisy povolené současnými Firestore pravidly administrátorům a externí Admin SDK obcházejí aplikační sledování. Tato práce nezměnila jejich dosavadní oprávnění. Je potřeba uzavřít tuto hranici a ověřit kompletní přechod všech zapisujících procesů. Dále zbývá úplné stránkování největších portfolií, rozhodnutí o časové platnosti mezi návštěvami, obnova na pozadí, produkční porovnání a měření latence/ceny. Klientské porovnání ani lokální testy tento provozní důkaz nenahrazují. **Neexistuje přepínač, který by v této implementaci aktivoval zobrazení uložených částek.**

## Ověření

Regrese pokrývají souběžné/vnořené operace, zachycené chyby, více dávek, chybu před prvním zápisem, pád a ruční obnovu, chybějící/poškozený stav, změnu revize v průběhu výpočtu i čtení, osiřelé části, překročení velikosti, nové datum/pásmo/verzi/identitu a rekonstrukci celého výsledku. Oprávnění a transakční závody se navíc ověřují skutečným Admin SDK na izolovaném lokálním Firestore emulátoru s demo projektem.

Závěrečné ověření pracovní verze:

- `npm test`: **1 603 / 1 603 testů ve 181 souborech**.
- `npm run test:rules`: **245 / 245 testů ve 4 souborech**, včetně 23 nových případů cashflow cache; pouze lokální emulátor a demo projekt. Pro otevření lokálních portů bylo potřeba povolení běhu mimo sandbox.
- `tsc --noEmit`, ESLint dotčených oblastí, syntax checks maintenance skriptů a `git diff --check`: prošly.
- `next build --webpack`, kontrola obrazového runtime a autentizačního proxy: prošly. Sitemap využila dosavadní záložní větev při nedostupném DNS Firestore v místním prostředí.

Žádné nasazení, migrace ani změna živých dat nebyly provedené. Produkční shoda a reálný přínos pro dobu načtení zatím nejsou změřené.
