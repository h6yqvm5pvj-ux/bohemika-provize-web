import { useEffect, useRef, type RefObject } from "react";
import Image from "next/image";
import { insurerById } from "./insurers";
import { insurerName, type Offer } from "./model";
import { ComparisonIcon } from "./icons";
import styles from "./comparison.module.css";

const HEIGHT = 56;

/** A compact visual copy of the column headings, aligned with the real table. */
export function StickyOfferHeader({ offers, recommendedOfferId, scrollRef }: { offers: Offer[]; recommendedOfferId?: string; scrollRef: RefObject<HTMLDivElement | null> }) {
  const headerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroll = scrollRef.current, header = headerRef.current, track = trackRef.current;
    const table = scroll?.querySelector("table"), tableHead = table?.tHead;
    if (!scroll || !header || !track || !table || !tableHead) return;
    const navigation = Array.from(document.querySelectorAll<HTMLElement>("[data-app-navigation-header]"));
    let frame = 0;

    const update = () => {
      frame = 0;
      const viewport = scroll.getBoundingClientRect();
      const identity = tableHead.querySelector<HTMLElement>("[data-comparison-offer-identity]") || tableHead;
      const heading = identity.getBoundingClientRect(), bounds = table.getBoundingClientRect();
      const navigationBottom = navigation.reduce((bottom, node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.top <= 1 ? Math.max(bottom, rect.bottom) : bottom;
      }, 0);
      const top = Math.max(0, navigationBottom) + 4;
      const visible = heading.bottom <= top && bounds.bottom > top + HEIGHT && viewport.width > 0;
      header.hidden = !visible;
      if (!visible) return;
      header.style.top = `${top}px`;
      header.style.left = `${viewport.left}px`;
      header.style.width = `${scroll.clientWidth}px`;
      track.style.width = `${bounds.width}px`;
      track.style.gridTemplateColumns = Array.from(tableHead.rows[0].cells).map(cell => `${cell.getBoundingClientRect().width}px`).join(" ");
      header.scrollLeft = scroll.scrollLeft;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const followTable = () => {
      if (header.scrollLeft !== scroll.scrollLeft) header.scrollLeft = scroll.scrollLeft;
      schedule();
    };
    const followHeader = () => {
      if (!header.hidden && scroll.scrollLeft !== header.scrollLeft) scroll.scrollLeft = header.scrollLeft;
    };

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    for (const node of [scroll, table, tableHead, document.body, scroll.closest(".app-content"), ...navigation]) if (node) observer?.observe(node);
    // Capture also catches scrolling inside the app shell or an embedded view.
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    scroll.addEventListener("scroll", followTable, { passive: true });
    header.addEventListener("scroll", followHeader, { passive: true });
    schedule();
    return () => {
      cancelAnimationFrame(frame); observer?.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      scroll.removeEventListener("scroll", followTable);
      header.removeEventListener("scroll", followHeader);
    };
  }, [scrollRef, offers.length]);

  // The original <th> elements remain the accessible table headings. This copy
  // has no focusable controls and never changes the document or the PDF.
  return <div ref={headerRef} className={styles.stickyOfferHeader} style={{ height: HEIGHT }} hidden aria-hidden="true" tabIndex={-1} data-comparison-sticky-header>
    <div ref={trackRef} className={styles.stickyOfferTrack}>
      <div className={styles.stickyCriterion}>Krytí a podmínky</div>
      {offers.map((offer, index) => {
        const insurer = insurerById(offer.insurerId);
        return <div key={offer.id} className={styles.stickyOffer} data-current={index === 0} data-recommended={recommendedOfferId === offer.id} data-offer-id={offer.id} title={[offer.label, insurerName(offer), offer.product].filter(Boolean).join(" · ")}>
          {insurer ? <Image src={insurer.logo} width={38} height={24} alt="" unoptimized /> : <ComparisonIcon name="shield" size={22} />}
          <div><small>{recommendedOfferId === offer.id ? <><ComparisonIcon name="check" size={11} />DOPORUČENO</> : offer.label || (index === 0 ? "Současná smlouva" : `Nabídka ${index}`)}</small><strong>{insurerName(offer)}</strong><span>{offer.product || "Produkt neuveden"}</span></div>
        </div>;
      })}
    </div>
  </div>;
}
