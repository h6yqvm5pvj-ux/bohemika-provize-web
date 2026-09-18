# Kalkulačka invalidního důchodu – nové přiznání v roce 2026

Ověřeno 17. 9. 2026. Čistý lokální výpočet; žádné údaje se neukládají ani neposílají do externích kalkulaček.

## Podklady

- [ČSSZ – parametry 2026](https://www.cssz.gov.cz/web/cz/uvod/-/asset_publisher/GQ48v1KeNe0J/content/id/3203431): základ 4 900 Kč, redukční hranice 21 546 / 195 868 Kč, zápočty 99 / 26 %, sazba 1,495 %, minima, průměrná mzda 48 967 Kč.
- [ČSSZ – invalidní důchody podrobně](https://www.cssz.gov.cz/invalidni-duchody-podrobne): poměry stupňů, dopočtená doba, zvýšené minimum při 15 letech bez náhradních dob a u kvalifikovaných osob pod 28 let.
- [MPSV – invalidní důchody](https://mpsv.gov.cz/invalidni-duchody): kontrola sazeb a zvýšeného minima podle § 42.
- [ČSSZ – výpočet a výplata](https://www.cssz.gov.cz/vypocet-a-vyplata-duchodu): OVZ, rozhodné období a indexace příjmů.
- [ČSSZ – průvodce, příklady zaokrouhlování](https://www.cssz.gov.cz/documents/20143/99569/Srozumitelny_urad-Pruvodce_pro_seniory_-_20220215.pdf/3d22c6cc-1621-7910-5dab-a79804aa9ac6): zaokrouhlení výpočtového základu a důchodu nahoru. Starší finanční parametry příkladů nepřebíráme.

Uživatelské reference: [Peníze.cz](https://www.penize.cz/kalkulacky/invalidni-duchody) používají příjem a započtenou dobu; [Kurzy.cz](https://www.kurzy.cz/kalkulacka/invalidni-duchod/) také zjednodušený odhad doby z roku narození a začátku pojištění. Kurzy při přímém načtení vyžadovaly ověření; prostudován veřejně indexovaný popis. Výpočty a parametry vycházejí z primárních podkladů výše, nikoli z těchto konkurenčních kalkulaček.

## Postup

1. OVZ zaokrouhlit na celé Kč nahoru. Mzdový režim dosazuje současnou hrubou mzdu pouze jako odhad OVZ.
2. Výpočtový základ = ceil(99 % první části + 26 % druhé části); část nad druhou hranicí se nezapočítá. Zaokrouhlit součet, nikoli jednotlivé redukční pásmo.
3. III. procentní část = výpočtový základ × celé roky × 1495 / 100000. II. stupeň polovina, I. třetina; jednotlivé výsledky zaokrouhlit nahoru. Dělení základní výměry je chybné.
4. Uplatnit minimum procentní části: I. 1 634, II. 2 450, III. 4 900 Kč. Při potvrzených podmínkách zvýšeného minima použít nejméně 45 % redukované průměrné mzdy pro III., polovinu pro II. a třetinu pro I. V roce 2026: redukovaných 28 460 Kč, procentní minima 4 269 / 6 404 / 12 807 Kč.
5. Přičíst základní výměru 4 900 Kč ke každému stupni.

Využíváme celočíselné čitatele, aby binární desetinné zaokrouhlování nepřidalo korunu při přesně celočíselném výsledku. Zaokrouhlení III. části před dělením nemění výsledky I./II., protože pro celočíselný d platí ceil(ceil(x)/d) = ceil(x/d).

Příklad: OVZ 40 000 Kč, 45 let → výpočtový základ 26 129 Kč → procentní části 5 860 / 8 790 / 17 579 Kč → důchody 10 760 / 13 690 / 22 479 Kč.

## Hranice použití

Uživatel zadává celkovou uznanou dobu včetně dopočtené doby; program ji neodhaduje pouze z věku, nezapočítává ji podruhé a neposuzuje nárok. Počet let pro výši je podlaha součtu uznaných dnů / 365. Zvýšené minimum se neodvozuje automaticky z celkové doby, protože ta může obsahovat náhradní a budoucí doby. Režim „15 let“ znamená již získanou dobu bez náhradních dob. Režim pod 28 let vyžaduje individuální potvrzení uvedených podmínek.

Neřešíme zahraniční doby, dílčí/souběžné důchody, II. pilíř, invaliditu z mládí, zvláštní krácení, změnu stupně nebo valorizaci stávajících důchodů. Podmínky jsou uvedeny v aplikaci a v kopírovaném souhrnu. Změna roku vyžaduje revizi parametrů, sazeb, minima, textů i testů; samotný kalendář rok výpočtu nemění.

## Propojení s nastavením životního pojištění

Volitelný krok Invalidita používá stejné vstupy a výpočet. Karta každého stupně ukazuje jednu orientační částku od státu: osobní odhad, pokud jsou vyplněné podklady, jinak jasně označený statistický průměr. Čistý příjem se nepřebírá jako hrubý; již zadanou hrubou mzdu lze převzít výslovným tlačítkem.

Soukromé krytí se volí pomocí tří variant. Základ je vyšší z čistého měsíčního příjmu klienta a měsíčních výdajů domácnosti včetně splátek. Měsíční plánovaná renta odpovídá následujícím podílům základu pro I. / II. / III. stupeň:

- Nízká: 10 % / 20 % / 30 %.
- Střední: 30 % / 50 % / 80 %.
- Vysoká: 40 % / 60 % / 100 %.

Osobní důchod ani statistický průměr se od těchto variant neodečítá. Jde o přednastavené rozsahy soukromého krytí, nikoli odhad zbývajícího výdělku nebo příslib úplného dorovnání příjmu. Procenta nejsou zákonné podíly poklesu pracovní schopnosti.

Pojistná částka = zaokrouhlená měsíční renta × počet měsíců do 65 let, bez splacení dluhů. Renta popisuje plánované čerpání pojistné částky, nikoli automatickou měsíční výplatu pojišťovnou. Investiční varianta používá stávající vzorec kapitálu pro rentu a rozsah modelovaného výnosu vybraného produktu. Horizont 65 let není automaticky zákonný důchodový věk klienta. Stejné částky, vybraná varianta a podklady důchodu jsou i v PDF.
