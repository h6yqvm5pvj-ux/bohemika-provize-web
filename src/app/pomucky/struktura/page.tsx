// src/app/pomucky/struktura/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crown, Crosshair, Layers, Minus, Plus, Sparkles, Users } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { positionLabel as positionLabelValue } from "@/app/lib/formatters";
import SplitTitle from "../plan-produkce/SplitTitle";
import { auth } from "../../firebase";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import type { Position } from "../../types/domain";
import { useEffectiveUserEmail } from "@/app/lib/useAdminImpersonation";

type UserNode = {
  email: string;
  name: string;
  position: Position | null;
  managerEmail: string | null;
};

type TeamOverviewMember = {
  email: string;
  name?: string | null;
  position?: Position | null;
  managerEmail?: string | null;
};

type TeamOverviewApiResponse = {
  ok?: boolean;
  error?: string;
  members?: TeamOverviewMember[];
  position?: Position | null;
};

type TreeNode = UserNode & { children: TreeNode[] };
type PositionedNode = TreeNode & { x: number; y: number };

const NODE_WIDTH = 254;
const NODE_HEIGHT = 146;
const DEFAULT_ZOOM = 1;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.9;
const ZOOM_STEP = 0.1;

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (parts.length === 0) return email;
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

function positionLabel(pos: Position | null): string {
  return positionLabelValue(pos, { emptyLabel: "Neznámá pozice" });
}

function truncateText(value: string, max: number): string {
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function initialsFromName(name: string): string {
  const tokens = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return "??";
  const first = tokens[0]?.[0] ?? "";
  const second = tokens[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase() || "??";
}

const normalizeEmail = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

function buildTree(
  rootEmail: string,
  nodesByEmail: Map<string, UserNode>,
  childrenByManager: Map<string, string[]>,
  visible: Set<string>
): TreeNode | null {
  const node = nodesByEmail.get(rootEmail);
  if (!node) return null;
  const childrenEmails = childrenByManager.get(rootEmail) ?? [];
  const children = childrenEmails
    .filter((em) => visible.has(em))
    .map((em) => buildTree(em, nodesByEmail, childrenByManager, visible))
    .filter(Boolean) as TreeNode[];
  return { ...node, children };
}

export default function StructurePage() {
  const svgPrefix = "structureTree";
  const treeScrollRef = useRef<HTMLDivElement | null>(null);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const effectiveEmail = useEffectiveUserEmail(user?.email);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [nodes, setNodes] = useState<Map<string, UserNode>>(new Map());
  const [visibleEmails, setVisibleEmails] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) {
        setUser(null);
        return;
      }
      setUser(fbUser);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!user || !effectiveEmail) return;
      setLoading(true);
      try {
        const email = effectiveEmail;

        const map = new Map<string, UserNode>();
        try {
          let bearerToken = await user.getIdToken();
          const requestWithToken = async (token: string) =>
            fetch("/api/team-overview?action=members&includeAncestors=1", {
              headers: {
                Authorization: `Bearer ${token}`,
              },
              cache: "no-store",
            });

          let teamRes = await requestWithToken(bearerToken);
          if (teamRes.status === 401) {
            bearerToken = await user.getIdToken(true);
            teamRes = await requestWithToken(bearerToken);
          }

          let teamPayload: TeamOverviewApiResponse = {};
          try {
            teamPayload = (await teamRes.json()) as TeamOverviewApiResponse;
          } catch {
            teamPayload = {};
          }
          if (!teamRes.ok || teamPayload?.ok === false) {
            throw new Error(teamPayload?.error || `API team-overview selhalo (${teamRes.status}).`);
          }

          const members = Array.isArray(teamPayload.members) ? teamPayload.members : [];
          members.forEach((member) => {
            const em = normalizeEmail(member.email);
            if (!em) return;
            map.set(em, {
              email: em,
              name:
                typeof member.name === "string" && member.name.trim()
                  ? member.name.trim()
                  : nameFromEmail(em),
              position: (member.position as Position | null | undefined) ?? null,
              managerEmail: normalizeEmail(member.managerEmail) || null,
            });
          });
        } catch (apiErr) {
          console.warn("Načtení struktury přes API selhalo:", apiErr);
        }

        if (!map.has(email)) {
          map.set(email, {
            email,
            name: nameFromEmail(email),
            position: null,
            managerEmail: null,
          });
        }

        const visible = new Set<string>();
        map.forEach((node) => visible.add(node.email));
        visible.add(email);

        const visitedAncestors = new Set<string>();
        let current = map.get(email)?.managerEmail ?? null;
        let depth = 0;
        while (current && !visitedAncestors.has(current) && depth < 10) {
          visitedAncestors.add(current);

          if (map.has(current)) {
            visible.add(current);
            current = map.get(current)?.managerEmail ?? null;
            depth += 1;
            continue;
          }
          break;
        }

        if (!alive) return;
        setNodes(map);
        setVisibleEmails(visible);
      } catch (e) {
        if (!alive) return;
        console.error("Chyba při načítání struktury:", e);
        const fallbackEmail = effectiveEmail;
        if (fallbackEmail) {
          const fallbackMap = new Map<string, UserNode>();
          fallbackMap.set(fallbackEmail, {
            email: fallbackEmail,
            name: nameFromEmail(fallbackEmail),
            position: null,
            managerEmail: null,
          });
          setNodes(fallbackMap);
          setVisibleEmails(new Set([fallbackEmail]));
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, [effectiveEmail, user]);

  const treeRoot = useMemo(() => {
    if (!effectiveEmail || nodes.size === 0 || visibleEmails.size === 0) return null;
    const email = effectiveEmail;

    let rootEmail = email;
    let current = nodes.get(email)?.managerEmail ?? null;
    let depth = 0;
    while (current && visibleEmails.has(current) && nodes.has(current) && depth < 10) {
      rootEmail = current;
      current = nodes.get(current)?.managerEmail ?? null;
      depth += 1;
    }

    const childrenByManager = new Map<string, string[]>();
    nodes.forEach((u) => {
      if (!visibleEmails.has(u.email)) return;
      if (!u.managerEmail || !visibleEmails.has(u.managerEmail)) return;
      const arr = childrenByManager.get(u.managerEmail) ?? [];
      arr.push(u.email);
      childrenByManager.set(u.managerEmail, arr);
    });

    return buildTree(rootEmail, nodes, childrenByManager, visibleEmails);
  }, [effectiveEmail, nodes, visibleEmails]);

  const layout = useMemo(() => {
    if (!treeRoot)
      return {
        nodes: [] as PositionedNode[],
        width: 0,
        height: 0,
        stepX: 0,
        stepY: 0,
        offsetX: 0,
        edges: [] as { from: PositionedNode; to: PositionedNode }[],
      };

    const H_STEP = 272;
    const V_STEP = 168;
    const TOP_PADDING = 34;
    let nextX = 0;
    let maxDepth = 0;
    const placed: PositionedNode[] = [];
    const posMap = new Map<string, PositionedNode>();

    const dfs = (node: TreeNode, depth: number): PositionedNode => {
      maxDepth = Math.max(maxDepth, depth);
      let x: number;
      if (node.children.length === 0) {
        x = nextX++;
      } else {
        const childrenPos = node.children.map((c) => dfs(c, depth + 1));
        const minX = Math.min(...childrenPos.map((c) => c.x));
        const maxX = Math.max(...childrenPos.map((c) => c.x));
        x = (minX + maxX) / 2;
      }
      const positioned: PositionedNode = {
        ...node,
        x,
        y: depth * V_STEP + TOP_PADDING,
      };
      placed.push(positioned);
      posMap.set(positioned.email, positioned);
      return positioned;
    };

    dfs(treeRoot, 0);
    const minX = Math.min(...placed.map((p) => p.x));
    const maxX = Math.max(...placed.map((p) => p.x));
    const contentWidth = (maxX - minX) * H_STEP + NODE_WIDTH;
    const width = Math.max(contentWidth + 160, 920);
    const offsetX = (width - contentWidth) / 2 + NODE_WIDTH / 2 - minX * H_STEP;

    const edges: { from: PositionedNode; to: PositionedNode }[] = [];
    placed.forEach((p) => {
      p.children.forEach((child) => {
        const target = posMap.get(child.email);
        if (target) {
          edges.push({ from: p, to: target });
        }
      });
    });

    return {
      nodes: placed,
      width,
      height: (maxDepth + 1) * V_STEP + NODE_HEIGHT + TOP_PADDING + 52,
      stepX: H_STEP,
      stepY: V_STEP,
      offsetX,
      edges,
    };
  }, [treeRoot]);

  const centerTree = useCallback(() => {
    const el = treeScrollRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((prev) => clampZoom(prev + ZOOM_STEP));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((prev) => clampZoom(prev - ZOOM_STEP));
  }, []);

  const zoomReset = useCallback(() => {
    setZoom(DEFAULT_ZOOM);
  }, []);

  const handleTreeWheelZoom = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      setZoom((prev) => clampZoom(prev + direction * ZOOM_STEP));
    },
    []
  );

  useEffect(() => {
    centerTree();
    window.addEventListener("resize", centerTree);
    return () => window.removeEventListener("resize", centerTree);
  }, [centerTree, layout.width, layout.height, loading, treeRoot]);

  const currentUserEmail = effectiveEmail;

  if (!user) return null;

  return (
    <AppLayout active="tools">
      <div className="relative w-full max-w-[1320px] space-y-6 pb-4">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-16 top-20 h-56 w-56 rounded-full bg-[radial-gradient(circle_at_center,rgba(14,116,144,0.24)_0%,rgba(14,116,144,0.02)_66%,transparent_100%)] blur-2xl"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 top-8 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.2)_0%,rgba(56,189,248,0.02)_68%,transparent_100%)] blur-2xl"
        />

        <header className="relative overflow-hidden rounded-[32px] border border-slate-200/80 bg-[linear-gradient(140deg,rgba(255,255,255,0.97)_0%,rgba(239,246,255,0.95)_55%,rgba(236,253,245,0.9)_100%)] px-5 py-6 shadow-[0_18px_46px_rgba(15,23,42,0.1)] sm:px-7 sm:py-7">
          <span
            aria-hidden="true"
            className="absolute -top-10 right-8 h-36 w-36 rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.2)_0%,rgba(59,130,246,0.02)_74%,transparent_100%)] blur-xl"
          />
          <span
            aria-hidden="true"
            className="absolute -bottom-8 left-10 h-24 w-40 rounded-full bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.18)_0%,rgba(16,185,129,0.03)_70%,transparent_100%)] blur-xl"
          />

          <div className="relative z-10 space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50/85 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-sky-900">
              <Sparkles className="h-3.5 w-3.5" />
              Struktura týmu
            </div>
            <div>
              <SplitTitle text="Struktura" />
              <p className="mt-2 max-w-3xl text-sm text-slate-600 sm:text-base">
                Vidíš sebe, své nadřízené i podřízené v rámci vlastní struktury.
              </p>
            </div>

          </div>
        </header>

        <section className="relative overflow-hidden rounded-[32px] border border-slate-200/85 bg-[linear-gradient(145deg,rgba(255,255,255,0.96)_0%,rgba(241,245,249,0.95)_52%,rgba(235,246,255,0.92)_100%)] p-3 shadow-[0_22px_58px_rgba(15,23,42,0.11)] sm:p-4">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-10 bottom-0 h-28 rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.16)_0%,rgba(59,130,246,0.03)_62%,transparent_100%)] blur-xl"
          />

          <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/65 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] backdrop-blur">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-800">
                <Users className="h-3.5 w-3.5" />
                Ty
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-indigo-800">
                <Crown className="h-3.5 w-3.5" />
                Manažer
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700">
                <Layers className="h-3.5 w-3.5" />
                Poradce
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white/90 p-1 shadow-[0_8px_20px_rgba(15,23,42,0.08)]">
                <button
                  type="button"
                  onClick={zoomOut}
                  disabled={zoom <= MIN_ZOOM + 0.001}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Oddálit strom"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={zoomReset}
                  className="rounded-full px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                  aria-label="Resetovat přiblížení stromu"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={zoomIn}
                  disabled={zoom >= MAX_ZOOM - 0.001}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Přiblížit strom"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={centerTree}
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.08)] transition hover:border-slate-400 hover:text-slate-900"
              >
                <Crosshair className="h-3.5 w-3.5" />
                Vycentrovat strom
              </button>
            </div>
          </div>

          <div className="relative z-10 px-1 py-2">
            {loading ? (
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-6 text-sm text-slate-600">
                Načítám strukturu…
              </div>
            ) : !treeRoot ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-6 text-sm text-rose-700">
                Strukturu se nepodařilo načíst.
              </div>
            ) : layout.nodes.length === 0 || layout.stepX === 0 ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-6 text-sm text-rose-700">
                Strukturu se nepodařilo načíst.
              </div>
            ) : (
              <div
                ref={treeScrollRef}
                onWheel={handleTreeWheelZoom}
                className="relative w-full overflow-auto rounded-[24px] border border-white/80 bg-white/65 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
              >
                <svg
                  className="mx-auto block"
                  width={layout.width * zoom}
                  height={layout.height * zoom}
                  viewBox={`0 0 ${layout.width} ${layout.height}`}
                  preserveAspectRatio="xMidYMin meet"
                >
                  <defs>
                    <linearGradient id={`${svgPrefix}-edge`} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.82" />
                      <stop offset="52%" stopColor="#60a5fa" stopOpacity="0.7" />
                      <stop offset="100%" stopColor="#c084fc" stopOpacity="0.78" />
                    </linearGradient>
                    <linearGradient id={`${svgPrefix}-card-current`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#2f154f" />
                      <stop offset="100%" stopColor="#120927" />
                    </linearGradient>
                    <linearGradient id={`${svgPrefix}-card-manager`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#35155b" />
                      <stop offset="100%" stopColor="#13092d" />
                    </linearGradient>
                    <linearGradient id={`${svgPrefix}-card-adviser`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#281944" />
                      <stop offset="100%" stopColor="#100d2b" />
                    </linearGradient>
                    <linearGradient id={`${svgPrefix}-card-unknown`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#253046" />
                      <stop offset="100%" stopColor="#0f172a" />
                    </linearGradient>
                    <radialGradient id={`${svgPrefix}-card-glow`} cx="25%" cy="0%" r="88%">
                      <stop offset="0%" stopColor="rgba(249,244,255,0.32)" />
                      <stop offset="55%" stopColor="rgba(249,244,255,0.08)" />
                      <stop offset="100%" stopColor="rgba(249,244,255,0)" />
                    </radialGradient>
                    <linearGradient id={`${svgPrefix}-card-diagonal`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="rgba(255,255,255,0.2)" />
                      <stop offset="30%" stopColor="rgba(255,255,255,0.05)" />
                      <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                    </linearGradient>
                    <linearGradient id={`${svgPrefix}-badge-current`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#67f3d0" />
                      <stop offset="100%" stopColor="#39d5ff" />
                    </linearGradient>
                    <linearGradient id={`${svgPrefix}-badge-manager`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#cc75ff" />
                      <stop offset="100%" stopColor="#9f57ff" />
                    </linearGradient>
                    <linearGradient id={`${svgPrefix}-badge-adviser`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#77d9ff" />
                      <stop offset="100%" stopColor="#5fa7ff" />
                    </linearGradient>
                    <linearGradient id={`${svgPrefix}-badge-unknown`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#bdc7de" />
                      <stop offset="100%" stopColor="#97a8c7" />
                    </linearGradient>
                    <linearGradient id={`${svgPrefix}-pill-current`} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#6ff4cf" />
                      <stop offset="100%" stopColor="#4dceff" />
                    </linearGradient>
                    <linearGradient id={`${svgPrefix}-pill-manager`} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#cb75ff" />
                      <stop offset="100%" stopColor="#a85aff" />
                    </linearGradient>
                    <linearGradient id={`${svgPrefix}-pill-adviser`} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#74d8ff" />
                      <stop offset="100%" stopColor="#75abff" />
                    </linearGradient>
                    <linearGradient id={`${svgPrefix}-pill-unknown`} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#b4bfd5" />
                      <stop offset="100%" stopColor="#93a6c7" />
                    </linearGradient>
                    <linearGradient id={`${svgPrefix}-pill-gloss`} x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="rgba(255,255,255,0.5)" />
                      <stop offset="100%" stopColor="rgba(255,255,255,0.08)" />
                    </linearGradient>
                    <filter id={`${svgPrefix}-shadow`} x="-35%" y="-35%" width="170%" height="190%">
                      <feDropShadow dx="0" dy="16" stdDeviation="12" floodColor="#05030f" floodOpacity="0.46" />
                    </filter>
                    <filter id={`${svgPrefix}-glow-current`} x="-65%" y="-65%" width="230%" height="240%">
                      <feDropShadow dx="0" dy="0" stdDeviation="12" floodColor="#34d399" floodOpacity="0.38" />
                      <feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#042f2e" floodOpacity="0.46" />
                    </filter>
                    <filter id={`${svgPrefix}-glow-manager`} x="-65%" y="-65%" width="230%" height="240%">
                      <feDropShadow dx="0" dy="0" stdDeviation="12" floodColor="#c084fc" floodOpacity="0.44" />
                      <feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#1b1038" floodOpacity="0.52" />
                    </filter>
                    <filter id={`${svgPrefix}-glow-adviser`} x="-65%" y="-65%" width="230%" height="240%">
                      <feDropShadow dx="0" dy="0" stdDeviation="12" floodColor="#60a5fa" floodOpacity="0.44" />
                      <feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#11253f" floodOpacity="0.5" />
                    </filter>
                    <filter id={`${svgPrefix}-glow-unknown`} x="-65%" y="-65%" width="230%" height="240%">
                      <feDropShadow dx="0" dy="0" stdDeviation="10" floodColor="#94a3b8" floodOpacity="0.3" />
                      <feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#0f172a" floodOpacity="0.48" />
                    </filter>
                  </defs>

                  {layout.edges.map(({ from, to }) => (
                    (() => {
                      const fromX = from.x * layout.stepX + layout.offsetX;
                      const toX = to.x * layout.stepX + layout.offsetX;
                      const fromY = from.y + NODE_HEIGHT;
                      const toY = to.y;
                      const isVertical = Math.abs(fromX - toX) < 1;
                      const bend = isVertical ? Math.min(26, layout.stepX * 0.1) : 0;
                      const c1x = isVertical ? fromX + bend : fromX;
                      const c2x = isVertical ? toX - bend : toX;

                      return (
                        <path
                          key={`${from.email}-${to.email}`}
                          d={`M ${fromX} ${fromY}
                            C ${c1x} ${fromY + 24},
                              ${c2x} ${toY - 24},
                              ${toX} ${toY}`}
                          fill="none"
                          stroke={`url(#${svgPrefix}-edge)`}
                          strokeLinecap="round"
                          strokeOpacity={isVertical ? 0.97 : 0.88}
                          strokeWidth={isVertical ? 3.2 : 2.7}
                        />
                      );
                    })()
                  ))}

                  {layout.nodes.map((node) => {
                    const isCurrent = currentUserEmail === node.email;
                    const isManager = Boolean(node.position?.startsWith("manazer"));
                    const isAdviser = Boolean(node.position?.startsWith("poradce"));
                    const roleLabel = positionLabel(node.position);
                    const roleBadge = isCurrent ? "TY" : isManager ? "MANAŽER" : isAdviser ? "PORADCE" : "ČLEN";
                    const roleSubtitle = isCurrent
                      ? "Vlastní účet ve struktuře"
                      : isManager
                      ? "Nadřízený v této větvi"
                      : isAdviser
                      ? "Aktivní týmový poradce"
                      : "Pozice není vyplněná";
                    const initials = initialsFromName(node.name);
                    const RolePillIcon = isManager ? Crown : isCurrent ? Users : isAdviser ? Users : Layers;
                    const badgeWidth = Math.min(148, Math.max(78, roleBadge.length * 10 + 24));
                    const cardTheme = isCurrent
                      ? {
                          fill: `url(#${svgPrefix}-card-current)`,
                          border: "#66f2cc",
                          badgeFill: `url(#${svgPrefix}-badge-current)`,
                          pillFill: `url(#${svgPrefix}-pill-current)`,
                          pillStroke: "rgba(130,255,226,0.62)",
                          glow: `url(#${svgPrefix}-glow-current)`,
                          subtitleColor: "#bcf4e4",
                          initialsFill: "#0f172a",
                          lineColor: "rgba(137,255,225,0.45)",
                        }
                      : isManager
                      ? {
                          fill: `url(#${svgPrefix}-card-manager)`,
                          border: "#b77cff",
                          badgeFill: `url(#${svgPrefix}-badge-manager)`,
                          pillFill: `url(#${svgPrefix}-pill-manager)`,
                          pillStroke: "rgba(223,180,255,0.65)",
                          glow: `url(#${svgPrefix}-glow-manager)`,
                          subtitleColor: "#d8c0ff",
                          initialsFill: "#1f1140",
                          lineColor: "rgba(198,152,255,0.48)",
                        }
                      : isAdviser
                      ? {
                          fill: `url(#${svgPrefix}-card-adviser)`,
                          border: "#79bcff",
                          badgeFill: `url(#${svgPrefix}-badge-adviser)`,
                          pillFill: `url(#${svgPrefix}-pill-adviser)`,
                          pillStroke: "rgba(177,224,255,0.64)",
                          glow: `url(#${svgPrefix}-glow-adviser)`,
                          subtitleColor: "#c6e3ff",
                          initialsFill: "#132443",
                          lineColor: "rgba(137,201,255,0.46)",
                        }
                      : {
                          fill: `url(#${svgPrefix}-card-unknown)`,
                          border: "#9aa7be",
                          badgeFill: `url(#${svgPrefix}-badge-unknown)`,
                          pillFill: `url(#${svgPrefix}-pill-unknown)`,
                          pillStroke: "rgba(210,220,240,0.58)",
                          glow: `url(#${svgPrefix}-glow-unknown)`,
                          subtitleColor: "#d6deeb",
                          initialsFill: "#142033",
                          lineColor: "rgba(190,201,222,0.45)",
                        };

                    return (
                      <g
                        key={node.email}
                        transform={`translate(${node.x * layout.stepX + layout.offsetX - NODE_WIDTH / 2}, ${node.y})`}
                        filter={cardTheme.glow}
                      >
                        <rect
                          width={NODE_WIDTH}
                          height={NODE_HEIGHT}
                          rx="24"
                          fill={cardTheme.fill}
                          stroke={cardTheme.border}
                          strokeOpacity={0.82}
                          strokeWidth={1.9}
                        />
                        <rect
                          x="2"
                          y="2"
                          width={NODE_WIDTH - 4}
                          height={NODE_HEIGHT - 4}
                          rx="22"
                          fill="none"
                          stroke="rgba(255,255,255,0.16)"
                          strokeWidth="1"
                        />
                        <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx="24" fill={`url(#${svgPrefix}-card-glow)`} />
                        <path
                          d={`M 0 ${NODE_HEIGHT} L ${Math.round(NODE_WIDTH * 0.55)} 0`}
                          fill="none"
                          stroke={`url(#${svgPrefix}-card-diagonal)`}
                          strokeWidth="1.2"
                        />
                        <rect x="16" y="14" width={badgeWidth} height="28" rx="10" fill={cardTheme.badgeFill} />
                        <text
                          x={16 + badgeWidth / 2}
                          y="33"
                          textAnchor="middle"
                          fill="#120d25"
                          fontSize="12.2"
                          fontWeight="800"
                          letterSpacing="0.08em"
                        >
                          {roleBadge}
                        </text>
                        <circle cx={NODE_WIDTH - 26} cy="28" r="12" fill="rgba(255,255,255,0.88)" />
                        <circle cx={NODE_WIDTH - 26} cy="28" r="12" fill="none" stroke="rgba(255,255,255,0.36)" strokeWidth="1" />
                        <text
                          x={NODE_WIDTH - 26}
                          y="32.2"
                          textAnchor="middle"
                          fill={cardTheme.initialsFill}
                          fontSize="9.8"
                          fontWeight="700"
                        >
                          {initials}
                        </text>
                        <text x="16" y="70" textAnchor="start" fill="#f8f4ff" fontSize="22" fontWeight="700">
                          {truncateText(node.name, 19)}
                        </text>
                        <text x="16" y="92" textAnchor="start" fill={cardTheme.subtitleColor} fontSize="12.2" fontWeight="500">
                          {truncateText(roleSubtitle, 31)}
                        </text>
                        <rect
                          x="16"
                          y={NODE_HEIGHT - 43}
                          width={NODE_WIDTH - 32}
                          height="30"
                          rx="13"
                          fill={cardTheme.pillFill}
                          stroke={cardTheme.pillStroke}
                          strokeWidth="1"
                        />
                        <rect
                          x="16"
                          y={NODE_HEIGHT - 43}
                          width={NODE_WIDTH - 32}
                          height="15"
                          rx="13"
                          fill={`url(#${svgPrefix}-pill-gloss)`}
                          opacity="0.7"
                        />
                        <circle cx="36" cy={NODE_HEIGHT - 28} r="9" fill="rgba(20,14,36,0.16)" />
                        <RolePillIcon
                          x={30}
                          y={NODE_HEIGHT - 34}
                          width={12}
                          height={12}
                          color="#140e24"
                          strokeWidth={2.15}
                        />
                        <path
                          d={`M 18 ${NODE_HEIGHT - 8} L ${NODE_WIDTH - 18} ${NODE_HEIGHT - 8}`}
                          fill="none"
                          stroke={cardTheme.lineColor}
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                        <text
                          x="52"
                          y={NODE_HEIGHT - 22}
                          textAnchor="start"
                          fill="#140e24"
                          fontSize="12.7"
                          fontWeight="700"
                        >
                          {truncateText(roleLabel, 23)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
