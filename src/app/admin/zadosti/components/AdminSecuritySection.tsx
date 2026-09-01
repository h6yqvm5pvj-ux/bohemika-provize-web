"use client";

import { useMemo } from "react";
import {
  Check,
  Inbox,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";

import {
  formatAccountTypeLabel,
  formatAuthDateTime,
  formatPositionLabel,
  nameFromEmail,
} from "../adminFormatters";
import {
  ADMIN_SECURITY_FILTERS,
  filterAdminSecurityRows,
  getMfaFactorLabel,
  summarizeAdminSecurityRows,
  type AdminSecurityFilter,
  type AdminSecurityUserRow,
} from "../adminSecurity";

export type AdminSecuritySectionClasses = {
  section: string;
  topBar: string;
  badge: string;
  softPanel: string;
  metric: string;
  subtleButton: string;
  field: string;
};

type AdminSecuritySectionProps = {
  classes: AdminSecuritySectionClasses;
  rows: AdminSecurityUserRow[];
  loading: boolean;
  error: string | null;
  filter: AdminSecurityFilter;
  search: string;
  onRefresh: () => void;
  onFilterChange: (filter: AdminSecurityFilter) => void;
  onSearchChange: (search: string) => void;
};

export function AdminSecuritySection({
  classes,
  rows,
  loading,
  error,
  filter,
  search,
  onRefresh,
  onFilterChange,
  onSearchChange,
}: AdminSecuritySectionProps) {
  const filteredRows = useMemo(
    () => filterAdminSecurityRows(rows, filter, search),
    [filter, rows, search]
  );
  const stats = useMemo(() => summarizeAdminSecurityRows(rows), [rows]);

  return (
    <section className={classes.section}>
      <div className={classes.topBar} />

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className={classes.badge}>Zabezpečení</span>
          <h2 className="inline-flex items-center gap-1.5 text-xl font-bold tracking-[-0.02em] !text-white sm:text-2xl">
            <ShieldCheck
              size={20}
              strokeWidth={2}
              className="!text-violet-100"
              aria-hidden="true"
            />
            <span>2FA přehled uživatelů</span>
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed !text-violet-100/70">
            Přehled čte aktivní druhé faktory přímo z Firebase Auth.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className={classes.subtleButton}
        >
          <RefreshCw size={15} strokeWidth={2.2} aria-hidden="true" />
          Obnovit
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={classes.metric}>
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] !text-violet-200/78">
              Celkem
            </div>
            <Inbox
              size={15}
              strokeWidth={2.1}
              className="!text-violet-100/70"
              aria-hidden="true"
            />
          </div>
          <div className="mt-2 text-2xl font-bold !text-white">{stats.total}</div>
        </div>
        <div className={classes.metric}>
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] !text-violet-200/78">
              2FA aktivní
            </div>
            <ShieldCheck
              size={15}
              strokeWidth={2.2}
              className="!text-violet-100"
              aria-hidden="true"
            />
          </div>
          <div className="mt-2 text-2xl font-bold !text-white">{stats.mfaEnabled}</div>
        </div>
        <div className="rounded-2xl border border-rose-700 bg-rose-600 px-3 py-3 shadow-[0_10px_22px_rgba(225,29,72,0.28)]">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-50">
              Bez 2FA
            </div>
            <ShieldAlert
              size={15}
              strokeWidth={2.2}
              className="text-rose-50"
              aria-hidden="true"
            />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">{stats.mfaMissing}</div>
        </div>
        <div className={classes.metric}>
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] !text-violet-200/78">
              Ověřený e-mail
            </div>
            <Check
              size={15}
              strokeWidth={2.3}
              className="!text-violet-100"
              aria-hidden="true"
            />
          </div>
          <div className="mt-2 text-2xl font-bold !text-white">{stats.emailVerified}</div>
        </div>
      </div>

      <div className={`mt-4 ${classes.softPanel}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div
            className="inline-flex w-full rounded-2xl border border-white/14 bg-white/[0.06] p-1 shadow-[0_12px_28px_rgba(7,6,25,0.18)] lg:w-auto"
            role="tablist"
            aria-label="Filtr zabezpečení"
          >
            {ADMIN_SECURITY_FILTERS.map((filterOption) => {
              const active = filter === filterOption.id;
              return (
                <button
                  key={filterOption.id}
                  type="button"
                  onClick={() => onFilterChange(filterOption.id)}
                  className={`inline-flex flex-1 items-center justify-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition lg:flex-none ${
                    active
                      ? "border border-violet-300/35 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_58%,#c084fc_100%)] !text-white shadow-[0_10px_18px_rgba(124,58,237,0.28)]"
                      : "border border-transparent !text-violet-100/66 hover:!text-white"
                  }`}
                >
                  {filterOption.id === "enabled" ? (
                    <ShieldCheck size={12} strokeWidth={2.2} aria-hidden="true" />
                  ) : filterOption.id === "disabled" ? (
                    <ShieldAlert size={12} strokeWidth={2.2} aria-hidden="true" />
                  ) : (
                    <Inbox size={12} strokeWidth={2.2} aria-hidden="true" />
                  )}
                  {filterOption.label}
                </button>
              );
            })}
          </div>

          <label className="relative block w-full lg:max-w-sm">
            <Search
              size={14}
              strokeWidth={2.1}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              className={`${classes.field} pl-9`}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Hledat jméno, e-mail nebo pozici..."
            />
          </label>
        </div>

        {error ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </div>

      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="rounded-2xl border border-white/14 bg-white/[0.05] px-4 py-8 text-center text-sm !text-violet-100/72">
            Načítám zabezpečení uživatelů…
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-white/14 bg-white/[0.05] px-4 py-8 text-center text-sm !text-violet-100/72">
            Pro zvolený filtr nejsou žádní uživatelé.
          </div>
        ) : (
          filteredRows.map((row) => {
            const title = row.fullName || nameFromEmail(row.email);
            const avatarInitial = (
              title.trim().charAt(0) || row.email.charAt(0)
            ).toUpperCase();
            const mfaEnabled = row.mfa.enabled;
            const accountTypeLabel = formatAccountTypeLabel(row.accountType);
            const positionLabel = formatPositionLabel(row.position);

            return (
              <div
                key={row.uid}
                className="relative overflow-hidden rounded-3xl border border-white/12 bg-white/[0.07] p-4 shadow-[0_16px_34px_rgba(7,6,25,0.22)]"
              >
                <span
                  className={`pointer-events-none absolute inset-x-0 top-0 h-1 ${
                    mfaEnabled ? "bg-violet-500" : "bg-rose-500"
                  }`}
                />
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${
                        mfaEnabled
                          ? "border-violet-300/35 bg-violet-400/14 !text-violet-100"
                          : "border-rose-200 bg-rose-50 text-rose-700"
                      }`}
                    >
                      {avatarInitial}
                    </span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="min-w-0 max-w-full truncate text-lg font-bold !text-white">
                          {title}
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                            row.accountType === "tipster"
                              ? "border-violet-200 bg-violet-50 text-violet-700"
                              : row.accountType === "advisor"
                                ? "border-violet-300/30 bg-violet-400/12 !text-violet-100"
                                : "border-slate-200 bg-slate-50 text-slate-600"
                          }`}
                        >
                          {accountTypeLabel}
                        </span>
                        {positionLabel ? (
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                            {positionLabel}
                          </span>
                        ) : null}
                      </div>
                      <div className="truncate text-sm !text-violet-100/58">
                        {row.email}
                      </div>
                      {row.disabled ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                            Deaktivovaný účet
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 lg:justify-end">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${
                        mfaEnabled
                          ? "border-violet-300/30 bg-violet-400/12 !text-violet-100"
                          : "border-rose-200 bg-rose-50 text-rose-700"
                      }`}
                    >
                      {mfaEnabled ? (
                        <ShieldCheck size={13} strokeWidth={2.2} aria-hidden="true" />
                      ) : (
                        <ShieldAlert size={13} strokeWidth={2.2} aria-hidden="true" />
                      )}
                      {mfaEnabled ? "2FA aktivní" : "Bez 2FA"}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${
                        row.emailVerified
                          ? "border-sky-200 bg-sky-50 text-sky-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {row.emailVerified ? (
                        <Check size={13} strokeWidth={2.3} aria-hidden="true" />
                      ) : (
                        <X size={13} strokeWidth={2.3} aria-hidden="true" />
                      )}
                      {row.emailVerified ? "E-mail ověřen" : "E-mail neověřen"}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 text-xs !text-violet-100/72 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/12 bg-white/[0.055] px-3 py-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] !text-violet-200/60">
                      Vytvořen
                    </div>
                    <div className="mt-1 font-semibold !text-white">
                      {formatAuthDateTime(row.createdAt)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-white/[0.055] px-3 py-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] !text-violet-200/60">
                      Poslední přihlášení
                    </div>
                    <div className="mt-1 font-semibold !text-white">
                      {formatAuthDateTime(row.lastSignInAt)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-white/[0.055] px-3 py-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] !text-violet-200/60">
                      Druhé faktory
                    </div>
                    <div className="mt-1 font-semibold !text-white">
                      {row.mfa.factorCount > 0
                        ? `${row.mfa.factorCount} aktivní`
                        : "Žádný"}
                    </div>
                  </div>
                </div>

                {row.mfa.factors.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {row.mfa.factors.map((factor) => (
                      <span
                        key={factor.uid}
                        className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/30 bg-violet-400/12 px-3 py-1 text-xs font-semibold !text-violet-100"
                        title={
                          factor.enrollmentTime
                            ? `Zapsáno: ${formatAuthDateTime(factor.enrollmentTime)}`
                            : undefined
                        }
                      >
                        <ShieldCheck size={13} strokeWidth={2.2} aria-hidden="true" />
                        {getMfaFactorLabel(factor)}
                        {factor.displayName ? ` · ${factor.displayName}` : ""}
                        {factor.phoneNumber ? ` · ${factor.phoneNumber}` : ""}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
