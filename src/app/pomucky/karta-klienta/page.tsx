"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  BookOpenText,
  ChevronRight,
  Download,
  Eye,
  FileBadge2,
  FileText,
  IdCard,
  Mail,
  MapPin,
  Navigation,
  Phone,
  ScanLine,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import SplitTitle from "../plan-produkce/SplitTitle";

type ClientDocument = {
  id: string;
  label: string;
  type: "OP" | "ŘP" | "Pas" | "Jiné";
  documentNumber: string;
  validFrom: string;
  validTo: string;
  uploadedAt: string;
};

type ClientNote = {
  id: string;
  date: string;
  text: string;
};

type ContractDocument = {
  id: string;
  label: string;
  previewUrl?: string;
  downloadUrl?: string;
};

type ClientContract = {
  id: string;
  contractNumber: string;
  productName: string;
  managerName: string;
  signedDate: string;
  policyStartDate: string;
  documents: ContractDocument[];
  scanUrl?: string;
};

const CLIENT = {
  fullName: "Jan Novák",
  birthNumber: "850101/1234",
  permanentAddress: "Křižíkova 123/45, 186 00 Praha 8",
  correspondenceAddress: "Na Pankráci 89/15, 140 00 Praha 4",
  mobile: "+420777123456",
  email: "jan.novak@email.cz",
};

const CLIENT_DOCUMENTS: ClientDocument[] = [
  {
    id: "doc-1",
    label: "Občanský průkaz",
    type: "OP",
    documentNumber: "206987541",
    validFrom: "2021-05-01",
    validTo: "2031-05-01",
    uploadedAt: "2026-03-01",
  },
  {
    id: "doc-2",
    label: "Řidičský průkaz",
    type: "ŘP",
    documentNumber: "EJ445566",
    validFrom: "2023-04-15",
    validTo: "2033-04-15",
    uploadedAt: "2026-03-01",
  },
];

const CLIENT_NOTES: ClientNote[] = [
  {
    id: "note-1",
    date: "2026-03-10",
    text: "Klient preferuje telefonický kontakt po 16:00.",
  },
  {
    id: "note-2",
    date: "2026-03-18",
    text: "Domluvena kontrolní schůzka k majetkovému pojištění.",
  },
];

const CLIENT_CONTRACTS: ClientContract[] = [
  {
    id: "contract-1",
    contractNumber: "8001234567",
    productName: "ČPP DOMEX",
    managerName: "Petr Dvořák",
    signedDate: "2026-02-12",
    policyStartDate: "2026-03-01",
    documents: [
      {
        id: "contract-1-doc-1",
        label: "Smlouva DOMEX (PDF)",
        previewUrl: "/smlouvy",
        downloadUrl: "/smlouvy",
      },
      {
        id: "contract-1-doc-2",
        label: "Příloha – rozsah krytí",
        previewUrl: "/smlouvy",
        downloadUrl: "/smlouvy",
      },
    ],
    scanUrl: "/smlouvy",
  },
  {
    id: "contract-2",
    contractNumber: "9002345678",
    productName: "Kooperativa Auto",
    managerName: "Petr Dvořák",
    signedDate: "2025-11-08",
    policyStartDate: "2025-11-15",
    documents: [
      {
        id: "contract-2-doc-1",
        label: "Smlouva Auto (PDF)",
        previewUrl: "/smlouvy",
        downloadUrl: "/smlouvy",
      },
    ],
    scanUrl: "/smlouvy",
  },
];

function mapLinksForAddress(address: string) {
  const encoded = encodeURIComponent(address);
  return {
    googleMaps: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    waze: `https://www.waze.com/ul?q=${encoded}&navigate=yes`,
  };
}

function ToggleButton({
  open,
  onClick,
  openLabel,
  closedLabel,
  icon,
  count,
}: {
  open: boolean;
  onClick: () => void;
  openLabel: string;
  closedLabel: string;
  icon: ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full border border-sky-200/45 bg-gradient-to-r from-sky-300/22 via-blue-300/16 to-cyan-300/16 px-3.5 py-1.5 text-sm text-sky-50 backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] transition hover:from-sky-300/30 hover:to-cyan-300/24"
    >
      <span className="text-sky-100">{icon}</span>
      <span>{open ? openLabel : closedLabel}</span>
      {typeof count === "number" && (
        <span className="rounded-full border border-sky-100/40 bg-sky-200/20 px-2 py-0.5 text-[11px] text-sky-50">
          {count}
        </span>
      )}
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full border border-sky-100/45 bg-sky-100/20 text-[10px] transition-transform ${
          open ? "rotate-90" : ""
        }`}
      >
        <ChevronRight className="h-3 w-3" />
      </span>
    </button>
  );
}

export default function ClientCardPage() {
  const [showDocuments, setShowDocuments] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showContracts, setShowContracts] = useState(false);
  const [activeContractId, setActiveContractId] = useState<string | null>(null);

  const permanentAddressLinks = useMemo(
    () => mapLinksForAddress(CLIENT.permanentAddress),
    []
  );
  const correspondenceAddressLinks = useMemo(
    () => mapLinksForAddress(CLIENT.correspondenceAddress),
    []
  );

  return (
    <AppLayout active="tools">
      <div className="relative w-full max-w-5xl space-y-4">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -left-10 h-56 w-56 rounded-full bg-sky-400/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-14 right-0 h-64 w-64 rounded-full bg-blue-400/20 blur-3xl"
        />

        <header className="space-y-0.5">
          <SplitTitle text="Karta klienta" />
          <p className="text-sm text-slate-300">Rychlý náhled klientských údajů.</p>
        </header>

        <section className="relative overflow-hidden rounded-3xl border border-sky-200/35 bg-gradient-to-br from-sky-400/22 via-blue-400/16 to-slate-900/25 p-4 backdrop-blur-3xl shadow-[0_20px_55px_rgba(3,24,68,0.48)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-sky-100/80 to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-cyan-300/22 blur-3xl"
          />
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-sky-200/35 bg-sky-200/15 text-sky-50">
              <UserRound className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-2xl font-semibold text-white">{CLIENT.fullName}</h2>
              <p className="mt-0.5 text-sm text-sky-100/85">Detail klienta</p>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <article className="rounded-2xl border border-sky-100/35 bg-white/[0.08] p-3 backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]">
              <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-sky-100/85">
                <IdCard className="h-3.5 w-3.5" />
                Rodné číslo
              </p>
              <p className="mt-1 text-base text-slate-50">{CLIENT.birthNumber}</p>
            </article>

            <article className="rounded-2xl border border-sky-100/35 bg-white/[0.08] p-3 backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]">
              <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-sky-100/85">
                <Phone className="h-3.5 w-3.5" />
                Kontakt
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <a
                  href={`tel:${CLIENT.mobile}`}
                  className="inline-flex items-center gap-2 text-slate-50 hover:text-sky-100"
                >
                  <Phone className="h-3.5 w-3.5 text-sky-100/80" />
                  Mobil: {CLIENT.mobile}
                </a>
                <a
                  href={`mailto:${CLIENT.email}`}
                  className="inline-flex items-center gap-2 text-slate-50 hover:text-sky-100"
                >
                  <Mail className="h-3.5 w-3.5 text-sky-100/80" />
                  E-mail: {CLIENT.email}
                </a>
              </div>
            </article>

            <article className="rounded-2xl border border-sky-100/35 bg-white/[0.08] p-3 backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]">
              <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-sky-100/85">
                <MapPin className="h-3.5 w-3.5" />
                Adresa trvalá
              </p>
              <p className="mt-1 text-sm text-slate-50">{CLIENT.permanentAddress}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <a
                  href={permanentAddressLinks.googleMaps}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-sky-100/40 bg-sky-100/14 px-2.5 py-1 text-sky-50 hover:bg-sky-100/24"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  Google Mapy
                </a>
                <a
                  href={permanentAddressLinks.waze}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-sky-100/40 bg-sky-100/14 px-2.5 py-1 text-sky-50 hover:bg-sky-100/24"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  Waze
                </a>
              </div>
            </article>

            <article className="rounded-2xl border border-sky-100/35 bg-white/[0.08] p-3 backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]">
              <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-sky-100/85">
                <MapPin className="h-3.5 w-3.5" />
                Adresa korespondenční
              </p>
              <p className="mt-1 text-sm text-slate-50">{CLIENT.correspondenceAddress}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <a
                  href={correspondenceAddressLinks.googleMaps}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-sky-100/40 bg-sky-100/14 px-2.5 py-1 text-sky-50 hover:bg-sky-100/24"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  Google Mapy
                </a>
                <a
                  href={correspondenceAddressLinks.waze}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-sky-100/40 bg-sky-100/14 px-2.5 py-1 text-sky-50 hover:bg-sky-100/24"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  Waze
                </a>
              </div>
            </article>
          </div>
        </section>

        <section className="flex flex-wrap items-center gap-2">
          <ToggleButton
            open={showDocuments}
            onClick={() => setShowDocuments((value) => !value)}
            openLabel="Skrýt doklady"
            closedLabel="Zobrazit doklady"
            icon={<ShieldCheck className="h-4 w-4" />}
            count={CLIENT_DOCUMENTS.length}
          />
          <ToggleButton
            open={showNotes}
            onClick={() => setShowNotes((value) => !value)}
            openLabel="Skrýt poznámky"
            closedLabel="Zobrazit poznámky"
            icon={<BookOpenText className="h-4 w-4" />}
            count={CLIENT_NOTES.length}
          />
          <ToggleButton
            open={showContracts}
            onClick={() => setShowContracts((value) => !value)}
            openLabel="Skrýt smlouvy"
            closedLabel="Zobrazit smlouvy"
            icon={<FileText className="h-4 w-4" />}
            count={CLIENT_CONTRACTS.length}
          />
        </section>

        {showDocuments && (
          <section className="space-y-2">
            <div className="rounded-2xl border border-sky-200/35 bg-gradient-to-br from-sky-400/16 to-blue-400/10 p-3 backdrop-blur-3xl">
              <ul className="grid grid-cols-1 gap-2 text-sm text-slate-100 md:grid-cols-2">
                {CLIENT_DOCUMENTS.map((document) => (
                  <li
                    key={document.id}
                    className="rounded-xl border border-sky-100/30 bg-white/[0.08] px-3 py-2.5 backdrop-blur-2xl"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2">
                        <FileBadge2 className="h-4 w-4 text-sky-100/80" />
                        {document.label}
                      </span>
                      <span className="text-xs text-slate-200/80">
                        {document.type} · nahráno {new Date(document.uploadedAt).toLocaleDateString("cs-CZ")}
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-1 gap-1.5 text-xs text-slate-100 sm:grid-cols-3">
                      <div className="rounded-lg border border-sky-100/25 bg-sky-100/12 px-2 py-1">
                        <p className="text-slate-300/85">Číslo dokladu</p>
                        <p className="mt-0.5 font-medium">{document.documentNumber}</p>
                      </div>
                      <div className="rounded-lg border border-sky-100/25 bg-sky-100/12 px-2 py-1">
                        <p className="text-slate-300/85">Platnost od</p>
                        <p className="mt-0.5 font-medium">
                          {new Date(document.validFrom).toLocaleDateString("cs-CZ")}
                        </p>
                      </div>
                      <div className="rounded-lg border border-sky-100/25 bg-sky-100/12 px-2 py-1">
                        <p className="text-slate-300/85">Platnost do</p>
                        <p className="mt-0.5 font-medium">
                          {new Date(document.validTo).toLocaleDateString("cs-CZ")}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {showNotes && (
          <section className="space-y-2">
            <div className="rounded-2xl border border-sky-200/35 bg-gradient-to-br from-sky-400/16 to-blue-400/10 p-3 backdrop-blur-3xl">
              <ul className="space-y-1.5 text-sm">
                {CLIENT_NOTES.map((note) => (
                  <li
                    key={note.id}
                    className="rounded-xl border border-sky-100/30 bg-white/[0.08] px-3 py-2 text-slate-100 backdrop-blur-2xl"
                  >
                    <p className="inline-flex items-center gap-1 text-xs text-slate-200/80">
                      <BookOpenText className="h-3.5 w-3.5" />
                      {new Date(note.date).toLocaleDateString("cs-CZ")}
                    </p>
                    <p className="mt-1">{note.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {showContracts && (
          <section className="space-y-2">
            <div className="rounded-2xl border border-sky-200/35 bg-gradient-to-br from-sky-400/16 to-blue-400/10 p-3 backdrop-blur-3xl">
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {CLIENT_CONTRACTS.map((contract) => {
                  const isOpen = activeContractId === contract.id;
                  return (
                    <article
                      key={contract.id}
                      className="rounded-2xl border border-sky-100/30 bg-white/[0.08] p-2.5 backdrop-blur-2xl"
                    >
                      <button
                        type="button"
                        onClick={() => setActiveContractId((current) => (current === contract.id ? null : contract.id))}
                        className="flex w-full items-center justify-between gap-3 text-left"
                      >
                        <div>
                          <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-100">
                            <FileText className="h-4 w-4 text-sky-100/80" />
                            {contract.contractNumber}
                          </p>
                          <p className="text-sm text-slate-200/85">{contract.productName}</p>
                        </div>
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border border-sky-100/45 bg-sky-100/20 text-xs transition-transform ${
                            isOpen ? "rotate-90" : ""
                          }`}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </span>
                      </button>

                      {isOpen && (
                        <div className="mt-2.5 space-y-2 border-t border-sky-100/25 pt-2.5">
                          <div className="grid gap-1.5 text-sm">
                            <p className="text-slate-100">
                              <span className="inline-flex items-center gap-1 text-slate-300/80">
                                <UserRound className="h-3.5 w-3.5" />
                                Správce smlouvy:
                              </span>{" "}
                              {contract.managerName}
                            </p>
                            <p className="text-slate-100">
                              <span className="text-slate-300/80">Datum sjednání:</span>{" "}
                              {new Date(contract.signedDate).toLocaleDateString("cs-CZ")}
                            </p>
                            <p className="text-slate-100">
                              <span className="text-slate-300/80">Datum počátku:</span>{" "}
                              {new Date(contract.policyStartDate).toLocaleDateString("cs-CZ")}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {contract.documents.map((document) => (
                              <div
                                key={document.id}
                                className="rounded-xl border border-sky-100/30 bg-sky-100/12 px-2.5 py-1.5 text-xs text-slate-100"
                              >
                                <p className="mb-1 inline-flex items-center gap-1.5">
                                  <FileText className="h-3.5 w-3.5 text-sky-100/80" />
                                  {document.label}
                                </p>
                                <div className="flex gap-2">
                                  {document.previewUrl && (
                                    <Link
                                      href={document.previewUrl}
                                      className="inline-flex items-center gap-1 rounded-full border border-sky-100/40 bg-sky-100/16 px-2 py-0.5 hover:bg-sky-100/24"
                                    >
                                      <Eye className="h-3 w-3" />
                                      Náhled
                                    </Link>
                                  )}
                                  {document.downloadUrl && (
                                    <Link
                                      href={document.downloadUrl}
                                      className="inline-flex items-center gap-1 rounded-full border border-sky-100/40 bg-sky-100/16 px-2 py-0.5 hover:bg-sky-100/24"
                                    >
                                      <Download className="h-3 w-3" />
                                      Stažení
                                    </Link>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>

                          <div>
                            {contract.scanUrl ? (
                              <Link
                                href={contract.scanUrl}
                                className="inline-flex items-center gap-1 rounded-full border border-sky-100/45 bg-sky-100/20 px-2.5 py-1 text-xs text-sky-50 hover:bg-sky-100/28"
                              >
                                <ScanLine className="h-3.5 w-3.5" />
                                Skenovat dokumenty
                              </Link>
                            ) : (
                              <span className="text-xs text-slate-400">
                                Skenování dokumentů není zatím dostupné.
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </div>
    </AppLayout>
  );
}
