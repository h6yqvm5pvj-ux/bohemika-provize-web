import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, FileStack, Search, X } from "lucide-react";
import { PartnerLogoSculpture } from "@/components/PartnerLogoSculpture";
import { institutionLogoImageClass, institutionLogoKeyFromPath } from "@/app/lib/institutionLogoDisplay";
import styles from "./documents.module.css";

export function DocumentsArtwork() {
  return <svg viewBox="0 0 240 160" fill="none" aria-hidden="true">
    <ellipse cx="126" cy="82" rx="104" ry="68" fill="#f2ecf7" />
    <g transform="rotate(-9 116 78)"><rect x="57" y="25" width="93" height="111" rx="8" fill="#e2d4ec" stroke="#d3c0e0" /></g>
    <g transform="rotate(7 139 77)"><path d="M103 15h63l19 19v96a7 7 0 0 1-7 7h-75a7 7 0 0 1-7-7V22a7 7 0 0 1 7-7Z" fill="#fff" stroke="#dacde3" /><path d="M166 15v13a6 6 0 0 0 6 6h13" fill="#f2eaf8" stroke="#dacde3" /><path d="M112 46h31M112 64h57M112 76h57M112 88h41" stroke="#dcd0e7" strokeWidth="4" strokeLinecap="round" /></g>
    <path d="M40 94a8 8 0 0 1 8-8h34l10 11h94a8 8 0 0 1 8 8v35a8 8 0 0 1-8 8H48a8 8 0 0 1-8-8V94Z" fill="#faf7fc" stroke="#cdb8dc" />
    <path d="M53 110h128M53 121h82" stroke="#e0d2e9" strokeWidth="3" strokeLinecap="round" />
    <circle cx="189" cy="118" r="24" fill="#fff" stroke="#dccfe5" strokeWidth="3" /><circle cx="186" cy="115" r="10" stroke="#a586b7" strokeWidth="2" /><path d="m193 122 7 7" stroke="#a586b7" strokeWidth="3" strokeLinecap="round" />
    <path d="M38 50h9m-4-4v9M207 62h8m-4-4v8" stroke="#c6acd5" strokeWidth="1.5" strokeLinecap="round" />
  </svg>;
}

export function DocumentsLogo({ src, label, index = 0 }: { src: string; label: string; index?: number }) {
  return <span className={styles.logoStage} aria-hidden="true"><PartnerLogoSculpture src={src} label={label} index={index}
    imageClassName={`${styles.logoArtwork} ${institutionLogoImageClass(institutionLogoKeyFromPath(src))}`} /></span>;
}

export function DocumentsHeader({ title, description, kicker = "Knihovna · Pomůcky", backHref, backLabel, logo, children }: {
  title: string; description: string; kicker?: string; backHref?: string; backLabel?: string;
  logo?: { src: string; label: string }; children?: ReactNode;
}) {
  return <>
    {backHref && <Link href={backHref} className={styles.backLink}><ArrowLeft size={14} aria-hidden="true" />{backLabel ?? "Zpět na dokumenty"}</Link>}
    <header className={styles.hero}>
      <div><p className={styles.eyebrow}><FileStack size={14} aria-hidden="true" />{kicker}</p><h1>{title}<span>.</span></h1><p className={styles.heroDescription}>{description}</p>{children}</div>
      <div className={styles.heroArt}>{logo ? <DocumentsLogo src={logo.src} label={logo.label} /> : <DocumentsArtwork />}</div>
    </header>
  </>;
}

export function DocumentsSearch({ id, label, placeholder, value, onChange }: {
  id: string; label: string; placeholder: string; value: string; onChange: (value: string) => void;
}) {
  return <div className={styles.searchField}>
    <label htmlFor={id} className="sr-only">{label}</label><Search size={18} aria-hidden="true" />
    <input id={id} type="search" value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} autoComplete="off" />
    {value && <button type="button" onClick={() => onChange("")} aria-label="Vymazat hledání"><X size={15} aria-hidden="true" /></button>}
  </div>;
}
