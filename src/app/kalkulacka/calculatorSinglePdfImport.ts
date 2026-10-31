import type { Product } from "../types/domain";
import type { RefreshOriginalLookupState } from "./calculatorApi";
import type { CalculatorPdfFormSetters } from "./calculatorPdfFormTypes";
import type { PrepareEndorsementOptions } from "./useEndorsementPreparation";
import { productLabel, supportsOriginalContractReplacement } from "./calculatorHelpers";
import {
  buildPdfImportIssueMessage, detectProductFromPdfLazy, failedPdfImportMessage,
  hasAutomatedPdfImport, manualPdfImportMessage, parseContractPdfByProduct,
  parseMaxCizinKomplexPdfLazy, resolveDetectedPdfProduct, unreadablePdfImportMessage,
  type ParsedContractPdf,
} from "./calculatorPdfImport";
import { applyCalculatorPdfFormValues, mapSinglePdfFormValues, pdfImportResetValues } from "./calculatorPdfFormValues";
import { PDF_PRODUCT_DETECTION_TIMEOUT_MS, PDF_DATA_IMPORT_TIMEOUT_MS, isPdfImportTimeoutError, withPdfImportTimeout } from "./pdfImportOperation";

type CurrentValue<T> = { current: T };
type PdfParserReportCounts = { pending: number; sent: number; failed: number };

type SinglePdfImportOptions = {
  product: Product;
  hasSelectedProduct: boolean;
  isInheritedContractMode: boolean;
  pdfFormSetters: CalculatorPdfFormSetters;
  refs: {
    pdfImportAbortRef: CurrentValue<AbortController | null>;
    pdfImportRunIdRef: CurrentValue<number>;
    pdfParserReportCounts: CurrentValue<PdfParserReportCounts>;
    fileInputRef: CurrentValue<HTMLInputElement | null>;
  };
  ui: {
    setPdfParserReportStatus: (value: string | null) => void;
    setPdfImporting: (value: boolean) => void;
    setPdfImportError: (value: string | null) => void;
    setPdfImportStatus: (value: string | null) => void;
    setImportedContractPdfFile: (value: File | null) => void;
    setStatementClientNamePrefillActive: (value: boolean) => void;
    setPdfClientNameLoaded: (value: boolean) => void;
    setProduct: (value: Product) => void;
    setHasSelectedProduct: (value: boolean) => void;
    setProductPickerSectionForProduct: (value: Product) => void;
    setClientSuggestionsOpen: (value: boolean) => void;
    setRefreshOriginalOpen: (value: boolean) => void;
    setRefreshOriginalContractNumber: (value: string) => void;
    setRefreshOriginalMissingInSystem: (value: boolean) => void;
    setRefreshOriginalPdfLookupNumber: (value: string | null) => void;
    setRefreshOriginalLookup: (value: RefreshOriginalLookupState) => void;
    setEndorsementWorkflowActive: (value: boolean) => void;
  };
  handlePrepareEndorsement: (options: PrepareEndorsementOptions) => Promise<boolean>;
  notifyPdfParserFailure: (
    file: File, product: Product, parsed: ParsedContractPdf,
    ocrAttempted: boolean, signal: AbortSignal, isCurrent: () => boolean,
  ) => void;
};

const looksLikeMaxCizinKomplexPdf = (
  parsed: ParsedContractPdf | null | undefined
): boolean => {
  if (!parsed) return false;
  return Boolean(
    parsed.maxCizinKomplexVariant ||
      (typeof parsed.durationMonths === "number" && parsed.durationMonths > 0) ||
      typeof parsed.amount === "number" ||
      parsed.policyStartDate ||
      parsed.contractSignedDate
  );
};

/** Runs one import against the same cancellation state shared with batch import. */
export async function importSingleContractPdf(file: File | null, options: SinglePdfImportOptions): Promise<void> {
  const { product, hasSelectedProduct, isInheritedContractMode, pdfFormSetters, handlePrepareEndorsement, notifyPdfParserFailure } = options;
  const { pdfImportAbortRef, pdfImportRunIdRef, pdfParserReportCounts, fileInputRef } = options.refs;
  const {
    setPdfParserReportStatus,
    setPdfImporting,
    setPdfImportError,
    setPdfImportStatus,
    setImportedContractPdfFile,
    setStatementClientNamePrefillActive,
    setPdfClientNameLoaded,
    setProduct,
    setHasSelectedProduct,
    setProductPickerSectionForProduct,
    setClientSuggestionsOpen,
    setRefreshOriginalOpen,
    setRefreshOriginalContractNumber,
    setRefreshOriginalMissingInSystem,
    setRefreshOriginalPdfLookupNumber,
    setRefreshOriginalLookup,
    setEndorsementWorkflowActive,
  } = options.ui;
  const { pensionTargetAge: setPensionTargetAge } = pdfFormSetters;

  const showMaxCizinKomplexHint = () => {
    setPdfImportError(
      "PDF vypadá jako MAXIMA Cizinci. V poli Produkt vyber sekci Cizinci -> MAXIMA Komplexní zdravotní pojištění cizinců a nahraj PDF znovu."
    );
    setPdfImportStatus(null);
  };

  if (!file) return;
  pdfImportAbortRef.current?.abort();
  const importController = new AbortController();
  pdfImportAbortRef.current = importController;
  const importRunId = pdfImportRunIdRef.current + 1;
  pdfImportRunIdRef.current = importRunId;
  const isCurrentPdfImport = () => pdfImportRunIdRef.current === importRunId && !importController.signal.aborted;
  let allowPdfImportProgress = true;
  let ocrActive = false;

  pdfParserReportCounts.current = { pending: 0, sent: 0, failed: 0 };
  setPdfParserReportStatus(null);
  setPdfImporting(true);
  setPensionTargetAge(null);
  setPdfImportError(null);
  setPdfImportStatus(
    "PDF je připravené k přiložení. Zkouším z něj načíst data…"
  );
  setImportedContractPdfFile(file);
  setStatementClientNamePrefillActive(false);
  setPdfClientNameLoaded(false);
  let importProduct: Product | null = hasSelectedProduct ? product : null;
  let productDetected = false;
  try {
    const detected = await withPdfImportTimeout(
      signal => detectProductFromPdfLazy(file, {
        signal,
        allowOcr: true,
        onOcrStart: () => {
          ocrActive = true;
          if (isCurrentPdfImport()) setPdfImportStatus("PDF je sken. Rozpoznávám produkt a údaje přes OCR…");
        },
        onOcrProgress: (progress) => {
          if (!isCurrentPdfImport() || !allowPdfImportProgress) return;
          setPdfImportStatus(progress.page > 0
            ? `Rozpoznávám sken: strana ${progress.page}/${progress.totalPages} (${Math.round(progress.progress * 100)} %)…`
            : "Připravuji rozpoznávání skenu…");
        },
      }),
      PDF_PRODUCT_DETECTION_TIMEOUT_MS,
      "Automatické rozpoznání produktu z PDF trvá moc dlouho.",
      () => ocrActive,
      importController.signal
    );
    if (!isCurrentPdfImport()) return;
    if (detected) {
      productDetected = true;
      const detectedProduct = resolveDetectedPdfProduct(detected.product, importProduct);
      if (detectedProduct !== product) {
        importProduct = detectedProduct;
        setProduct(detectedProduct);
        setHasSelectedProduct(true);
        setProductPickerSectionForProduct(detectedProduct);
        setPdfImportStatus(`Rozpoznán produkt: ${productLabel(detectedProduct)}. Načítám data…`);
      } else {
        importProduct = detectedProduct;
        setHasSelectedProduct(true);
      }
    } else if (importProduct) {
      setPdfImportStatus(
        `Produkt z PDF jsem nerozpoznal. Zkouším import podle vybraného produktu ${productLabel(importProduct)}…`
      );
    } else {
      setPdfImportStatus(
        "PDF je připravené k přiložení, ale produkt se nepodařilo automaticky rozpoznat."
      );
    }
  } catch (detectErr) {
    console.warn("Auto-detekce produktu z PDF selhala");
    if (!isCurrentPdfImport()) return;
    if (importProduct) {
      setPdfImportStatus(
        isPdfImportTimeoutError(detectErr)
          ? `PDF je připravené k přiložení. Rozpoznání produktu trvalo moc dlouho, zkouším vybraný produkt ${productLabel(importProduct)}…`
          : `Produkt z PDF se nepodařilo rozpoznat. Zkouším import podle vybraného produktu ${productLabel(importProduct)}…`
      );
    } else {
      setPdfImportStatus(
        "PDF je připravené k přiložení, ale produkt se nepodařilo automaticky rozpoznat."
      );
    }
  }
  if (!importProduct) {
    setImportedContractPdfFile(file);
    setPdfImportError(
      "Vyber produkt ručně. Údaje z tohoto PDF zatím nebyly načtené, ale PDF zůstane připravené k přiložení po uložení smlouvy."
    );
    setPdfImporting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    return;
  }
  applyCalculatorPdfFormValues(pdfImportResetValues(importProduct), pdfFormSetters);
  try {
    if (!hasAutomatedPdfImport(importProduct)) {
      setImportedContractPdfFile(file);
      setPdfImportStatus(manualPdfImportMessage(importProduct));
      setPdfImportError(
        productDetected
          ? null
          : `Produkt z PDF jsem nerozpoznal. Vyber produkt ručně; PDF se při uložení přiloží.`
      );
      return;
    }

    const parsed = await withPdfImportTimeout(
      signal => parseContractPdfByProduct(importProduct, file, {
        signal,
        allowOcr: true,
        onOcrStart: () => {
          ocrActive = true;
          if (!isCurrentPdfImport() || !allowPdfImportProgress) return;
          setPdfImportStatus("PDF vypadá jako sken. Spouštím OCR…");
        },
        onOcrProgress: (progress) => {
          if (!isCurrentPdfImport() || !allowPdfImportProgress) return;
          const pagePart =
            progress.page > 0
              ? `strana ${progress.page}/${progress.totalPages}`
              : "připravuji OCR";
          const percent =
            progress.progress > 0
              ? ` (${Math.round(progress.progress * 100)} %)`
              : "";
          setPdfImportStatus(`PDF je sken, OCR ${pagePart}${percent}…`);
        },
      }),
      PDF_DATA_IMPORT_TIMEOUT_MS,
      "Automatické čtení dat z PDF trvá moc dlouho.",
      () => ocrActive,
      importController.signal
    );
    if (!isCurrentPdfImport()) return;
    allowPdfImportProgress = false;
    if (!parsed) {
      setImportedContractPdfFile(file);
      setPdfImportStatus(
        "PDF se při uložení přiloží k detailu záznamu, údaje prosím doplň ručně."
      );
      setPdfImportError(
        unreadablePdfImportMessage({ product: importProduct, productDetected })
      );
      return;
    }
    const importIssueMessage = buildPdfImportIssueMessage({ product: importProduct, parsed });
    const mapped = mapSinglePdfFormValues(importProduct, parsed);
    applyCalculatorPdfFormValues(mapped.values, pdfFormSetters);
    let applied = mapped.applied;
    const parsedIsEndorsement =
      importProduct === "neon" &&
      "isEndorsement" in parsed &&
      parsed.isEndorsement === true;
    let endorsementPreparedFromPdf = false;
    if (parsed.clientName) {
      setPdfClientNameLoaded(true);
      setClientSuggestionsOpen(true);
    }

    if (parsedIsEndorsement || importProduct === "flexi") {
      setRefreshOriginalOpen(false);
      setRefreshOriginalContractNumber("");
      setRefreshOriginalMissingInSystem(false);
      setRefreshOriginalPdfLookupNumber(null);
      setRefreshOriginalLookup({
        status: "idle",
        progress: 0,
        adviserName: null,
        original: null,
      });
    }
    if (!isInheritedContractMode && supportsOriginalContractReplacement(importProduct)) {
      const parsedRefreshOriginalContractNumber =
        "refreshOriginalContractNumber" in parsed &&
        typeof parsed.refreshOriginalContractNumber === "string"
          ? parsed.refreshOriginalContractNumber.trim()
          : "";
      const parsedIsRefresh = "isRefresh" in parsed && parsed.isRefresh === true;
      if (parsedIsRefresh || parsedRefreshOriginalContractNumber) {
        setRefreshOriginalOpen(true);
        setRefreshOriginalMissingInSystem(false);
        setRefreshOriginalPdfLookupNumber(null);
        if (parsedRefreshOriginalContractNumber) {
          setRefreshOriginalContractNumber(parsedRefreshOriginalContractNumber);
          setRefreshOriginalPdfLookupNumber(
            importProduct === "neon" && parsedIsRefresh
              ? parsedRefreshOriginalContractNumber
              : null
          );
          applied += 1;
        }
      }
    }
    if (parsedIsEndorsement && !isInheritedContractMode) {
      setEndorsementWorkflowActive(true);
      const parsedContractNumber =
        typeof parsed.contractNumber === "string" ? parsed.contractNumber.trim() : "";
      const parsedSignedDate =
        typeof parsed.contractSignedDate === "string"
          ? parsed.contractSignedDate.trim()
          : "";
      const parsedAmount =
        typeof parsed.amount === "number" && Number.isFinite(parsed.amount)
          ? parsed.amount
          : null;
      endorsementPreparedFromPdf = await handlePrepareEndorsement({
        productOverride: importProduct,
        contractNumberOverride: parsedContractNumber,
        contractSignedDateOverride: parsedSignedDate,
        newPremiumAmountOverride: parsedAmount ?? 0,
        source: "pdf",
      });
    }

    if (applied === 0 && importProduct !== "maxcizinkomplex") {
      try {
        const maxCizinParsed = await withPdfImportTimeout(
          signal => parseMaxCizinKomplexPdfLazy(file, { signal, allowOcr: false }),
          5_000,
          "Fallback rozpoznání MAXIMA Cizinci trvá moc dlouho.",
          undefined,
          importController.signal
        );
        if (!isCurrentPdfImport()) return;
        if (looksLikeMaxCizinKomplexPdf(maxCizinParsed)) {
          showMaxCizinKomplexHint();
          return;
        }
      } catch {
        // ignore fallback detection error
      }
    }

    setImportedContractPdfFile(file);
    const attachmentNote = parsedIsEndorsement
      ? " PDF se při uložení přiloží k detailu dodatku."
      : " PDF se při uložení přiloží k detailu záznamu.";
    const productDetectionPrefix = productDetected
      ? ""
      : `Produkt z PDF jsem nerozpoznal; použil jsem vybraný produkt ${productLabel(importProduct)}. `;
    const ocrPrefix = parsed.ocrTextUsed === true ? "PDF bylo skenované, načteno přes OCR. " : "";
    setPdfImportStatus(
      parsedIsEndorsement
        ? endorsementPreparedFromPdf
          ? `${ocrPrefix}${productDetectionPrefix}Načtena žádanka o změnu z PDF (${applied} polí). Připravil jsem dodatek podle rozdílu proti poslední uložené hodnotě smlouvy.${attachmentNote}`
          : `${ocrPrefix}${productDetectionPrefix}Načtena žádanka o změnu z PDF (${applied} polí). Původní smlouvu se nepodařilo automaticky porovnat, zkontroluj hlášku a klikni na Změna znovu.${attachmentNote}`
        : applied > 0
        ? `${ocrPrefix}${productDetectionPrefix}Načteno z PDF (${applied} polí). Zkontroluj prosím.${attachmentNote}`
        : importProduct === "cppsimplex"
          ? `${ocrPrefix}${productDetectionPrefix}PDF pro ČPP Simplex nahráno. Extrakci polí doladíme v dalším kroku.${attachmentNote}`
          : `${ocrPrefix}${productDetectionPrefix}V PDF se nenašla čitelná data, doplň ručně.${attachmentNote}`
    );
    setPdfImportError(importIssueMessage);
    notifyPdfParserFailure(file, importProduct, parsed, ocrActive, importController.signal, isCurrentPdfImport);
  } catch (err) {
    console.error("PDF import selhal");
    if (!isCurrentPdfImport()) return;
    const importTimedOut = isPdfImportTimeoutError(err);
    allowPdfImportProgress = false;
    if (!importTimedOut && importProduct !== "maxcizinkomplex") {
      try {
        const maxCizinParsed = await withPdfImportTimeout(
          signal => parseMaxCizinKomplexPdfLazy(file, { signal, allowOcr: false }),
          5_000,
          "Fallback rozpoznání MAXIMA Cizinci trvá moc dlouho.",
          undefined,
          importController.signal
        );
        if (!isCurrentPdfImport()) return;
        if (looksLikeMaxCizinKomplexPdf(maxCizinParsed)) {
          showMaxCizinKomplexHint();
          return;
        }
      } catch {
        // ignore fallback detection error
      }
    }
    setImportedContractPdfFile(file);
    setPdfImportError(
      importTimedOut
        ? "Automatické čtení PDF trvalo příliš dlouho, takže jsem ho odblokoval. PDF zůstává připravené jako příloha."
        : importProduct
          ? failedPdfImportMessage(importProduct, productDetected)
          : "Produkt z PDF se nepodařilo rozpoznat. Vyber produkt ručně."
    );
    setPdfImportStatus(
      importTimedOut
        ? "PDF se při uložení přiloží k detailu smlouvy. Údaje doplň ručně a můžeš pokračovat bez čekání na parser."
        : null
    );
  } finally {
    allowPdfImportProgress = false;
    if (isCurrentPdfImport()) {
      setPdfImporting(false);
    }
    if (isCurrentPdfImport() && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

}
