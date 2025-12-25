// src/app/pomucky/struktura/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import SplitTitle from "../plan-produkce/SplitTitle";
import { auth, db } from "../../firebase";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  where,
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

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (parts.length === 0) return email;
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

function positionLabel(pos: Position | null): string {
  if (!pos) return "Neznámá pozice";
  const map: Record<Position, string> = {
    poradce1: "Poradce 1",
    poradce2: "Poradce 2",
    poradce3: "Poradce 3",
    poradce4: "Poradce 4",
    poradce5: "Poradce 5",
    poradce6: "Poradce 6",
    poradce7: "Poradce 7",
    poradce8: "Poradce 8",
    poradce9: "Poradce 9",
    poradce10: "Poradce 10",
    manazer4: "Manažer 4",
    manazer5: "Manažer 5",
    manazer6: "Manažer 6",
    manazer7: "Manažer 7",
    manazer8: "Manažer 8",
    manazer9: "Manažer 9",
    manazer10: "Manažer 10",
  };
  return map[pos] ?? pos;
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
  const router = useRouter();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<Map<string, UserNode>>(new Map());
  const [visibleEmails, setVisibleEmails] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) {
        setUser(null);
        router.push("/login");
        return;
      }
      setUser(fbUser);
    });
    return () => unsub();
  }, [router]);

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

        // adjacency list children
        const childrenByManager = new Map<string, string[]>();
        map.forEach((u) => {
          if (!u.managerEmail) return;
          const arr = childrenByManager.get(u.managerEmail) ?? [];
          arr.push(u.email);
          childrenByManager.set(u.managerEmail, arr);
        });

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

        // potomci (BFS)
        const queue: string[] = [email];
        while (queue.length > 0) {
          const parent = queue.shift()!;
          const kids = childrenByManager.get(parent) ?? [];
          for (const kid of kids) {
            if (visible.has(kid)) continue;
            visible.add(kid);
            queue.push(kid);
          }
        }

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
        edges: [] as { from: PositionedNode; to: PositionedNode }[],
      };

    const H_STEP = 140;
    const V_STEP = 120;
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
      const positioned: PositionedNode = { ...node, x, y: depth * V_STEP };
      placed.push(positioned);
      posMap.set(positioned.email, positioned);
      return positioned;
    };

    const rootPos = dfs(treeRoot, 0);
    const maxX = Math.max(...placed.map((p) => p.x));

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
      width: Math.max((maxX + 1) * H_STEP, 900),
      height: (maxDepth + 1) * V_STEP + 80,
      stepX: H_STEP,
      stepY: V_STEP,
      edges,
    };
  }, [treeRoot, user]);

  if (!user) return null;

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-5xl space-y-6">
        <header className="mb-2">
          <SplitTitle text="Struktura" />
          <p className="text-sm text-slate-300 mt-1">
            Vidíš sebe, své nadřízené i podřízené v rámci vlastní struktury.
          </p>
        </header>

        <div className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-6 shadow-[0_18px_60px_rgba(0,0,0,0.8)]">
          {loading ? (
            <p className="text-sm text-slate-300">Načítám strukturu…</p>
          ) : !treeRoot ? (
            <p className="text-sm text-slate-300">Strukturu se nepodařilo načíst.</p>
          ) : layout.nodes.length === 0 || layout.stepX === 0 ? (
            <p className="text-sm text-slate-300">Strukturu se nepodařilo načíst.</p>
          ) : (
            <div className="relative w-full overflow-auto rounded-2xl border border-white/10 bg-black/20">
              <svg
                style={{ minWidth: "100%" }}
                width={layout.width}
                height={layout.height}
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                preserveAspectRatio="xMidYMin meet"
              >
                {/* hrany */}
                {layout.edges.map(({ from, to }) => (
                  <line
                    key={`${from.email}-${to.email}`}
                    x1={from.x * layout.stepX + layout.stepX / 2}
                    y1={from.y + 70}
                    x2={to.x * layout.stepX + layout.stepX / 2}
                    y2={to.y}
                    stroke="rgba(255,255,255,0.35)"
                    strokeWidth={2}
                  />
                ))}

                {/* uzly */}
                {layout.nodes.map((node) => {
                  const isCurrent = user?.email?.toLowerCase() === node.email;
                  return (
                    <g
                      key={node.email}
                      transform={`translate(${(node as PositionedNode).x * layout.stepX + layout.stepX / 2 - 60}, ${
                        (node as PositionedNode).y
                      })`}
                    >
                      <rect
                        width="120"
                        height="60"
                        rx="12"
                        fill={isCurrent ? "rgba(16,185,129,0.18)" : "rgba(255,255,255,0.08)"}
                        stroke={isCurrent ? "rgba(16,185,129,0.6)" : "rgba(255,255,255,0.2)"}
                        strokeWidth={2}
                      />
                      <text
                        x="60"
                        y="22"
                        textAnchor="middle"
                        fill="#e2e8f0"
                        fontSize="12"
                        fontWeight="600"
                      >
                        {node.name}
                      </text>
                      <text
                        x="60"
                        y="36"
                        textAnchor="middle"
                        fill="#cbd5e1"
                        fontSize="10"
                      >
                        {node.email}
                      </text>
                      <text
                        x="60"
                        y="50"
                        textAnchor="middle"
                        fill="#93c5fd"
                        fontSize="10"
                      >
                        {positionLabel(node.position)}
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
