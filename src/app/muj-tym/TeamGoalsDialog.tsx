"use client";

import { useMemo, useState } from "react";
import { Flag, Save, UserRound, UsersRound } from "lucide-react";

import {
  emptyProductionGoal,
  normalizeProductionGoal,
  TEAM_GOAL_CATEGORIES,
  TEAM_GOAL_CATEGORY_METRICS,
  TEAM_GOAL_CATEGORY_LABELS,
} from "@/app/api/team-overview/teamGoals";
import type {
  ProductionGoal,
  TeamProductionGoals,
} from "@/app/api/team-overview/teamOverview.types";
import { HelpDialog } from "@/components/HelpDialog";
import { GoalCategoryIcon } from "./GoalCategoryIcon";

type GoalMember = {
  email: string;
  name: string;
};

type TeamGoalsDialogProps = {
  isOpen: boolean;
  goals: TeamProductionGoals;
  members: GoalMember[];
  saving: boolean;
  error: string | null;
  initialMemberEmail?: string | null;
  onClose: () => void;
  onSave: (goals: TeamProductionGoals) => Promise<void>;
};

const cloneGoal = (goal: ProductionGoal): ProductionGoal =>
  normalizeProductionGoal(goal);

const cloneGoals = (goals: TeamProductionGoals): TeamProductionGoals => ({
  ...goals,
  team: cloneGoal(goals.team),
  members: Object.fromEntries(
    Object.entries(goals.members).map(([email, goal]) => [email, cloneGoal(goal)])
  ),
});

const inputAmount = (value: string): number => {
  if (!value.trim()) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.round(parsed * 100) / 100
    : 0;
};

function GoalFields({
  goal,
  onChange,
}: {
  goal: ProductionGoal;
  onChange: (goal: ProductionGoal) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
          Cíle podle produktů
        </span>
        <span className="text-[11px] font-semibold text-slate-400">
          Zadejte jen kategorie, které chcete sledovat
        </span>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {TEAM_GOAL_CATEGORIES.map((category) => {
          const metric = TEAM_GOAL_CATEGORY_METRICS[category];
          const metricLabel =
            metric === "contracts"
              ? "Počet smluv"
              : metric === "monthlyPremium"
                ? "Měsíční pojistné"
                : "Roční pojistné";
          const suffix = metric === "contracts" ? "smluv" : "Kč";

          return (
            <label
              key={category}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 transition focus-within:border-violet-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-violet-100"
            >
              <span className="flex items-center gap-2">
                <GoalCategoryIcon category={category} />
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-slate-700">
                    {TEAM_GOAL_CATEGORY_LABELS[category]}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-semibold text-slate-400">
                    {metricLabel}
                  </span>
                </span>
              </span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="1000000000"
                  step={
                    metric === "contracts"
                      ? "1"
                      : metric === "monthlyPremium"
                        ? "100"
                        : "1000"
                  }
                  value={goal.categories[category] || ""}
                  onChange={(event) => {
                    const amount = inputAmount(event.target.value);
                    onChange({
                      ...goal,
                      categories: {
                        ...goal.categories,
                        [category]:
                          metric === "contracts" ? Math.round(amount) : amount,
                      },
                    });
                  }}
                  placeholder="0"
                  className="min-w-0 flex-1 bg-transparent text-sm font-black tabular-nums text-slate-950 outline-none"
                />
                <span className="text-xs font-bold text-slate-400">{suffix}</span>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function TeamGoalsDialogContent({
  goals,
  members,
  saving,
  error,
  initialMemberEmail,
  onClose,
  onSave,
}: Omit<TeamGoalsDialogProps, "isOpen">) {
  const sortedMembers = useMemo(
    () => [...members].sort((left, right) => left.name.localeCompare(right.name, "cs")),
    [members]
  );
  const requestedMemberEmail = String(initialMemberEmail ?? "")
    .trim()
    .toLowerCase();
  const hasRequestedMember = sortedMembers.some(
    (member) => member.email === requestedMemberEmail
  );
  const [scope, setScope] = useState<"team" | "member">(
    hasRequestedMember ? "member" : "team"
  );
  const [selectedMemberEmail, setSelectedMemberEmail] = useState(
    hasRequestedMember ? requestedMemberEmail : sortedMembers[0]?.email ?? ""
  );
  const [draft, setDraft] = useState<TeamProductionGoals>(() => cloneGoals(goals));

  const activeGoal =
    scope === "team"
      ? draft.team
      : draft.members[selectedMemberEmail] ?? emptyProductionGoal();

  const updateActiveGoal = (goal: ProductionGoal) => {
    if (scope === "team") {
      setDraft((current) => ({ ...current, team: goal }));
      return;
    }
    if (!selectedMemberEmail) return;
    setDraft((current) => ({
      ...current,
      members: {
        ...current.members,
        [selectedMemberEmail]: goal,
      },
    }));
  };

  return (
    <HelpDialog
      isOpen
      title="Měsíční cíle"
      description={`Cíle pro ${goals.yearMonth}: životko podle měsíčního pojistného, zlato podle počtu smluv a ostatní produkty podle ročního pojistného.`}
      eyebrow="Cíle a predikce"
      eyebrowIcon={<Flag className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-violet-100 bg-violet-50/70 p-1">
          <button
            type="button"
            onClick={() => setScope("team")}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${
              scope === "team"
                ? "bg-white text-violet-800 shadow-sm"
                : "text-slate-500 hover:text-violet-800"
            }`}
          >
            <UsersRound className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            Celý tým
          </button>
          <button
            type="button"
            onClick={() => setScope("member")}
            disabled={sortedMembers.length === 0}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${
              scope === "member"
                ? "bg-white text-violet-800 shadow-sm"
                : "text-slate-500 hover:text-violet-800"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <UserRound className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            Jednotlivec
          </button>
        </div>

        {scope === "member" ? (
          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
              Člen týmu
            </span>
            <select
              value={selectedMemberEmail}
              onChange={(event) => setSelectedMemberEmail(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            >
              {sortedMembers.map((member) => (
                <option key={member.email} value={member.email}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <GoalFields goal={activeGoal} onChange={updateActiveGoal} />

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={() => void onSave(draft)}
            disabled={saving}
            className="ui-focus inline-flex items-center gap-2 rounded-full bg-violet-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            {saving ? "Ukládám…" : "Uložit cíle"}
          </button>
        </div>
      </div>
    </HelpDialog>
  );
}

export function TeamGoalsDialog(props: TeamGoalsDialogProps) {
  if (!props.isOpen) return null;
  return (
    <TeamGoalsDialogContent
      key={`${props.goals.updatedAtMs ?? "new"}:${props.initialMemberEmail ?? "team"}`}
      goals={props.goals}
      members={props.members}
      saving={props.saving}
      error={props.error}
      initialMemberEmail={props.initialMemberEmail}
      onClose={props.onClose}
      onSave={props.onSave}
    />
  );
}
