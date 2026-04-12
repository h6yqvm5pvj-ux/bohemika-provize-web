export type TeamHierarchyNode<TPosition = unknown> = {
  email: string;
  managerEmail: string | null;
  position?: TPosition | null;
};

type TeamHierarchyResult<TNode extends TeamHierarchyNode> = {
  subordinateEmails: string[];
  subordinateByEmail: Map<string, TNode>;
  managerOf: Map<string, string>;
};

const normalizeEmail = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

export function buildChildrenByManager<TNode extends TeamHierarchyNode>(
  nodes: Iterable<TNode>
): Map<string, TNode[]> {
  const childrenByManager = new Map<string, TNode[]>();

  for (const node of nodes) {
    const managerEmail = normalizeEmail(node.managerEmail);
    if (!managerEmail) continue;

    const list = childrenByManager.get(managerEmail) ?? [];
    list.push(node);
    childrenByManager.set(managerEmail, list);
  }

  return childrenByManager;
}

export function collectSubordinateHierarchy<TNode extends TeamHierarchyNode>(
  rootEmailRaw: string,
  childrenByManager: Map<string, TNode[]>
): TeamHierarchyResult<TNode> {
  const rootEmail = normalizeEmail(rootEmailRaw);
  const visited = new Set<string>();
  const subordinateByEmail = new Map<string, TNode>();
  const managerOf = new Map<string, string>();
  const queue: string[] = rootEmail ? [rootEmail] : [];

  while (queue.length > 0) {
    const currentManager = queue.shift()!;
    const children = childrenByManager.get(currentManager) ?? [];

    for (const child of children) {
      const childEmail = normalizeEmail(child.email);
      if (!childEmail || childEmail === rootEmail || visited.has(childEmail)) {
        continue;
      }

      visited.add(childEmail);
      subordinateByEmail.set(childEmail, child);
      managerOf.set(childEmail, currentManager);
      queue.push(childEmail);
    }
  }

  return {
    subordinateEmails: Array.from(visited),
    subordinateByEmail,
    managerOf,
  };
}

