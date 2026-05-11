// src/app/pomucky/struktura/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crown, Crosshair, Layers, Sparkles, Users } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { positionLabel as positionLabelValue } from "@/app/lib/formatters";
import SplitTitle from "../plan-produkce/SplitTitle";
import { auth } from "../../firebase";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import type { Position } from "../../types/domain";

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

const NODE_WIDTH = 220;
const NODE_HEIGHT = 98;

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

function roleIcon(pos: Position | null): string {
  if (!pos) return "•";
  if (pos.startsWith("manazer")) return "♔";
  if (pos.startsWith("poradce")) return "◉";
  return "•";
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
  const [loading, setLoading] = useState(true);
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
    const load = async () => {
      if (!user?.email) return;
      setLoading(true);
      try {
        const email = normalizeEmail(user.email);

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

        setNodes(map);
        setVisibleEmails(visible);
      } catch (e) {
        console.error("Chyba při načítání struktury:", e);
        const fallbackEmail = normalizeEmail(user.email);
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
        setLoading(false);
      }
    };

    void load();
  }, [user]);

  const treeRoot = useMemo(() => {
    if (!user?.email || nodes.size === 0 || visibleEmails.size === 0) return null;
    const email = user.email.toLowerCase();

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
  }, [user, nodes, visibleEmails]);

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

    const H_STEP = 274;
    const V_STEP = 170;
    const TOP_PADDING = 40;
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
    const width = Math.max(contentWidth + 180, 940);
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

  useEffect(() => {
    centerTree();
    window.addEventListener("resize", centerTree);
    return () => window.removeEventListener("resize", centerTree);
  }, [centerTree, layout.width, layout.height, loading, treeRoot]);

  const currentUserEmail = normalizeEmail(user?.email);

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
            <button
              type="button"
              onClick={centerTree}
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.08)] transition hover:border-slate-400 hover:text-slate-900"
            >
              <Crosshair className="h-3.5 w-3.5" />
              Vycentrovat strom
            </button>
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
                className="relative w-full overflow-auto rounded-[24px] border border-white/80 bg-white/65 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
              >
                <svg
                  style={{ minWidth: "100%" }}
                  width={layout.width}
                  height={layout.height}
                  viewBox={`0 0 ${layout.width} ${layout.height}`}
                  preserveAspectRatio="xMidYMin meet"
                >
                  <defs>
                    <linearGradient id={`${svgPrefix}-edge`} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.75" />
                      <stop offset="55%" stopColor="#60a5fa" stopOpacity="0.52" />
                      <stop offset="100%" stopColor="#a5b4fc" stopOpacity="0.66" />
                    </linearGradient>
                    <linearGradient id={`${svgPrefix}-node-current`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#ecfdf5" />
                      <stop offset="100%" stopColor="#dbeafe" />
                    </linearGradient>
                    <linearGradient id={`${svgPrefix}-node-manager`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#eef2ff" />
                      <stop offset="100%" stopColor="#e0e7ff" />
                    </linearGradient>
                    <linearGradient id={`${svgPrefix}-node-adviser`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#ffffff" />
                      <stop offset="100%" stopColor="#f8fafc" />
                    </linearGradient>
                    <linearGradient id={`${svgPrefix}-node-unknown`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#f8fafc" />
                      <stop offset="100%" stopColor="#f1f5f9" />
                    </linearGradient>
                    <filter id={`${svgPrefix}-shadow`} x="-35%" y="-35%" width="170%" height="190%">
                      <feDropShadow dx="0" dy="12" stdDeviation="8" floodColor="#0f172a" floodOpacity="0.18" />
                    </filter>
                    <filter id={`${svgPrefix}-glow`} x="-60%" y="-60%" width="220%" height="240%">
                      <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#22c55e" floodOpacity="0.32" />
                    </filter>
                  </defs>

                  {layout.edges.map(({ from, to }) => (
                    <path
                      key={`${from.email}-${to.email}`}
                      d={`M ${from.x * layout.stepX + layout.offsetX} ${from.y + NODE_HEIGHT}
                        C ${from.x * layout.stepX + layout.offsetX} ${from.y + NODE_HEIGHT + 28},
                          ${to.x * layout.stepX + layout.offsetX} ${to.y - 28},
                          ${to.x * layout.stepX + layout.offsetX} ${to.y}`}
                      fill="none"
                      stroke={`url(#${svgPrefix}-edge)`}
                      strokeLinecap="round"
                      strokeOpacity="0.8"
                      strokeWidth={2.4}
                    />
                  ))}

                  {layout.nodes.map((node) => {
                    const isCurrent = currentUserEmail === node.email;
                    const isManager = Boolean(node.position?.startsWith("manazer"));
                    const isAdviser = Boolean(node.position?.startsWith("poradce"));
                    const nodeFill = isCurrent
                      ? `url(#${svgPrefix}-node-current)`
                      : isManager
                      ? `url(#${svgPrefix}-node-manager)`
                      : isAdviser
                      ? `url(#${svgPrefix}-node-adviser)`
                      : `url(#${svgPrefix}-node-unknown)`;
                    const stroke = isCurrent ? "#16a34a" : isManager ? "#818cf8" : "#c7d2e3";
                    const rolePillFill = isCurrent ? "#dcfce7" : isManager ? "#e0e7ff" : "#f8fafc";
                    const rolePillStroke = isCurrent ? "#86efac" : isManager ? "#c7d2fe" : "#d6e1ee";
                    const roleTextColor = isCurrent ? "#047857" : isManager ? "#3730a3" : "#334155";
                    const avatarFill = isCurrent ? "#34d399" : isManager ? "#818cf8" : "#0ea5e9";
                    const initials = initialsFromName(node.name);

                    return (
                      <g
                        key={node.email}
                        transform={`translate(${node.x * layout.stepX + layout.offsetX - NODE_WIDTH / 2}, ${node.y})`}
                        filter={isCurrent ? `url(#${svgPrefix}-glow)` : `url(#${svgPrefix}-shadow)`}
                      >
                        <rect
                          width={NODE_WIDTH}
                          height={NODE_HEIGHT}
                          rx="18"
                          fill={nodeFill}
                          stroke={stroke}
                          strokeOpacity={isCurrent ? 0.95 : 0.9}
                          strokeWidth={isCurrent ? 2.4 : 1.8}
                        />
                        <circle cx="24" cy="24" r="11" fill={avatarFill} />
                        <text
                          x="24"
                          y="27.8"
                          textAnchor="middle"
                          fill="#f8fafc"
                          fontSize="9.5"
                          fontWeight="700"
                        >
                          {initials}
                        </text>
                        <text x="42" y="29" textAnchor="start" fill="#0f172a" fontSize="14" fontWeight="700">
                          {truncateText(node.name, 19)}
                        </text>
                        <rect
                          x="14"
                          y="57"
                          width={NODE_WIDTH - 28}
                          height="25"
                          rx="9"
                          fill={rolePillFill}
                          stroke={rolePillStroke}
                          strokeWidth="1.1"
                        />
                        <text
                          x={NODE_WIDTH / 2}
                          y="74"
                          textAnchor="middle"
                          fill={roleTextColor}
                          fontSize="11.5"
                          fontWeight="700"
                        >
                          {`${roleIcon(node.position)} ${positionLabel(node.position)}`}
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
