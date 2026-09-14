import type { Position } from "@/app/types/domain";

export type StructureMember = {
  email: string;
  name: string;
  position: Position | null;
  managerEmail: string | null;
  profileAvatar?: string;
  accountType?: "advisor" | "tipster";
};
export type StructureNode = StructureMember & { x: number; y: number; depth: number; children: number };
export const NODE_WIDTH = 268;
export const NODE_HEIGHT = 158;
const STEP_X = 306;
const STEP_Y = 230;
const PADDING = 90;

export function layoutStructure(members: StructureMember[], ownEmail: string) {
  const byEmail = new Map(members.map((member) => [member.email, member]));
  const own = byEmail.get(ownEmail);
  if (!own) return { nodes: [] as StructureNode[], edges: [] as { from: StructureNode; to: StructureNode }[], width: 0, height: 0, levels: 0 };
  let root = own;
  const ancestors = new Set([own.email]);
  while (root.managerEmail && byEmail.has(root.managerEmail) && !ancestors.has(root.managerEmail)) {
    ancestors.add(root.managerEmail);
    root = byEmail.get(root.managerEmail)!;
  }
  const childrenByParent = new Map<string, StructureMember[]>();
  members.forEach((member) => {
    if (!member.managerEmail || member.email === root.email) return;
    const children = childrenByParent.get(member.managerEmail) ?? [];
    children.push(member);
    childrenByParent.set(member.managerEmail, children);
  });
  childrenByParent.forEach((children) => children.sort((a, b) => a.name.localeCompare(b.name, "cs")));
  const visited = new Set<string>();
  const nodes: StructureNode[] = [];
  const edges: { from: StructureNode; to: StructureNode }[] = [];
  let nextLeaf = 0;
  let maxDepth = 0;
  const place = (member: StructureMember, depth: number): StructureNode => {
    visited.add(member.email);
    maxDepth = Math.max(depth, maxDepth);
    const children = (childrenByParent.get(member.email) ?? [])
      .filter((child) => !visited.has(child.email))
      .map((child) => place(child, depth + 1));
    const x = children.length
      ? (children[0].x + children[children.length - 1].x) / 2
      : PADDING + nextLeaf++ * STEP_X;
    const node = { ...member, x, y: PADDING + depth * STEP_Y, depth, children: children.length };
    nodes.push(node);
    children.forEach((child) => edges.push({ from: node, to: child }));
    return node;
  };
  place(root, 0);
  return { nodes, edges, width: Math.max(700, nextLeaf * STEP_X - (STEP_X - NODE_WIDTH) + PADDING * 2), height: PADDING * 2 + maxDepth * STEP_Y + NODE_HEIGHT, levels: maxDepth + 1 };
}
