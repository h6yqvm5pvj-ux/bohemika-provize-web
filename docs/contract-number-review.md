# Kontrola čísel smluv v rekapitulaci kalkulačky

Pravidla v `src/app/kalkulacka/contractNumberPatterns.ts` jsou orientační upozornění podle skutečně pozorovaných čísel, nikoliv oficiální validační pravidla pojišťoven. Neobvyklou hodnotu lze po kontrole potvrdit přes „Souhlasí“. Čísla se automaticky neopravují ani nepřepisují.

Podkladem je lokální kontrolní přehled smluv z 15. 9. 2026 a kontrolní snímek z 16. 9. 2026. Počítají se unikátní čísla v rámci produktu, aby dodatky nenavyšovaly vzorek. Dokument neobsahuje čísla jednotlivých smluv ani osobní údaje.

Specifickou kontrolu přidáváme od 10 různých čísel při konzistentní délce a číselné řadě. Osamocené odchylky samy o sobě nepotvrzují další platnou řadu. U průběžných číselných řad používáme širší začátky, například Allianz 7/8 místo každé pozorované dvojice. Jde o ručně posouzený katalog; za běhu se neučí z každé nově uložené hodnoty.

| Produkt | Unikátní čísla ve vzorku | Obvyklá délka | Sledované začátky | Podklad a výjimky |
| --- | ---: | ---: | --- | --- |
| ČPP Auto | 1 432 | 10 | 32, 31, 37, 38 | 1 431 desetimístných; 1 409 začíná 32. Další řady zachovány z předchozí kontroly. |
| ČPP NEON | 483 | 10 | 750 | 482 desetimístných; 476 začíná 750. Ostatní řady vyžadují kontrolu. |
| Kooperativa FLEXI | 24 | 10 | 14 | Všechna čísla ve vzorku. U původní smlouvy renovace navíc 48, doloženo uživatelem dodaným PDF. |
| ČPP DOMEX | 307 | 10 | 00 | 304 desetimístných; řady 002/003. Původní smlouvy zahrnují i 001, proto širší začátek 00. Dvacetimístné odchylky se označí. |
| ČPP SIMPLEX | 24 | 10 | 00 | Všechna čísla ve vzorku, řady 002/003. |
| ČPP ZAMEX | 16 | 10 | 00 | 15 čísel začíná 003; jediná řada 395 zůstává ke kontrole. |
| Kooperativa Auto | 210 | 10 | 63, 64 | Všechna čísla ve vzorku. |
| Allianz Auto | 145 | 9 | 7, 8 | Všechna čísla devítimístná, několik navazujících řad. |
| ČSOB Auto | 74 | 10 | 37, 61, 62 | 73 čísel v těchto řadách; jediná řada 648 zůstává ke kontrole. |
| UNIQA Auto | 63 | 10 | 55 | Všechna čísla ve vzorku. |
| Slavia Auto | 23 | 10 | 37 | Všechna čísla ve vzorku začínají 370. |
| Kooperativa odpovědnost zaměstnance | 19 | 10 | 395 | Všechna čísla ve vzorku. |
| ČPP cestovní pojištění | 152 | 10 | 18 | 151 čísel odpovídá, jedna devítimístná odchylka. |
| AXA cestovní pojištění | 40 | 10 | 94 | 39 čísel odpovídá, osamocená řada 041 zůstává ke kontrole. |
| Kooperativa cestovní pojištění | 11 | 10 | 505 | Všechna čísla ve vzorku. |

Pillow Auto (18 čísel, délky 7/8/9) a Comfort Commodity (11 čísel, různé délky a začátky) zatím nemají dostatečně jednoznačný formát. Produkty s méně než 10 čísly, produkty bez podkladů a samostatné flotilové varianty nepřebírají pravidla od jiného produktu stejné pojišťovny. Zůstává pro ně obecná kontrola 6–14 číslic a opakujících se stejných číslic.

Při doplnění nebo změně pravidla je potřeba ověřit počet unikátních smluv, rozdělení délek a začátků, starší řady a případná čísla původních nahrazovaných smluv. Zachovávají se počáteční nuly; pro porovnání se odstraňují pouze mezery. Testy používají syntetická čísla a kontrolují i záměnu produktů, chybějící nuly a původní FLEXI smlouvu při renovaci.
