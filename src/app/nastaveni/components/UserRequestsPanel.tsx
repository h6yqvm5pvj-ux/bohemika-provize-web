"use client";

import { useEffect, useId, useState } from "react";
import {
  Bug,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  ImagePlus,
  Images,
  Paperclip,
  ShieldCheck,
  Snail,
  UsersRound,
  X,
  Zap,
} from "lucide-react";

import type { CommissionMode } from "../../types/domain";
import { formatDateTime } from "../subscriptionSettings";
import {
  USER_REQUEST_AGENCY_NUMBER_MAX_LEN,
  USER_REQUEST_CORPORATE_EMAIL_MAX_LEN,
  USER_REQUEST_FULL_NAME_MAX_LEN,
  USER_REQUEST_MANAGER_EMAIL_MAX_LEN,
  USER_REQUEST_MESSAGE_MAX_LEN,
  USER_REQUEST_MESSAGE_MIN_LEN,
  USER_REQUEST_PRIORITY_LABEL,
  USER_REQUEST_SCREENSHOT_MAX_FILES,
  USER_REQUEST_STATUS_CLASS,
  USER_REQUEST_STATUS_LABEL,
  USER_REQUEST_STEPS,
  USER_REQUEST_SUBJECT_LABEL,
  buildUserRequestSlaInfo,
  formatDurationCompact,
  type UserRequestPayload,
  type UserRequestPriority,
  type UserRequestScreenshotPayload,
  type UserRequestSubject,
  type UserRequestsView,
} from "../userRequestSettings";

type InlineStatus = {
  type: "success" | "error" | "info";
  message: string;
};

const formatFileSize = (sizeBytes: number): string => {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toLocaleString("cs-CZ", {
      maximumFractionDigits: 1,
    })} MB`;
  }
  return `${Math.max(1, Math.round(sizeBytes / 1024))} kB`;
};

const screenshotCountLabel = (count: number): string =>
  count === 1 ? "1 screenshot" : `${count} screenshoty`;

function PendingScreenshot({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  const [previewUrl] = useState(() => URL.createObjectURL(file));

  useEffect(
    () => () => {
      URL.revokeObjectURL(previewUrl);
    },
    [previewUrl]
  );

  return (
    <article className="flex min-w-0 items-center gap-2 rounded-xl border border-violet-100 bg-white p-2 shadow-sm">
      <span
        className="h-12 w-16 shrink-0 rounded-lg bg-cover bg-center ring-1 ring-slate-200"
        style={{ backgroundImage: `url(${previewUrl})` }}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold text-slate-800">
          {file.name}
        </span>
        <span className="mt-0.5 block text-[10px] font-semibold text-slate-400">
          {formatFileSize(file.size)}
        </span>
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
        aria-label={`Odebrat ${file.name}`}
      >
        <X className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
      </button>
    </article>
  );
}

type UserRequestsPanelProps = {
  className: string;
  fieldClass: string;
  toggleOffClass: string;
  commissionModes: { id: CommissionMode; label: string }[];
  view: UserRequestsView;
  requests: UserRequestPayload[];
  requestsLoading: boolean;
  requestsError: string | null;
  requestStatus: InlineStatus | null;
  editingRequestId: string | null;
  currentStep: number;
  currentStepId: (typeof USER_REQUEST_STEPS)[number]["id"];
  stepperProgress: number;
  requestCurrentStepCanContinue: boolean;
  canSubmitRequest: boolean;
  userRequestSubmitting: boolean;
  deletingRequestId: string | null;
  subject: UserRequestSubject;
  corporateEmail: string;
  fullName: string;
  agencyNumber: string;
  managerEmail: string;
  mode: CommissionMode;
  priority: UserRequestPriority;
  message: string;
  screenshotFiles: File[];
  requestMessageLength: number;
  userRequestsNowMs: number;
  onViewChange: (view: UserRequestsView) => void | Promise<void>;
  onCancelEdit: () => void;
  onSubjectChange: (subject: UserRequestSubject) => void;
  onCorporateEmailChange: (value: string) => void;
  onFullNameChange: (value: string) => void;
  onAgencyNumberChange: (value: string) => void;
  onManagerEmailChange: (value: string) => void;
  onModeChange: (mode: CommissionMode) => void;
  onPriorityChange: (priority: UserRequestPriority) => void;
  onMessageChange: (value: string) => void;
  onScreenshotFilesChange: (files: File[]) => void;
  onOpenScreenshot: (
    request: UserRequestPayload,
    screenshot: UserRequestScreenshotPayload
  ) => void | Promise<void>;
  onSubmit: () => void | Promise<void>;
  onPreviousStep: () => void;
  onNextStep: () => void;
  onRefreshRequests: () => void | Promise<void>;
  onStartEditRequest: (request: UserRequestPayload) => void;
  onDeleteRequest: (id: string) => void | Promise<void>;
};

export function UserRequestsPanel({
  className,
  fieldClass,
  toggleOffClass,
  commissionModes,
  view,
  requests,
  requestsLoading,
  requestsError,
  requestStatus,
  editingRequestId,
  currentStep,
  currentStepId,
  stepperProgress,
  requestCurrentStepCanContinue,
  canSubmitRequest,
  userRequestSubmitting,
  deletingRequestId,
  subject,
  corporateEmail,
  fullName,
  agencyNumber,
  managerEmail,
  mode,
  priority,
  message,
  screenshotFiles,
  requestMessageLength,
  userRequestsNowMs,
  onViewChange,
  onCancelEdit,
  onSubjectChange,
  onCorporateEmailChange,
  onFullNameChange,
  onAgencyNumberChange,
  onManagerEmailChange,
  onModeChange,
  onPriorityChange,
  onMessageChange,
  onScreenshotFilesChange,
  onOpenScreenshot,
  onSubmit,
  onPreviousStep,
  onNextStep,
  onRefreshRequests,
  onStartEditRequest,
  onDeleteRequest,
}: UserRequestsPanelProps) {
  const screenshotInputId = useId();
  const editingRequest = editingRequestId
    ? requests.find((request) => request.id === editingRequestId) ?? null
    : null;
  const existingScreenshotCount = editingRequest?.screenshots.length ?? 0;
  const availableScreenshotSlots = Math.max(
    0,
    USER_REQUEST_SCREENSHOT_MAX_FILES -
      existingScreenshotCount -
      screenshotFiles.length
  );

  return (
    <section className={`h-full space-y-3 sm:space-y-4 lg:col-span-2 ${className}`}>
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#7c3aed_0%,#a855f7_52%,#c084fc_100%)]" />
      <div className="grid gap-2.5 sm:gap-3 md:grid-cols-2">
        {([
          {
            id: "create",
            title: "Vytvořit žádost",
            subtitle: "Nová žádost krok za krokem",
            icon: ShieldCheck,
          },
          {
            id: "history",
            title: "Podané žádosti",
            subtitle: `${requests.length} záznamů v historii`,
            icon: Clock3,
          },
        ] as const).map((item) => {
          const active = view === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                void onViewChange(item.id);
              }}
              className={`group relative overflow-hidden rounded-[18px] border px-3 py-3 text-left transition sm:rounded-[26px] sm:px-4 sm:py-4 ${
                active
                  ? "border-violet-300 bg-[linear-gradient(135deg,#4c1d95_0%,#7c3aed_54%,#a855f7_100%)] !text-white shadow-[0_22px_46px_rgba(124,58,237,0.34)] [&_*]:!text-white"
                  : "border-violet-200 bg-[linear-gradient(135deg,#faf5ff_0%,#f5f3ff_100%)] text-slate-900 hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-[0_18px_34px_rgba(124,58,237,0.16)]"
              }`}
            >
              <span className="relative z-10 flex items-center gap-3">
                <span
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border sm:h-11 sm:w-11 sm:rounded-2xl ${
                      active
                      ? "border-white/25 bg-white/14 !text-white"
                      : "border-violet-200 bg-white text-violet-700"
                  }`}
                >
                  <Icon size={20} strokeWidth={2.2} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold leading-tight sm:text-base">
                    {item.title}
                  </span>
                  <span
                    className={`mt-0.5 block text-xs font-semibold ${
                      active ? "text-violet-100" : "text-violet-700"
                    }`}
                  >
                    {item.subtitle}
                  </span>
                </span>
              </span>
              <span
                className={`pointer-events-none absolute right-3 top-3 h-16 w-16 rounded-full blur-2xl ${
                  active ? "bg-white/18" : "bg-violet-300/25"
                }`}
              />
            </button>
          );
        })}
      </div>

      {requestStatus && view === "history" ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
            requestStatus.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : requestStatus.type === "info"
                ? "border-slate-200 bg-slate-50 text-slate-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {requestStatus.message}
        </div>
      ) : null}

      {view === "create" ? (
        <div className="space-y-3 rounded-[20px] border border-violet-200 bg-[linear-gradient(180deg,#ffffff_0%,#faf5ff_100%)] px-3 py-3 shadow-[0_12px_30px_rgba(88,28,135,0.08)] sm:space-y-4 sm:rounded-[26px] sm:px-5 sm:py-5 sm:shadow-[0_18px_42px_rgba(88,28,135,0.10)]">
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
            <ShieldCheck
              size={14}
              strokeWidth={2}
              className="text-slate-600"
              aria-hidden="true"
            />
            <span>Nová žádost</span>
          </h2>
          {editingRequestId ? (
            <div className="flex flex-col gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 sm:flex-row sm:items-center sm:justify-between">
              <span>Upravuješ vrácenou žádost k doplnění.</span>
              <button
                type="button"
                onClick={onCancelEdit}
                className="inline-flex items-center justify-center rounded-full border border-sky-300 bg-white px-3 py-1 font-semibold text-sky-800 transition hover:bg-sky-100"
              >
                Zrušit úpravu
              </button>
            </div>
          ) : null}

          <div className="rounded-[18px] border border-violet-200 bg-violet-50/80 px-2.5 py-3 sm:rounded-[22px] sm:px-3">
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${USER_REQUEST_STEPS.length}, minmax(0, 1fr))`,
              }}
            >
              {USER_REQUEST_STEPS.map((stepItem, index) => {
                const stepDone = currentStep > index;
                const stepActive = currentStep === index;
                return (
                  <div
                    key={stepItem.id}
                    className="flex flex-col items-center gap-1 text-center"
                  >
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold transition sm:h-8 sm:w-8 sm:text-xs ${
                        stepDone
                          ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                          : stepActive
                            ? "border-violet-600 bg-violet-600 !text-white shadow-[0_5px_14px_rgba(124,58,237,0.3)]"
                            : "border-violet-100 bg-white text-slate-400"
                      }`}
                    >
                      {stepDone ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                    </span>
                    <span
                      className={`text-[9px] font-semibold uppercase tracking-[0.1em] sm:text-[10px] sm:tracking-[0.14em] ${
                        stepActive
                          ? "text-violet-800"
                          : stepDone
                            ? "text-emerald-700"
                            : "text-slate-400"
                      }`}
                    >
                      {stepItem.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-violet-100">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#7c3aed_0%,#a855f7_58%,#c084fc_100%)] transition-[width] duration-300"
                style={{ width: `${stepperProgress}%` }}
              />
            </div>
          </div>

          {requestStatus && currentStepId !== "message" ? (
            <p
              className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${
                requestStatus.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : requestStatus.type === "info"
                    ? "border-sky-200 bg-sky-50 text-sky-800"
                    : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              {requestStatus.message}
            </p>
          ) : null}

          {currentStepId === "type" ? (
            <div className="space-y-3 rounded-2xl border border-violet-100 bg-white px-3 py-3">
              <div className="space-y-2">
                <div className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Předmět
                </div>
                <div
                  className="grid grid-cols-1 gap-2.5 sm:gap-3 lg:grid-cols-3"
                  role="radiogroup"
                  aria-label="Předmět žádosti"
                >
                  {([
                    {
                      id: "userCreation",
                      label: USER_REQUEST_SUBJECT_LABEL.userCreation,
                      description: "Založení účtu pro nového poradce nebo tipaře.",
                      icon: UsersRound,
                    },
                    {
                      id: "problem",
                      label: USER_REQUEST_SUBJECT_LABEL.problem,
                      description: "Chyba nebo nečekané chování aplikace.",
                      icon: Bug,
                    },
                    {
                      id: "other",
                      label: USER_REQUEST_SUBJECT_LABEL.other,
                      description: "Jiný požadavek pro administraci aplikace.",
                      icon: FileText,
                    },
                  ] as const).map((option) => {
                    const selected = subject === option.id;
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => onSubjectChange(option.id)}
                        role="radio"
                        aria-checked={selected}
                        className={`group flex min-h-[96px] items-start gap-3 rounded-[18px] border px-3 py-3 text-left transition sm:rounded-[22px] sm:px-4 sm:py-4 ${
                          selected
                            ? "border-violet-400 bg-[linear-gradient(135deg,#ede9fe_0%,#f5f3ff_100%)] text-slate-950 shadow-[0_16px_34px_rgba(124,58,237,0.18)]"
                            : "border-slate-200 bg-white text-slate-800 hover:-translate-y-0.5 hover:border-violet-200 hover:bg-violet-50/50 hover:shadow-[0_12px_24px_rgba(88,28,135,0.10)]"
                        }`}
                      >
                        <span
                          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border sm:h-11 sm:w-11 sm:rounded-2xl ${
                            selected
                              ? "border-violet-300 bg-violet-600 !text-white [&_svg]:!text-white"
                              : "border-slate-200 bg-slate-50 text-violet-700 group-hover:border-violet-200 group-hover:bg-white"
                          }`}
                        >
                          <Icon size={20} strokeWidth={2.2} aria-hidden="true" />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 text-sm font-bold leading-tight sm:text-base">
                            {option.label}
                            {selected ? (
                              <CheckCircle2
                                size={16}
                                strokeWidth={2.2}
                                className="shrink-0 text-violet-700"
                                aria-hidden="true"
                              />
                            ) : null}
                          </span>
                          <span className="mt-1 block text-xs leading-relaxed text-slate-500 sm:text-sm">
                            {option.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {currentStepId === "details" && subject === "userCreation" ? (
            <div className="space-y-3 rounded-[18px] border border-slate-200 bg-white px-3 py-3 sm:rounded-2xl">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Firemní e-mail
                </label>
                <input
                  type="email"
                  className={fieldClass}
                  value={corporateEmail}
                  onChange={(e) => onCorporateEmailChange(e.target.value)}
                  placeholder="jmeno.prijmeni@bohemika.eu"
                  maxLength={USER_REQUEST_CORPORATE_EMAIL_MAX_LEN}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Jméno a příjmení
                </label>
                <input
                  type="text"
                  className={fieldClass}
                  value={fullName}
                  onChange={(e) => onFullNameChange(e.target.value)}
                  placeholder="Jméno Příjmení"
                  maxLength={USER_REQUEST_FULL_NAME_MAX_LEN}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Agenturní číslo
                </label>
                <input
                  type="text"
                  inputMode="text"
                  className={fieldClass}
                  value={agencyNumber}
                  onChange={(e) => onAgencyNumberChange(e.target.value)}
                  placeholder="Volitelné agenturní číslo"
                  maxLength={USER_REQUEST_AGENCY_NUMBER_MAX_LEN}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
                  E-mail přímého nadřízeného
                </label>
                <input
                  type="email"
                  className={fieldClass}
                  value={managerEmail}
                  onChange={(e) => onManagerEmailChange(e.target.value)}
                  placeholder="jmeno.prijmeni@bohemika.eu"
                  maxLength={USER_REQUEST_MANAGER_EMAIL_MAX_LEN}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Režim provizí
                </label>
                <div
                  className="inline-flex w-full rounded-xl border border-slate-300 bg-slate-100 p-1 sm:rounded-2xl"
                  role="radiogroup"
                  aria-label="Režim provizí žádosti"
                >
                  {commissionModes.map((m) => {
                    const active = mode === m.id;
                    const isAccelerated = m.id === "accelerated";
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onModeChange(m.id)}
                        className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                          active
                            ? "border border-slate-900 bg-white text-slate-900 shadow-[0_4px_12px_rgba(15,23,42,0.1)]"
                            : "border border-transparent text-slate-600 hover:text-slate-900"
                        }`}
                        role="radio"
                        aria-checked={active}
                      >
                        {isAccelerated ? (
                          <Zap
                            size={14}
                            strokeWidth={2.2}
                            className={active ? "text-amber-500" : "text-amber-600"}
                            aria-hidden="true"
                          />
                        ) : (
                          <Snail
                            size={14}
                            strokeWidth={2.2}
                            className={active ? "text-slate-600" : "text-slate-500"}
                            aria-hidden="true"
                          />
                        )}
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                Heslo nenastavuješ. Po schválení žádosti ho nastaví admin.
              </p>
            </div>
          ) : null}

          {currentStepId === "details" && subject !== "userCreation" ? (
            <div className="space-y-3 rounded-[18px] border border-violet-100 bg-white px-3 py-3 sm:rounded-2xl sm:px-4 sm:py-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
                {subject === "problem" ? "Popis problému" : "Text žádosti"}
              </label>
              <textarea
                className={`${fieldClass} min-h-[130px] resize-y sm:min-h-[160px]`}
                value={message}
                onChange={(e) => onMessageChange(e.target.value)}
                placeholder={
                  subject === "problem"
                    ? "Co se stalo, na které stránce a jak lze problém zopakovat?"
                    : "Napiš, co potřebuješ vyřešit."
                }
                maxLength={USER_REQUEST_MESSAGE_MAX_LEN}
              />
              <p className="text-[11px] text-slate-500">
                {requestMessageLength}/{USER_REQUEST_MESSAGE_MAX_LEN} znaků (minimum{" "}
                {USER_REQUEST_MESSAGE_MIN_LEN}).
              </p>

              {subject === "problem" ? (
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold leading-relaxed text-sky-800">
                  Pokud se problém týká konkrétní smlouvy, napiš do popisu také její číslo.
                </div>
              ) : null}

              {subject === "problem" ? (
                <div className="rounded-2xl border border-dashed border-violet-300 bg-violet-50/60 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-violet-700 shadow-sm">
                        <ImagePlus className="h-5 w-5" strokeWidth={2.1} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-900">
                          Přiložit screenshoty
                        </div>
                        <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
                          PNG, JPG nebo JPEG · max. 4 obrázky · 8 MB každý
                        </div>
                      </div>
                    </div>
                    <label
                      htmlFor={screenshotInputId}
                      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold transition ${
                        availableScreenshotSlots > 0
                          ? "cursor-pointer bg-violet-700 !text-white hover:bg-violet-800 [&_svg]:!text-white"
                          : "cursor-not-allowed bg-slate-200 text-slate-400"
                      }`}
                    >
                      <Paperclip className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                      {screenshotFiles.length + existingScreenshotCount > 0
                        ? "Přidat další"
                        : "Vybrat obrázky"}
                    </label>
                    <input
                      id={screenshotInputId}
                      type="file"
                      multiple
                      accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                      disabled={availableScreenshotSlots <= 0}
                      className="sr-only"
                      onChange={(event) => {
                        const files = Array.from(event.currentTarget.files ?? []);
                        onScreenshotFilesChange([...screenshotFiles, ...files]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </div>

                  {existingScreenshotCount > 0 ? (
                    <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800">
                      {existingScreenshotCount === 1
                        ? "1 dříve přiložený screenshot zůstane u žádosti."
                        : `${existingScreenshotCount} dříve přiložené screenshoty zůstanou u žádosti.`}
                    </div>
                  ) : null}

                  {screenshotFiles.length > 0 ? (
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {screenshotFiles.map((file, index) => (
                        <PendingScreenshot
                          key={`${file.name}:${file.size}:${file.lastModified}:${index}`}
                          file={file}
                          onRemove={() =>
                            onScreenshotFilesChange(
                              screenshotFiles.filter((_, fileIndex) => fileIndex !== index)
                            )
                          }
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {currentStepId === "type" ? (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                Priorita
              </div>
              <div className="flex flex-wrap gap-2">
                {(["normal", "urgent"] as UserRequestPriority[]).map((item) => {
                  const active = priority === item;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => onPriorityChange(item)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? "border-slate-900 bg-slate-900 text-white"
                          : toggleOffClass
                      }`}
                    >
                      {USER_REQUEST_PRIORITY_LABEL[item]}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {currentStepId === "message" && subject === "userCreation" ? (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
                Popis žádosti
              </label>
              <textarea
                className={`${fieldClass} min-h-[110px] resize-y sm:min-h-[120px]`}
                value={message}
                onChange={(e) => onMessageChange(e.target.value)}
                placeholder="Napiš prosím detaily žádosti."
                maxLength={USER_REQUEST_MESSAGE_MAX_LEN}
              />
              <p className="text-[11px] text-slate-500">
                {requestMessageLength}/{USER_REQUEST_MESSAGE_MAX_LEN} znaků (minimum{" "}
                {USER_REQUEST_MESSAGE_MIN_LEN}).
              </p>
            </div>
          ) : null}

          {currentStepId === "message" && subject !== "userCreation" ? (
            <div className="space-y-2 rounded-[18px] border border-violet-100 bg-white px-3 py-3 sm:rounded-2xl">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                Kontrola textu
              </div>
              <p className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-relaxed text-slate-700 sm:rounded-2xl">
                {message.trim()}
              </p>
              {subject === "problem" &&
              screenshotFiles.length + existingScreenshotCount > 0 ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-800">
                  <Images className="h-4 w-4" strokeWidth={2.1} aria-hidden="true" />
                  {screenshotCountLabel(
                    screenshotFiles.length + existingScreenshotCount
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {currentStepId === "message" ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              {requestStatus ? (
                <p
                  className={`text-xs ${
                    requestStatus.type === "success"
                      ? "text-emerald-700"
                      : requestStatus.type === "info"
                        ? "text-slate-700"
                        : "text-rose-700"
                  }`}
                >
                  {requestStatus.message}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void onSubmit()}
                disabled={userRequestSubmitting || !canSubmitRequest}
                className="inline-flex items-center justify-center rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                {userRequestSubmitting
                  ? editingRequestId
                    ? "Odesílám změny..."
                    : "Odesílám..."
                  : editingRequestId
                    ? "Uložit a odeslat znovu"
                    : "Odeslat"}
              </button>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-violet-100 pt-3">
            <p className="text-xs font-semibold text-violet-700">
              Krok {currentStep + 1} / {USER_REQUEST_STEPS.length}
            </p>
            <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
              {currentStep > 0 ? (
                <button
                  type="button"
                  onClick={onPreviousStep}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-800 transition hover:bg-violet-50 sm:flex-none"
                >
                  <ChevronLeft size={15} strokeWidth={2.2} aria-hidden="true" />
                  Zpět
                </button>
              ) : null}
              {currentStep < USER_REQUEST_STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={onNextStep}
                  disabled={!requestCurrentStepCanContinue}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-violet-300 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_58%,#c084fc_100%)] px-5 py-2.5 text-sm font-semibold !text-white shadow-[0_14px_28px_rgba(124,58,237,0.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55 sm:flex-none [&_svg]:!text-white"
                >
                  Pokračovat
                  <ChevronRight size={15} strokeWidth={2.2} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {view === "history" ? (
        <div className="space-y-3 rounded-[18px] border border-slate-200 bg-white px-3 py-3 sm:rounded-2xl sm:px-4 sm:py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
              Podané žádosti
            </h3>
            <button
              type="button"
              onClick={() => void onRefreshRequests()}
              disabled={requestsLoading}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {requestsLoading ? "Načítám..." : "Obnovit"}
            </button>
          </div>

          {requestsError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {requestsError}
            </div>
          ) : null}

          {!requestsLoading && requests.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-xs text-slate-500">
              Zatím nemáš podané žádosti.
            </div>
          ) : null}

          <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1 sm:max-h-[420px]">
            {requests.map((request) => {
              const slaInfo = buildUserRequestSlaInfo(request, userRequestsNowMs);
              const cancellableByRequester =
                request.status === "pending" || request.status === "needsInfo";
              const decisionDurationMs =
                request.decidedAtMs && Number.isFinite(request.decidedAtMs)
                  ? Math.max(0, request.decidedAtMs - request.createdAtMs)
                  : 0;

              return (
                <article
                  key={request.id}
                  className={`rounded-xl border px-3 py-3 ${
                    slaInfo.isOverdueUrgent
                      ? "border-rose-300 bg-rose-50"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800">
                      {USER_REQUEST_SUBJECT_LABEL[request.subject]}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                          USER_REQUEST_STATUS_CLASS[request.status]
                        }`}
                      >
                        {USER_REQUEST_STATUS_LABEL[request.status]}
                      </span>
                      {request.status === "needsInfo" ? (
                        <button
                          type="button"
                          onClick={() => onStartEditRequest(request)}
                          disabled={Boolean(deletingRequestId) || userRequestSubmitting}
                          className="rounded-full border border-sky-300 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Doplnit
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void onDeleteRequest(request.id)}
                        disabled={deletingRequestId === request.id}
                        className="rounded-full border border-rose-300 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingRequestId === request.id
                          ? "Mažu..."
                          : cancellableByRequester
                            ? "Stornovat"
                            : "Smazat"}
                      </button>
                    </div>
                  </div>

                  <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                    {request.message}
                  </p>

                  {request.screenshots.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {request.screenshots.map((screenshot, index) => (
                        <button
                          key={screenshot.id}
                          type="button"
                          onClick={() => void onOpenScreenshot(request, screenshot)}
                          className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-3 py-1.5 text-[11px] font-bold text-violet-800 transition hover:border-violet-300 hover:bg-violet-50"
                        >
                          <Images className="h-3.5 w-3.5" strokeWidth={2.1} aria-hidden="true" />
                          Screenshot {index + 1}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <dl className="mt-3 space-y-1 text-[11px] text-slate-500">
                    <div className="flex flex-wrap items-baseline gap-1">
                      <dt className="font-semibold text-slate-600">Priorita:</dt>
                      <dd>{USER_REQUEST_PRIORITY_LABEL[request.priority]}</dd>
                    </div>
                    {slaInfo.waiting ? (
                      <div className="flex flex-wrap items-baseline gap-1">
                        <dt className="font-semibold text-slate-600">Čeká:</dt>
                        <dd
                          className={
                            slaInfo.isOverdueUrgent
                              ? "font-semibold text-rose-700"
                              : "text-slate-600"
                          }
                        >
                          {slaInfo.elapsedLabel} (SLA {slaInfo.slaLimitLabel})
                        </dd>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-baseline gap-1">
                        <dt className="font-semibold text-slate-600">Vyřízeno za:</dt>
                        <dd>{formatDurationCompact(decisionDurationMs)}</dd>
                      </div>
                    )}
                    {request.requestedCorporateEmail ? (
                      <div className="flex flex-wrap items-baseline gap-1">
                        <dt className="font-semibold text-slate-600">Firemní e-mail:</dt>
                        <dd>{request.requestedCorporateEmail}</dd>
                      </div>
                    ) : null}
                    {request.requestedUserDraft ? (
                      <>
                        {request.requestedUserDraft.fullName ? (
                          <div className="flex flex-wrap items-baseline gap-1">
                            <dt className="font-semibold text-slate-600">Jméno:</dt>
                            <dd>{request.requestedUserDraft.fullName}</dd>
                          </div>
                        ) : null}
                        {request.requestedUserDraft.agencyNumber ? (
                          <div className="flex flex-wrap items-baseline gap-1">
                            <dt className="font-semibold text-slate-600">
                              Agenturní číslo:
                            </dt>
                            <dd>{request.requestedUserDraft.agencyNumber}</dd>
                          </div>
                        ) : null}
                        {request.requestedUserDraft.managerEmail ? (
                          <div className="flex flex-wrap items-baseline gap-1">
                            <dt className="font-semibold text-slate-600">Nadřízený:</dt>
                            <dd>{request.requestedUserDraft.managerEmail}</dd>
                          </div>
                        ) : null}
                        <div className="flex flex-wrap items-baseline gap-1">
                          <dt className="font-semibold text-slate-600">Režim:</dt>
                          <dd>
                            {commissionModes.find(
                              (m) => m.id === request.requestedUserDraft?.commissionMode
                            )?.label ?? request.requestedUserDraft.commissionMode}
                          </dd>
                        </div>
                      </>
                    ) : null}
                    {request.createdUserEmail ? (
                      <div className="flex flex-wrap items-baseline gap-1">
                        <dt className="font-semibold text-slate-600">Vytvořený účet:</dt>
                        <dd>{request.createdUserEmail}</dd>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-baseline gap-1">
                      <dt className="font-semibold text-slate-600">Vytvořeno:</dt>
                      <dd>{formatDateTime(request.createdAtMs)}</dd>
                    </div>
                    <div className="flex flex-wrap items-baseline gap-1">
                      <dt className="font-semibold text-slate-600">Zpětná vazba:</dt>
                      <dd>
                        {request.feedback?.trim()
                          ? request.feedback
                          : "Zatím bez zpětné vazby."}
                      </dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
