# Proklepka vozidla — Autokuk

Server používá `AUTOKUK_API_KEY` z `.env.local` (při nasazení z prostředí serveru). Klíč se neposílá do prohlížeče. Poskytovatel: [Autokuk API](https://autokuk.cz/api), specifikace: dodaný soubor `api-1.json`.

Přihlášený poradce vyhledává VIN nebo SPZ přes `POST /api/autokuk/vehicle` s tělem `{ "query": "5K15233" }`. Server volá pouze `https://autokuk.cz/api/v1/search`.

- Základní dotaz neobsahuje `full` ani `include`. Vrací vybrané údaje z TP včetně čísel ORV a TP, historii vlastníků/provozovatelů, STK, tachometr a poslední evidované pojištění.
- Dálniční známka se načítá až po rozbalení bonusu. Tělo aplikace přidá `check: "vignette"`; server přidá pouze `include: ["vignette"]` a vrátí jen výsledek této kontroly.
- Poskytovatel vrací základní sekce společně. Server před odesláním do aplikace odfiltruje ostatní údaje, například ekologickou likvidaci, obecnou historii a poznámky. Odcizení se neověřuje.
- Číselné role vlastníků odpovídají [číselníku RSV](https://download.dataovozidlech.cz/info/vlastnikprovozovatelvozidla). Neznámá role zůstává neurčená, redigovaná jména se nedoplňují.
- Dodaná specifikace neobsahuje ocenění. Orientační odhad počítá aplikace; tlačítko SAUTO přidává srovnání s aktuálními nabídkami. Z úspěšné kontroly STK se neodvozuje její budoucí platnost. Chybějící historie tachometru se nedopočítává.

Úspěšné odpovědi se uchovávají pět minut v paměti procesu (nejvýše 100 záznamů), zvlášť pro hlavní report a dálniční známku. Souběžné shodné požadavky v témže procesu sdílejí jedno volání. Mezi procesy cache sdílená není. Klíč cache zahrnuje otisk účtu, nikoli samotný API klíč.

Sdílený limiter účtu povoluje standardně 10 požadavků za minutu; `AUTOKUK_RATE_LIMIT_PER_MINUTE` lze nastavit podle zakoupeného tarifu. Autokuk navíc hlídá vlastní denní kvótu. Aplikace placené dotazy automaticky neopakuje při překročení limitu. Chyby přístupu, nenalezené vozidlo, limity a timeout mají samostatné zprávy bez obsahu odpovědi poskytovatele.
