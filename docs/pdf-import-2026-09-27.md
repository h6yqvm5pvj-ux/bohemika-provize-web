# Sdílené čtení PDF a rozpoznávání skenů

Detekce produktu a importéry smluv používají `src/app/lib/pdfDocumentText.ts`. Textové položky včetně původních souřadnic se načtou jednou pro tentýž objekt `File`. Souběžná čtení sdílejí probíhající práci. Chyba nebo zrušení posledního odběratele umožní nový pokus. Cache je pouze v paměti prohlížeče, navázaná na životnost souboru; neukládá smlouvy do úložiště ani nesdílí soubory podle názvu.

PDF dokument a jeho pracovní prostředky se uvolní po získání textu i při chybě. Cache drží jen text a souřadnice. Sken se pro vykreslení znovu otevře, ale jeho OCR výsledek se následně sdílí mezi detekcí produktu a parserem. Nejde tedy o tvrzení, že se sken otevře pouze jednou.

## OCR

V kalkulačce je společná cesta zapojená pro všech 25 položek v `AUTOMATED_PDF_PRODUCTS`. OCR běží místně v prohlížeči pomocí existujících českých a anglických jazykových dat. Samostatná volání importérů z jiných funkcí zůstávají standardně textová; OCR lze zapnout volbou `allowOcr`. Conseq Zenit zachovává dosavadní výchozí OCR a svůj doplňkový pokus na prvních dvou stranách neúplného formuláře. Režim importu u provizního výpisu nadále respektuje `allowOcr: false`.

Automatické OCR vybírá strany s méně než 80 čitelnými písmeny/číslicemi a rastrovým obrázkem. Krátké čistě textové strany a prázdné listy ho nespouštějí. V kombinovaném PDF zůstávají ostatní strany a jejich původní text beze změny. Textový a OCR výsledek jsou oddělené; textový import ani při souběhu nečeká na OCR a nepřebírá jeho údaje.

Slova z OCR se převádějí na textové položky s PDF souřadnicemi. Rozestupy a dvojtečky zachovávají hranice polí. Položky jednoho vizuálního řádku mají společnou základní linku, aby rozdílná výška písmen neposunula hodnotu k jinému popisku. Conseq používá původní souřadnice jednotlivých slov pro přesnou práci se sloupci.

Údaje ze skenu dostávají upozornění ke kontrole. Rozpoznání produktu ze skenu má střední jistotu a hromadný import předá takový záznam k ruční kontrole. Číslice ani identifikátory se heuristicky neopravují.

OCR je omezené na nejvýše 12 vybraných stran na jeden pokus. Pokud jich PDF potřebuje více, uživatel dostane výslovné upozornění na neúplné zpracování. Společná podpora OCR nezaručuje správné přečtení každého rozložení, natočené fotografie nebo nekvalitního skenu; dosavadní kontroly povinných polí a rekapitulace zůstávají potřeba.

## Zrušení

Časové limity v kalkulačce předávají `AbortSignal` až ke čtení PDF a OCR. Zrušení při odchodu ze stránky, nahrazení importu nebo vypršení limitu zastaví práci bez čekání na její výsledek. U OCR se ruší také probíhající vykreslování a ukončuje worker. Zrušení jednoho souběžného odběratele nezruší čtení pro ostatní. Po zrušení posledního odběratele se opožděný výsledek nevrátí do cache nového pokusu.

## Ověření

- 317 testů v 31 souborech: dosavadní importéry, kalkulačka, doplňování detailu smlouvy, sdílení textu/OCR, smíšené dokumenty, nezávislé rušení, opakování po chybě, limity a úklid pracovních prostředků.
- TypeScript, ESLint změněných zdrojů a testů a standardní `npm run build` prošly, včetně kontroly obrazového runtime a autentizačního proxy. Pro sestavení bylo nutné odložit starou cache Turbopacku obsahující chybu sandboxu; konfigurace sestavení se neměnila.
- Skutečný Chrome, PDF.js a Tesseract: 9 scénářů, po třech pro FLEXI, ČPP Auto a ČPP KOMPLEX (text, sken, kombinace). Shodovalo se všech 60 kontrolovaných hodnot a rozpoznaný produkt. U FLEXI se navíc kontrolovala renovace a původní číslo smlouvy. Každý sken spustil jeden OCR průchod. Bez chyb JavaScriptu.
- Dříve dodané 17stránkové PDF renovace FLEXI: stejných 9 výsledných polí jako před úpravou. Otevření PDF při detekci a parsování klesla ze 2 na 1, volání čtení textu stran z 34 na 17. Dokument ani osobní údaje nejsou součástí zdrojového kódu nebo tohoto přehledu.

Tato měření prokazují odstranění duplicitní práce a shodu na ověřených případech. Nevyjadřují procento úspěšnosti na všech reálných smlouvách ani zrychlení celé aplikace v produkci.

Regresní testy lze spustit pomocí:

```sh
npm test -- src/app/lib/parse src/app/lib/detectProductFromPdf.test.ts src/app/lib/pdfDocumentText.test.ts src/app/lib/pdfOcr.test.ts src/app/kalkulacka 'src/app/smlouvy/[id]/contractDetailPdfReimport.test.ts'
```
