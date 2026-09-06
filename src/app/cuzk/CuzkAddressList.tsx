import { ArrowUpRight, MapPin } from "lucide-react";
import styles from "./cuzkSearch.module.css";

export type RuianMatch = {
  kod: number;
  adresa: string;
  psc?: number;
  cislodomovni?: number;
  cisloorientacni?: number;
  cisloorientacnipismeno?: string;
  stavebniobjekt?: number | null;
};

const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("cs-CZ");

function AddressLabel({ address, query }: { address: string; query: string }) {
  // Track source offsets so highlighting keeps the original spelling and accents.
  let normalized = "";
  const offsets: { start: number; end: number }[] = [];
  let offset = 0;
  for (const character of address) {
    const folded = fold(character);
    normalized += folded;
    for (let index = 0; index < folded.length; index++) offsets.push({ start: offset, end: offset + character.length });
    offset += character.length;
  }
  const highlighted = new Set<number>();
  for (const token of new Set(fold(query).match(/[a-z0-9]+/g) ?? [])) {
    if (token.length < 2 && !/^\d+$/.test(token)) continue;
    let start = normalized.indexOf(token);
    while (start >= 0) {
      for (let index = offsets[start].start; index < offsets[start + token.length - 1].end; index++) highlighted.add(index);
      start = normalized.indexOf(token, start + token.length);
    }
  }
  const parts: { text: string; marked: boolean }[] = [];
  for (let index = 0; index < address.length; index++) {
    const marked = highlighted.has(index);
    const previous = parts.at(-1);
    if (previous?.marked === marked) previous.text += address[index];
    else parts.push({ text: address[index], marked });
  }
  return <>{parts.map((part, index) => part.marked ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>)}</>;
}

export function CuzkAddressList({ matches, query, activeIndex = -1, onActive, onPick, suggestions = true }: {
  matches: RuianMatch[];
  query: string;
  activeIndex?: number;
  onActive?: (index: number) => void;
  onPick: (match: RuianMatch) => void;
  suggestions?: boolean;
}) {
  return <div id={suggestions ? "cuzk-suggestions" : undefined} role={suggestions ? "listbox" : undefined} aria-label="Nalezené adresy" className={styles.options}>
    {matches.map((match, index) => {
      const zip = String(match.psc ?? "").replace(/\s/g, "");
      return <button
        key={`${match.kod}-${match.adresa}`}
        id={suggestions ? `cuzk-suggestion-${index}` : undefined}
        type="button"
        role={suggestions ? "option" : undefined}
        aria-selected={suggestions ? index === activeIndex : undefined}
        tabIndex={suggestions ? -1 : 0}
        onMouseDown={event => { if (suggestions) event.preventDefault(); }}
        onClick={() => onPick(match)}
        onMouseEnter={() => onActive?.(index)}
        className={styles.option}
        data-active={index === activeIndex}
      >
        <span className={styles.pin}><MapPin size={17} aria-hidden="true" /></span>
        <span className={styles.address}>
          <span className={styles.addressText}><AddressLabel address={match.adresa} query={query} /></span>
          <span className={styles.meta}>{/^\d{5}$/.test(zip) ? `PSČ ${zip.slice(0, 3)} ${zip.slice(3)} · ` : ""}Adresní místo</span>
        </span>
        <ArrowUpRight size={17} className={styles.openIcon} aria-hidden="true" />
      </button>;
    })}
  </div>;
}
