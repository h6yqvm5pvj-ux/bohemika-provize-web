/** Split rich text using the browser's actual A4 layout, preserving inline formatting. */
export function paginateEditor(editor: HTMLElement, html: string): string[] {
  const measure = editor.cloneNode(false) as HTMLElement;
  measure.removeAttribute("contenteditable");
  measure.removeAttribute("data-editor-frame");
  measure.removeAttribute("role");
  measure.setAttribute("aria-hidden", "true");
  Object.assign(measure.style, {
    position: "fixed", left: "-12000px", top: "0", transform: "none",
    width: `${editor.offsetWidth}px`, height: `${editor.offsetHeight}px`, visibility: "hidden",
  });
  const remaining = document.createElement("div");
  remaining.innerHTML = html;
  const pages: string[] = [];
  const fits = () => measure.scrollHeight <= measure.clientHeight + 1 && measure.scrollWidth <= measure.clientWidth + 1;
  document.body.append(measure);
  try {
    if (!measure.clientHeight || !measure.clientWidth) return [html];
    while (remaining.childNodes.length) {
      if (pages.length >= 200) throw new Error("Text je příliš dlouhý. Rozděl jej do více dokumentů.");
      measure.replaceChildren();
      while (remaining.firstChild) {
        const node = remaining.firstChild;
        measure.append(node);
        if (fits()) continue;
        measure.removeChild(node);
        remaining.prepend(node);
        const hasPrefix = Boolean(measure.textContent?.trim() || measure.children.length);
        if (hasPrefix) {
          const prefix = Array.from(measure.childNodes);
          measure.replaceChildren(node.cloneNode(true));
          const fitsOnNewPage = fits();
          measure.replaceChildren(...prefix);
          if (fitsOnNewPage) {
            // Keep a trailing heading with the following paragraph when possible.
            const heading = measure.lastElementChild;
            if (heading?.matches("h1,h2,h3,h4") && measure.children.length > 1) remaining.prepend(heading);
            break;
          }
        }
        // A single paragraph/list may be taller than a page. Find its largest fitting prefix.
        const points: { node: Text; offset: number }[] = [];
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        const textNodes: Text[] = node.nodeType === Node.TEXT_NODE ? [node as Text] : [];
        while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
        for (const text of textNodes) {
          for (const match of text.data.matchAll(/\s+|[^\s]+(?:\s+|$)/gu)) {
            points.push({ node: text, offset: match.index + match[0].length });
          }
        }
        const split = (point: { node: Text; offset: number }) => {
          const range = document.createRange();
          const item = point.node.parentElement?.closest("li");
          const tail = document.createRange();
          if (item) { tail.selectNodeContents(item); tail.setStart(point.node, point.offset); }
          const sameItem = item && tail.toString().trim().length > 0;
          range.selectNodeContents(remaining);
          if (item && !sameItem) range.setEndAfter(item);
          else range.setEnd(point.node, point.offset);
          const first = range.cloneContents();
          range.selectNodeContents(remaining);
          if (item && !sameItem) range.setStartAfter(item);
          else range.setStart(point.node, point.offset);
          const rest = range.cloneContents();
          // Continue numbering when an ordered list crosses the page boundary.
          const firstList = first.firstElementChild;
          const restList = rest.firstElementChild;
          if (firstList?.tagName === "OL" && restList?.tagName === "OL") {
            const lastItem = firstList.lastElementChild;
            const start = Number(firstList.getAttribute("start") || 1);
            restList.setAttribute("start", String(Number(lastItem?.getAttribute("value") || (start + firstList.children.length - 1)) + (sameItem ? 0 : 1)));
          }
          if (sameItem && restList?.matches("ol,ul")) {
            const continuation = restList.firstElementChild as HTMLElement | null;
            if (continuation) continuation.style.listStyleType = "none";
          }
          return { first, rest };
        };
        const prefix = Array.from(measure.childNodes).map(node => node.cloneNode(true));
        let low = 0, high = points.length - 1, best = -1;
        while (low <= high) {
          const middle = Math.floor((low + high) / 2);
          measure.replaceChildren(...prefix.map(node => node.cloneNode(true)), split(points[middle]).first);
          if (fits()) { best = middle; low = middle + 1; } else high = middle - 1;
        }
        if (best < 0) {
          if (hasPrefix) { measure.replaceChildren(...prefix); break; }
          throw new Error("Některý prvek je větší než stránka. Zmenši jeho písmo nebo šířku.");
        }
        const { first, rest } = split(points[best]);
        measure.replaceChildren(...prefix, first);
        remaining.replaceChildren(rest);
        // A range ending at the end of an element can leave empty ancestor shells.
        while (remaining.firstElementChild && !remaining.firstElementChild.textContent &&
          !remaining.firstElementChild.querySelector("br,img,[data-pagination-caret]")) remaining.firstElementChild.remove();
        break;
      }
      pages.push(measure.innerHTML);
    }
    return pages.length ? pages : ["<p><br></p>"];
  } finally { measure.remove(); }
}
