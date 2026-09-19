# Dávky smluv pro cashflow — 18. 9. 2026

Cashflow nyní požaduje až **500 smluv na stránku**. Klient i API používají společnou konstantu `CASHFLOW_CONTRACTS_PAGE_SIZE`. Pro 1 000 vlastních nebo 1 000 týmových smluv to znamená 2 volání místo 10. Vlastní a týmové smlouvy se stránkují samostatně: například 750 vlastních + 250 týmových vyžaduje 3 volání. Běžný seznam smluv má nadále maximum 50.

## Měření

Medián pěti opakování na stejném syntetickém portfoliu, pořadí velikostí dávek se střídalo. Měřený je skutečný handler `/api/contracts/list`, dotazy Firestore SDK, serializace JSON a postupné načtení všech stránek. Firestore běžel lokálně v emulátoru, proces byl zahřátý, identita přihlášeného testovacího uživatele byla vložena mockem. Závěrečné měření běželo bez souběžného lintování nebo aplikačních testů.

| Portfolio | Dávka | Volání API | Celkem | První odpověď | Největší odpověď JSON |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 000 vlastních smluv | 100 | 10 | 151 ms | 25 ms | 143 786 B |
| 1 000 vlastních smluv | 300 | 4 | 122 ms | 46 ms | 425 701 B |
| 1 000 vlastních smluv | **500** | **2** | **117 ms** | 74 ms | 707 606 B |
| 1 000 týmových smluv / 8 poradců | 100 | 10 | 5 192 ms | 155 ms | 170 555 B |
| 1 000 týmových smluv / 8 poradců | 300 | 4 | 1 291 ms | 188 ms | 505 390 B |
| 1 000 týmových smluv / 8 poradců | **500** | **2** | **549 ms** | 208 ms | 840 215 B |

Při dávce 500 se načetlo celkem 1 415 102 B vlastních nebo 1 680 320 B týmových odpovědí JSON. Součet samostatně gzipovaných odpovědí činil 32 700 B, respektive 48 584 B. Komprese proběhla až po měření času; jde o odhad komprimované velikosti, nikoliv o změřený přenos po síti. Kompletní vzorky jsou v [JSON výsledcích](cashflow-pagination-results-2026-09-18.json).

Větší dávka prodlužuje první odpověď, ale zkracuje získání celého portfolia, na které cashflow čeká. Velikost 500 vyšla v tomto testu nejlépe a největší odpověď měla přibližně 0,84 MB. Skutečná velikost závisí mimo jiné na historii výplat a meziprovizích; nejde o horní mez pro všechny produkční smlouvy.

Časy **nejsou měřením produkce**. Neobsahují internetovou latenci mezi prohlížečem a API, reálné ověření přihlášení, službu rate limitu, studený start, vykreslení ani následný výpočet cashflow. Menší počet HTTP požadavků neznamená automaticky stejný pokles počtu databázových čtení.

## Oprava nalezená při porovnání

Původní stránkování mohlo vynechat záznamy při kombinaci zpětných importů, chybějícího data sjednání a shodných dat. Omezené výsledky dvou dotazů (`contractSignedDate`, `createdAt`) nemusely pokrýt stejný úsek výsledného pořadí; přesto se z nich vytvořil kurzor pro další stránku.

Oba proudy dotazů nyní podle potřeby pokračují přes hranici sestavené stránky, včetně jednoho záznamu navíc pro `hasMore`. Toto platí také pro náhradní dotazy po jednotlivých poradcích. Výsledky se dál řadí podle data a stabilního klíče vlastníka a smlouvy. **Všechny velikosti dávek v tabulce byly měřeny se stejnou opravou a vracejí stejných 1 000 úplných záznamů**; porovnání tedy nezvýhodňuje neúplný výsledek starého kódu.

## Ověření

- 514 souvisejících aplikačních testů prošlo.
- 13 integračních kontrol včetně benchmarku prošlo: vlastní i týmové stránky po 100/300/500, 1 005 smluv se stejným datem, shodná data u 12 členů týmu, náhradní dotazy při nedostupném collection-group indexu, úplnost běžných seznamů po 50, limity API a odmítnutí nepřihlášeného uživatele / uživatele bez týmu.
- Každé měření porovnává všechny klíče smluv s vloženými daty a kontroluje duplicity. Benchmark navíc porovnává SHA-256 celého seřazeného obsahu smluv mezi dávkami.
- Test skutečného React hooku ověřuje načtení 750 vlastních + 250 týmových smluv ve 3 voláních a zachování hranice pro spuštění workeru.
- TypeScript, ESLint změněných souborů a `git diff --check` prošly.

## Zopakování

Potřeba je Java pro Firestore emulátor, Firebase CLI a nainstalované závislosti projektu. Test odmítne běžet mimo lokální emulátor `127.0.0.1:8180` projektu `demo-bohemika-rules`. Vytváří a uklízí pouze své syntetické uživatele `cashflow-page-*@example.test`.

```sh
JAVA_TOOL_OPTIONS='-Duser.language=en -Duser.country=US' \
CASHFLOW_PAGINATION_BENCHMARK=1 \
CASHFLOW_PAGINATION_OUTPUT=/tmp/cashflow-pagination-results.json \
firebase emulators:exec --only firestore --project demo-bohemika-rules \
  --config firebase.rules-test.json \
  "npx vitest run --config vitest.rules.config.ts tests/firestore/cashflowPagination.test.ts"
```

Bez `CASHFLOW_PAGINATION_BENCHMARK=1` se benchmark přeskočí a zůstanou kontroly úplnosti a přístupu. Měření je opakovatelné bez přístupu k produkční databázi.
