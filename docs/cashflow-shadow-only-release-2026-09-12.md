# Izolované porovnávání cashflow

**Nasazeno 12. 9. 2026 s měřením vypnutým.** Po výslovném schválení uživatelem vznikl vzdálený produkční build bez přepnutí domény; po sedmi úspěšných kontrolách byl převeden na `bohemka.app`. Stejných sedm kontrol prošlo přímo na produkční doméně a metadata potvrzují nové nasazení `dpl_35btPGYkeGXnNLyMDfKvjzzSMgQA`. [Záznam nasazení a kontrol](./cashflow-shadow-deployment-2026-09-12.json).

Základ: produkční commit `f96e3c0606028f9eee48c32b70c7e7225b2fc5d0`, ověřený přes metadata existujícího nasazení na `bohemka.app`. Tento adresář obsahuje oddělené zdroje; nejde o celý rozpracovaný strom hlavního projektu.

## Rozsah

- Současný výpočet v prohlížeči zůstává referencí pro zobrazené částky.
- Volitelná diagnostika znovu načte autorizované podklady a porovná serverový výpočet pomocí otisků.
- Nový souhrn obsahuje jen shodu, známé důvody přeskočení a časy; neposílá klientské údaje do externí analytické služby.
- Funkce pro ukládání kandidátů, čtení kandidátů a sledování obchodních zápisů nejsou součástí tohoto balíčku.
- Obchodní zápisy existujících API zůstávají podle původního produkčního commitu.

## Aktivace

Nasazení samo nemá automaticky aktivovat měření. Klientská část vyžaduje při sestavení `NEXT_PUBLIC_CASHFLOW_SHADOW_ENABLED=1`. Server musí mít `CASHFLOW_SHADOW_ENABLED=1` a `CASHFLOW_SHADOW_EMAILS` omezené na uživatelem určený účet. E-mail nepatří do repozitáře. `CASHFLOW_CACHE_TRACK_WRITES=0` a `CASHFLOW_CANDIDATES_ENABLED=0` zůstávají pojistkou pro případné další verze; tento balíček jejich moduly neobsahuje.

Před aktivací je nutné ověřit shodné IANA časové pásmo serveru a uživatelova prohlížeče. V metadatech aktuální produkce nebyla nalezena explicitní proměnná `TZ`; skutečné pásmo běžícího procesu se tím neprokázalo. Neměnit globální produkční pásmo pouze kvůli tomuto pilotu. Při neshodě diagnostika vrací `skipped/time_zone`.

Uživatel se přihlásí vlastní cestou včetně MFA; podklady předplatného vyžadují existující roli `owner`. Aktivace konkrétní karty po přihlášení:

```js
sessionStorage.setItem("cashflow_shadow_opt_in", "1")
```

Po opětovném otevření cashflow se sdílí pouze výsledek:

```js
JSON.parse(sessionStorage.getItem("cashflow_shadow_last_result") || "null")
```

Hesla, přihlašovací tokeny, jednorázové kódy, export celé konzole ani síťových požadavků se nepředávají. Kontrolní požadavek je same-origin a zahrnuje volby výpočtu včetně případného filtru čísla smlouvy; samotný souhrn tyto údaje neobsahuje. MFA uživatelského přihlášení nenahrazuje ochranu hostingu a serverových klíčů.

Vypnutí karty: odstranit `cashflow_shadow_opt_in` a znovu otevřít stránku. Vypnutí serveru: `CASHFLOW_SHADOW_ENABLED=0`, s účinkem po uplatnění nastavení v běžících instancích. Výchozí nezadaný serverový přepínač je vypnutý.

## Stav

Příprava proběhla místně a následovalo schválené nasazení samostatné verze. Žádný uživatelský účet nebyl přihlášen a porovnání skutečného cashflow nebylo spuštěno. Nové ukládání kandidátů a sledování obchodních zápisů nejsou nasazené. Přesné výsledky ověření a otisky souborů uvádí doprovodný manifest.

## Ověření oddělené verze

Prošlo všech 1 413 testů ve 164 souborech, TypeScript, ESLint všech změněných zdrojů, produkční webpack sestavení a kontrola obrazového runtime i autentizačního proxy. Sestavení použilo syntetické veřejné Firebase nastavení, bez administrátorských přihlašovacích údajů a bez souborů prostředí. Nejde o ověření reálných produkčních částek nebo produkčního zrychlení.

Patch obsahuje 27 zdrojových a testovacích souborů a úspěšně prošel kontrolou aplikace nad uvedeným produkčním commitem. Mimo tyto zdroje nebyly změněny žádné původní sledované soubory. Podrobnosti a SHA-256 jednotlivých souborů obsahuje [manifest](./cashflow-shadow-only-release-2026-09-12.json); přenositelná změna je v [patchi](./cashflow-shadow-only-release-2026-09-12.patch).

Nasazení použilo klientský přepínač při sestavení na `1` a serverový `CASHFLOW_SHADOW_ENABLED=0`. Diagnostický endpoint na produkci vrací přesně `ok: true`, `status: skipped`, `reason: disabled`, s `private, no-store`, a to i pro neplatné JSON. Samotné měření nadále vyžaduje splnění výše uvedených podmínek. Návratový bod je předchozí produkční nasazení `dpl_58P3z6dHVsTJUEsW4JkPeGuDdjTe`; těsně před přepnutím byla znovu ověřena jeho shoda s dosavadní produkcí. Návrat nebyl potřeba.
