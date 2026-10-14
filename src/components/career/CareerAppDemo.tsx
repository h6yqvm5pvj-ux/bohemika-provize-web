import Image from "next/image";
import { ClipboardPaste, MousePointer2 } from "lucide-react";
import styles from "./careerImportHelp.module.css";

const CAPTURES = {
  settings: {
    empty: "/images/help/career-app-empty.webp",
    pasted: "/images/help/career-app-pasted.webp",
    result: "/images/help/career-app-result.webp",
    emptyMobile: "/images/help/career-app-empty-mobile.webp",
    pastedMobile: "/images/help/career-app-pasted-mobile.webp",
    resultMobile: "/images/help/career-app-result-mobile.webp",
    width: 994,
    height: 609,
    resultHeight: 1888,
    mobileWidth: 374,
    mobileHeight: 759,
    mobileResultHeight: 2566,
  },
  setup: {
    empty: "/images/help/career-setup-empty.webp",
    pasted: "/images/help/career-setup-pasted.webp",
    result: "/images/help/career-setup-result.webp",
    emptyMobile: "/images/help/career-setup-empty-mobile.webp",
    pastedMobile: "/images/help/career-setup-pasted-mobile.webp",
    resultMobile: "/images/help/career-setup-result-mobile.webp",
    width: 807,
    height: 608,
    resultHeight: 2537,
    mobileWidth: 374,
    mobileHeight: 809,
    mobileResultHeight: 3786,
  },
};

/** Captures of the actual settings or account setup form with demonstration data. */
export function CareerAppDemo({ step, context = "settings" }: { step: number; context?: "settings" | "setup" }) {
  const capture = CAPTURES[context];
  return (
    <div className={styles.appScene}>
      <div className={styles.importCapture}>
        <picture>
          <source media="(max-width: 640px)" srcSet={capture.emptyMobile} width={capture.mobileWidth} height={capture.mobileHeight} />
          <Image src={capture.empty} width={capture.width} height={capture.height} alt="" className={styles.appScreenshot} loading="eager" unoptimized />
        </picture>
        <picture className={styles.pastedCapture}>
          <source media="(max-width: 640px)" srcSet={capture.pastedMobile} width={capture.mobileWidth} height={capture.mobileHeight} />
          <Image src={capture.pasted} width={capture.width} height={capture.height} alt="" className={styles.appScreenshot} loading="eager" unoptimized />
        </picture>
        {step === 2 && <>
          <span className={styles.appCursor}><MousePointer2 size={27} fill="white" strokeWidth={1.8} /><span className={styles.clickRing} /></span>
          <span className={styles.pasteMenu}><ClipboardPaste size={15} /> Vložit <span>Ctrl / ⌘ + V</span></span>
        </>}
        {step === 3 && <span className={styles.prefillCursor}><MousePointer2 size={27} fill="white" strokeWidth={1.8} /><span className={styles.clickRing} /></span>}
      </div>
      {step === 3 && <div className={styles.resultCapture}>
        <picture>
          <source media="(max-width: 640px)" srcSet={capture.resultMobile} width={capture.mobileWidth} height={capture.mobileResultHeight} />
          <Image src={capture.result} width={capture.width} height={capture.resultHeight} alt="" className={styles.appScreenshot} loading="eager" unoptimized />
        </picture>
        <span className={styles.saveCursor}><MousePointer2 size={27} fill="white" strokeWidth={1.8} /></span>
      </div>}
    </div>
  );
}
