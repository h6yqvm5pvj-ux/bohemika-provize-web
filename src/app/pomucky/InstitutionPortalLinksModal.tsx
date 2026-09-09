"use client";

import Image from "next/image";
import { ArrowUpRight, Link2, Search, X } from "lucide-react";
import { useRef, useState } from "react";
import { useDirectoryDialog } from "./useDirectoryDialog";
import ui from "./directoryModal.module.css";
import styles from "./InstitutionPortalLinksModal.module.css";

type InstitutionPortalTarget = {
  key: string;
  label: string;
  href: string;
  logoPath: string;
};

const INSTITUTION_PORTAL_TARGETS: InstitutionPortalTarget[] = [
  {
    key: "maxx",
    label: "Maxx",
    href: "https://sjednatel.bohemiaservis.cz/login",
    logoPath: "/icons/bohemika-chrome-symbol.png",
  },
  {
    key: "bsf-aplikace",
    label: "BSF Aplikace",
    href: "https://bsfaplikace.cz/sign/",
    logoPath: "/icons/bohemika-chrome-symbol.png",
  },
  {
    key: "cpp-sus",
    label: "ČPP SUS",
    href: "https://susp-landing-page.cpp.cz/",
    logoPath: "/icons/cpp.png",
  },
  {
    key: "allianz-alfa",
    label: "Allianz Alfa",
    href: "https://allfa.allianz.cz/login/?ref=/homepage",
    logoPath: "/icons/allianz.png",
  },
  {
    key: "uniqa-unihub",
    label: "UNIQA UniHub",
    href: "https://login.uniqa.cz/",
    logoPath: "/icons/uniqa.png",
  },
  {
    key: "kooperativa-knz",
    label: "Kooperativa KNZ",
    href: "https://knz-landing-page.koop.cz/",
    logoPath: "/icons/koop.png",
  },
  {
    key: "csob-zeus",
    label: "ČSOB Zeus",
    href: "https://cassell.csobpoj.cz/cas/login?service=https%3A%2F%2Fzeus.csobpoj.cz%2Fzeus%2Flogin%2Fcas",
    logoPath: "/icons/csb.png",
  },
  {
    key: "maxima-secure2",
    label: "MAXIMA Secure2",
    href: "https://www.maximapojistovna.cz/pojistenionline/secure2/index.php",
    logoPath: "/icons/maxima.png",
  },
  {
    key: "pillow-portal",
    label: "Pillow",
    href: "https://portal.pillow.cz/login",
    logoPath: "/icons/pillow.png",
  },
  {
    key: "investika",
    label: "iNVESTiKA",
    href: "https://portal.investika.cz/login",
    logoPath: "/icons/invstk.png",
  },
  {
    key: "conseq",
    label: "CONSEQ",
    href: "https://www.conseq.cz/my-conseq/login?returnurl=%2fmy-conseq%2f",
    logoPath: "/icons/conseq.png",
  },
  {
    key: "comfort-commodity",
    label: "Comfort Commodity",
    href: "https://eshop.comfort-commodity.cz/#/",
    logoPath: "/icons/cclogo.png",
  },
];

type InstitutionPortalLinksModalProps = {
  onClose: () => void;
};

export function InstitutionPortalLinksModal({ onClose }: InstitutionPortalLinksModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  useDirectoryDialog(panelRef, onClose);
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const targets = INSTITUTION_PORTAL_TARGETS.filter((target) =>
    normalize(`${target.label} ${new URL(target.href).hostname}`).includes(normalize(search.trim()))
  );
  return (
    <div className={ui.overlay}>
      <button type="button" className={ui.backdrop} onClick={onClose} aria-label="Zavřít dialog" tabIndex={-1} />
      <div ref={panelRef} tabIndex={-1} className={`${ui.panel} ${styles.panel}`} role="dialog" aria-modal="true" aria-labelledby="portal-links-title">
        <header className={ui.header}>
          <span className={ui.headerIcon}><Link2 size={22} strokeWidth={1.7} aria-hidden="true" /></span>
          <div className={ui.heading}>
            <p className={ui.eyebrow}>Pracovní nástroje</p>
            <h2 className={ui.title} id="portal-links-title">Odkazy</h2>
            <p className={ui.subtitle}>Všechny partnerské portály na jednom místě.</p>
          </div>
          <button type="button" onClick={onClose} className={ui.close} aria-label="Zavřít"><X size={18} /></button>
        </header>
        <div className={ui.toolbar}>
          <div className={ui.searchRow}>
            <div className={ui.search}>
              <Search size={17} aria-hidden="true" />
              <input aria-label="Hledat portál" placeholder="Hledat instituci nebo portál…" value={search} onChange={(event) => setSearch(event.target.value)} />
              {search && <button type="button" onClick={() => setSearch("")} aria-label="Vymazat hledání"><X size={15} /></button>}
            </div>
            <span className={ui.count}>Portály · {targets.length} / {INSTITUTION_PORTAL_TARGETS.length}</span>
          </div>
        </div>
        <div className={`${ui.content} ${styles.grid}`}>
          {targets.map((target) => (
            <a key={target.key} href={target.href} target="_blank" rel="noopener noreferrer" className={styles.portalCard} onClick={onClose}>
              <span className={styles.logo}><Image src={target.logoPath} alt="" width={64} height={44} /></span>
              <div className={styles.copy}>
                <h3>{target.label}</h3>
                <p>{new URL(target.href).hostname.replace(/^www\./, "")}</p>
              </div>
              <span className={styles.arrow}><ArrowUpRight size={18} aria-hidden="true" /></span>
            </a>
          ))}
          {targets.length === 0 && <div className={ui.empty}><Search size={28} /><p>Žádný portál neodpovídá hledání.</p><button type="button" onClick={() => setSearch("")}>Zobrazit všechny portály</button></div>}
        </div>
        <footer className={ui.footer}><ArrowUpRight size={13} aria-hidden="true" />Portály se otevřou v nové kartě.</footer>
      </div>
    </div>
  );
}
