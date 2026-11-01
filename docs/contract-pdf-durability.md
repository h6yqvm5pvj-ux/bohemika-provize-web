# Zachování PDF příloh smluv

PDF je uložené šifrovaně ve Storage a jeho metadata v dokumentu smlouvy ve Firestore. Tyto služby nemají společnou atomickou transakci. Chyba při potvrzení zápisu proto neznamená, že zápis neproběhl.

- Upload používá verzi načtené smlouvy jako podmínku zápisu. Při chybě potvrzení znovu načte smlouvu přes stejnou kontrolu oprávnění a ověří shodu bucketu, cesty a SHA-256. Pouze takto potvrzené uložení vrátí jako úspěch.
- Obnova potvrzení probíhá uvnitř sledované operace zápisu. Ověřený úspěch proto sám nezablokuje cashflow cache; neověřený výsledek nadále označí zápis za neúspěšný. Dřívější chyby jiných zápisů se tím nemažou.
- Připravené soubory při chybě uploadu ani předchozí soubory při nahrazení ihned nemaže. Nejasný výsledek vrátí jako konflikt nebo dočasnou chybu s pokynem obnovit detail. Mohou zůstat nepoužívané šifrované objekty; jejich úklid musí samostatně ověřit aktuální vazby.
- Smazání smlouvy vyžaduje nezměněnou verzi dokumentu. Navazující úklid souvisejících záznamů se provádí jen pro potvrzené dávky. Souběžný převod nebo upload zneplatní dávku. PDF se ihned nemaže ani po potvrzeném smazání dokumentu: stejný objekt může stále používat jiná smlouva.
- Úklid duplicit přesune metadata PDF atomicky na jedinou ponechanou smlouvu stejného vlastníka, produktu a klienta. Odlišná PDF, neplatná metadata nebo nejasná identita smazání zastaví. Tato operace objekty ve Storage nemaže.

Převod smlouvy a úklid duplicit mohou zachovat původní cestu objektu. Původní ID smlouvy v cestě není důkazem, že soubor není používaný. Cesta je také součástí šifrovacího kontextu; nepřejmenovávat ji pouhou změnou metadat. Nikdy nemažte objekty jen podle stáří nebo existence původního dokumentu.

Regresní testy používají syntetická data a simulují ztracené potvrzení zápisu, opakování SDK, souběžný převod/upload/mazání i nejednoznačné duplicity. Testy nemění produkční data ani nastavení Storage.
