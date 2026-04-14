// src/app/pomucky/struktura/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import {
  buildChildrenByManager,
  collectSubordinateHierarchy,
} from "@/app/lib/teamHierarchy";
import { positionLabel as positionLabelValue } from "@/app/lib/formatters";
import SplitTitle from "../plan-produkce/SplitTitle";
import { auth, db } from "../../firebase";
import {
  collection,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import type { Position } from "../../types/domain";

type UserNode = {
  email: string;
  name: string;
  position: Position | null;
  managerEmail: string | null;
};

type TreeNode = UserNode & { children: TreeNode[] };
type PositionedNode = TreeNode & { x: number; y: number };
const NODE_WIDTH = 220;
const NODE_HEIGHT = 84;

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
        const email = user.email.toLowerCase();

        // načti všechny uživatele (strom)
        const usersSnap = await getDocs(collection(db, "users"));
        const map = new Map<string, UserNode>();
        usersSnap.docs.forEach((d) => {
          const data = d.data() as any;
          const em = (data.email as string | undefined)?.toLowerCase() ?? d.id.toLowerCase();
          map.set(em, {
            email: em,
            name: data.name ?? nameFromEmail(em),
            position: (data.position as Position | undefined) ?? null,
            managerEmail: (data.managerEmail as string | undefined)?.toLowerCase() ?? null,
          });
        });

        // doplň se o vlastní dokument, pokud chybí
        if (!map.has(email)) {
          const meSnap = await getDoc(doc(db, "users", email));
          const d = meSnap.data() as any;
          map.set(email, {
            email,
            name: d?.name ?? nameFromEmail(email),
            position: (d?.position as Position | undefined) ?? null,
            managerEmail: (d?.managerEmail as string | undefined)?.toLowerCase() ?? null,
          });
        }

        // zjisti viditelné e-maily: vlastní + předci + potomci
        const visible = new Set<string>();
        visible.add(email);

        // předci
        let current = map.get(email)?.managerEmail ?? null;
        let depth = 0;
        while (current && !visible.has(current) && depth < 10) {
          visible.add(current);
          current = map.get(current)?.managerEmail ?? null;
          depth += 1;
        }

        const childrenByManager = buildChildrenByManager(map.values());
        const hierarchy = collectSubordinateHierarchy(email, childrenByManager);
        hierarchy.subordinateEmails.forEach((subEmail) => visible.add(subEmail));

        setNodes(map);
        setVisibleEmails(visible);
      } catch (e) {
        console.error("Chyba při načítání struktury:", e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user]);

  const treeRoot = useMemo(() => {
    if (!user?.email || nodes.size === 0 || visibleEmails.size === 0) return null;
    const email = user.email.toLowerCase();

    // najdi nejvyššího předka v rámci viditelných
    let rootEmail = email;
    let current = nodes.get(email)?.managerEmail ?? null;
    let depth = 0;
    while (current && visibleEmails.has(current) && depth < 10) {
      rootEmail = current;
      current = nodes.get(current)?.managerEmail ?? null;
      depth += 1;
    }

    // adjacency list znovu (jen viditelné)
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

    const H_STEP = 250;
    const V_STEP = 145;
    const TOP_PADDING = 24;
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
    const width = Math.max(contentWidth + 80, 960);
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
      height: (maxDepth + 1) * V_STEP + NODE_HEIGHT + TOP_PADDING + 24,
      stepX: H_STEP,
      stepY: V_STEP,
      offsetX,
      edges,
    };
  }, [treeRoot]);

  useEffect(() => {
    const centerTree = () => {
      const el = treeScrollRef.current;
      if (!el) return;
      el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
    };

    centerTree();
    window.addEventListener("resize", centerTree);
    return () => window.removeEventListener("resize", centerTree);
  }, [layout.width, layout.height, loading, treeRoot]);

  if (!user) return null;

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-5xl space-y-6">
        <header className="mb-2">
          <SplitTitle text="Struktura" />
          <p className="text-sm text-slate-600 mt-1">
            Vidíš sebe, své nadřízené i podřízené v rámci vlastní struktury.
          </p>
        </header>

        <div className="px-1 py-1">
          {loading ? (
            <p className="text-sm text-slate-600">Načítám strukturu…</p>
          ) : !treeRoot ? (
            <p className="text-sm text-slate-600">Strukturu se nepodařilo načíst.</p>
          ) : layout.nodes.length === 0 || layout.stepX === 0 ? (
            <p className="text-sm text-slate-600">Strukturu se nepodařilo načíst.</p>
          ) : (
            <div ref={treeScrollRef} className="relative w-full overflow-auto">
              <svg
                style={{ minWidth: "100%" }}
                width={layout.width}
                height={layout.height}
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                preserveAspectRatio="xMidYMin meet"
              >
                {/* hrany */}
                {layout.edges.map(({ from, to }) => (
                  <path
                    key={`${from.email}-${to.email}`}
                    d={`M ${from.x * layout.stepX + layout.offsetX} ${from.y + NODE_HEIGHT}
                        C ${from.x * layout.stepX + layout.offsetX} ${from.y + NODE_HEIGHT + 26},
                          ${to.x * layout.stepX + layout.offsetX} ${to.y - 26},
                          ${to.x * layout.stepX + layout.offsetX} ${to.y}`}
                    fill="none"
                    stroke="#94a3b8"
                    strokeOpacity="0.55"
                    strokeWidth={2}
                  />
                ))}

                {/* uzly */}
                {layout.nodes.map((node) => {
                  const isCurrent = user?.email?.toLowerCase() === node.email;
                  return (
                    <g
                      key={node.email}
                      transform={`translate(${node.x * layout.stepX + layout.offsetX - NODE_WIDTH / 2}, ${node.y})`}
                    >
                      <rect
                        width={NODE_WIDTH}
                        height={NODE_HEIGHT}
                        rx="16"
                        fill={isCurrent ? "#dcfce7" : "#ffffff"}
                        stroke={isCurrent ? "#16a34a" : "#cbd5e1"}
                        strokeWidth={2}
                      />
                      <text
                        x={NODE_WIDTH / 2}
                        y="28"
                        textAnchor="middle"
                        fill="#0f172a"
                        fontSize="15"
                        fontWeight="700"
                      >
                        {truncateText(node.name, 24)}
                      </text>
                      <text
                        x={NODE_WIDTH / 2}
                        y="50"
                        textAnchor="middle"
                        fill="#475569"
                        fontSize="11"
                      >
                        {truncateText(node.email, 30)}
                      </text>
                      <text
                        x={NODE_WIDTH / 2}
                        y="69"
                        textAnchor="middle"
                        fill={isCurrent ? "#047857" : "#0f172a"}
                        fontSize="11"
                        fontWeight="600"
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
      </div>
    </AppLayout>
  );
}
