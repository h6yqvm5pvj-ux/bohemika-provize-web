# Životní smlouvy, dodatky a skutečné výplaty

Řádek výpisu se přiřazuje samostatně v rámci již autorizované rodiny smlouvy.
NV/NB se porovnává s navýšením konkrétního dodatku; při shodných základech
rozhoduje počátek uvedený ve výpisu. Nejednoznačná shoda se hlásí ke kontrole.
Smíšený výpis může přiřadit B původní smlouvě a NV jinému dodatku.

Kódy výpisu uzavírají pouze odpovídající složku konkrétního životního dodatku:

| Kód výpisu | Položka výpočtu dodatku |
| --- | --- |
| NV101 | A101 – první část okamžité provize |
| NB0301 | B0301 – druhá část okamžité provize |
| NB3601 (také NB036, NB36) | B3601 – provize po 3 letech |
| NB4801 (také NB048, NB48) | B4801 – provize po 4 letech |

Neznámý NB kód neuzavírá B0301 ani jinou odhadnutou položku. Odložená
provize se nezaměňuje se zrychlenou polovinou B3601_HALF. Ve výpisu,
historii i cashflow zůstává původní kód skutečné výplaty. Výplata NV/NB
na původní smlouvě sama neuzavírá její A/B položku.

Jde o rozlišení provizních složek; pravidla slučování základny původní
smlouvy a dodatku tato změna nezavádí. U dříve zpracovaných výpisů se nové
porovnání očekávané částky uloží při jejich opětovném zpracování.

Kopie stejného řádku se v autorizovaném přehledu započítává jednou. Identita
zahrnuje vlastníka, rodinu, produkt, roli, autora výpisu, výpis a klíč řádku.
Dvě stejně vysoké výplaty z různých zdrojových řádků zůstávají samostatné.
Projekce nemění uložené doklady. Aktualizace modelové verze cashflow zneplatňuje
staré kandidátní výpočty.

## Náhled opravy starších vazeb

`node scripts/preview-life-family-receipts.mjs <číslo-smlouvy>` pouze čte
ohraničenou rodinu NEON a výpisy odkazované z jejích plateb. Zdroj ověřuje
pomocí stejného hashe řádku, který používá import. Neprovádí zápis do databáze.

Do nového soukromého dočasného adresáře uloží zálohu původních polí plateb,
přesné verze dokumentů a plán. Soubory mají oprávnění 0600. Obsahují soukromé
provozní údaje; nepatří do repozitáře ani veřejných logů.

`ready: true` znamená, že všechny již uložené platební řádky mají ověřený zdroj
a jednoznačný cíl. Neznamená kontrolu všech případných nenahraných výpisů ani
potvrzení každého rozdílu provize. Oprava nepřekládá běžné B jen podle podobné
částky k dodatku a zachovává jejich dosavadní nesrovnalosti.

Před případným provedením plánu musí samostatný řízený zápis ověřit původní
verze všech dokumentů a použít atomický batch s preconditions. Náhled ani
záloha samy neprovádějí či nepovolují produkční migraci.
