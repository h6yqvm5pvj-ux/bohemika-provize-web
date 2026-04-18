import { NextResponse, type NextRequest } from "next/server";

import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import {
  buildChildrenByManager,
  collectSubordinateHierarchy,
} from "@/app/lib/teamHierarchy";
import { toDate } from "@/app/lib/formatters";
import { isLifeProduct, productCategory, productInstitutionLabel } from "@/app/lib/productCatalog";
import { type PaymentFrequency, type Position, type Product } from "@/app/types/domain";
import { applyRateLimitHeaders, consumeRateLimit } from "@/lib/server/rateLimit";

type TeamMember = {
  email: string;
  name: string;
  position: Position | null;
  managerEmail: string | null;
  docId: string;
  lastActiveTs: number | null;
};

type Category = "life" | "auto" | "property" | "travel" | "comfort" | "other";
type AggregateMetrics = {
  contracts: number;
  annualPremium: number;
  monthlyPremium: number;
};
type ContractStats = {
  total: number;
  month: number;
  categories: Record<Category, number>;
  categoryMetrics: Record<Category, AggregateMetrics>;
  institutionMetrics: Record<string, AggregateMetrics>;
  institutionByCategory: Record<Category, Record<string, AggregateMetrics>>;
};

type TeamOverviewSuccess = {
  ok: true;
  position: Position | null;
  canManagePositions: boolean;
  members: Array<{
    email: string;
    name: string;
    position: Position | null;
    managerEmail: string | null;
    docId: string;
  }>;
  lastActive: Record<string, number | null>;
  contractCounts: Record<string, ContractStats>;
};

type TeamOverviewError = {
  ok: false;
  error: string;
};

const TEAM_OVERVIEW_RATE_LIMIT = 120;
const TEAM_OVERVIEW_RATE_LIMIT_WINDOW_MS = 60_000;

const normalizeEmail = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

function nameFromEmail(email: string | null | undefined): string {
  if (!email) return "Neznámý uživatel";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (!parts.length) return email;
  return parts
    .map((part) =>
      part.length === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join(" ");
}

function paymentsPerYear(freq?: PaymentFrequency | null): number {
  switch (freq) {
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "semiannual":
      return 2;
    default:
      return 1;
  }
}

function categorizeProduct(p?: Product | null): Category {
  switch (productCategory(p)) {
    case "life":
      return "life";
    case "auto":
      return "auto";
    case "property":
      return "property";
    case "travel":
      return "travel";
    case "comfort":
      return "comfort";
    default:
      return "other";
  }
}

function annualPremiumFromEntry(data: any, category: Category): number {
  const raw = Number(data?.inputAmount ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const product = data?.productKey as Product | undefined;
  if (isLifeProduct(product)) return raw * 12;
  if (category === "comfort") return raw;
  return raw * paymentsPerYear((data?.frequencyRaw ?? "annual") as PaymentFrequency);
}

function emptyCategoryCounts(): Record<Category, number> {
  return {
    life: 0,
    auto: 0,
    property: 0,
    travel: 0,
    comfort: 0,
    other: 0,
  };
}

function emptyCategoryMetrics(): Record<Category, AggregateMetrics> {
  return {
    life: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    auto: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    property: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    travel: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    comfort: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    other: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
  };
}

function emptyInstitutionByCategory(): Record<Category, Record<string, AggregateMetrics>> {
  return {
    life: {},
    auto: {},
    property: {},
    travel: {},
    comfort: {},
    other: {},
  };
}

async function getAuthEmail(req: NextRequest): Promise<string> {
  if (!adminAuth || !adminDb) {
    throw Object.assign(new Error("Server není správně nakonfigurován."), { status: 500 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) {
    throw Object.assign(new Error("Missing bearer token"), { status: 401 });
  }

  let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch (err: any) {
    const code = err?.code || "auth/invalid-token";
    const message = err?.message || "Invalid or expired token";
    throw Object.assign(new Error(`Invalid or expired token (${code}): ${message}`), {
      status: 401,
    });
  }

  const email = normalizeEmail(decoded.email);
  if (!email) {
    throw Object.assign(new Error("User e-mail missing in token"), { status: 401 });
  }
  return email;
}

async function loadTeamContext(ownEmail: string): Promise<{
  ownPosition: Position | null;
  canManagePositions: boolean;
  members: TeamMember[];
}> {
  if (!adminDb) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const usersSnap = await adminDb.collection("users").get();

  type CandidateNode = {
    email: string;
    name: string;
    position: Position | null;
    managerEmail: string | null;
    docId: string;
    lastActiveTs: number | null;
    adminFunction: boolean;
  };

  const candidatesByEmail = new Map<string, CandidateNode[]>();
  usersSnap.forEach((docSnap) => {
    const data = docSnap.data() as any;
    const email = normalizeEmail((data.email as string | undefined) ?? docSnap.id);
    if (!email) return;

    const node: CandidateNode = {
      email,
      name: nameFromEmail(email),
      position: (data.position as Position | undefined) ?? null,
      managerEmail: normalizeEmail(data.managerEmail as string | undefined) || null,
      docId: String(docSnap.id ?? email),
      lastActiveTs: (() => {
        const ts = toDate(data.lastActive)?.getTime();
        return Number.isFinite(ts) ? Number(ts) : null;
      })(),
      adminFunction: data.adminFunction === true || data.adminfunction === true,
    };

    const current = candidatesByEmail.get(email) ?? [];
    current.push(node);
    candidatesByEmail.set(email, current);
  });

  const pickBestCandidate = (items: CandidateNode[], emailKey: string): CandidateNode => {
    return [...items].sort((a, b) => {
      const aDoc = a.docId.trim().toLowerCase();
      const bDoc = b.docId.trim().toLowerCase();
      const aCanonical = aDoc === emailKey ? 0 : 1;
      const bCanonical = bDoc === emailKey ? 0 : 1;
      if (aCanonical !== bCanonical) return aCanonical - bCanonical;

      const aHasPosition = a.position ? 0 : 1;
      const bHasPosition = b.position ? 0 : 1;
      if (aHasPosition !== bHasPosition) return aHasPosition - bHasPosition;

      const aHasManager = a.managerEmail ? 0 : 1;
      const bHasManager = b.managerEmail ? 0 : 1;
      if (aHasManager !== bHasManager) return aHasManager - bHasManager;

      return aDoc.localeCompare(bDoc, "cs");
    })[0];
  };

  const usersByEmail = new Map<string, CandidateNode>();
  candidatesByEmail.forEach((items, emailKey) => {
    usersByEmail.set(emailKey, pickBestCandidate(items, emailKey));
  });

  if (!usersByEmail.has(ownEmail)) {
    usersByEmail.set(ownEmail, {
      email: ownEmail,
      name: nameFromEmail(ownEmail),
      position: null,
      managerEmail: null,
      docId: ownEmail,
      lastActiveTs: null,
      adminFunction: false,
    });
  }

  const ownNode = usersByEmail.get(ownEmail)!;
  const childrenByManager = buildChildrenByManager(usersByEmail.values());
  const hierarchy = collectSubordinateHierarchy(ownEmail, childrenByManager);

  const members: TeamMember[] = [];
  members.push({
    email: ownNode.email,
    name: ownNode.name,
    position: ownNode.position,
    managerEmail: ownNode.managerEmail,
    docId: ownNode.docId,
    lastActiveTs: ownNode.lastActiveTs,
  });

  hierarchy.subordinateEmails.forEach((subEmail) => {
    const node = hierarchy.subordinateByEmail.get(subEmail);
    if (!node) return;
    members.push({
      email: node.email,
      name: node.name,
      position: node.position,
      managerEmail: node.managerEmail,
      docId: node.docId,
      lastActiveTs: node.lastActiveTs,
    });
  });

  let privateAdminFunction = false;
  try {
    const privateSnap = await adminDb.collection("usersPrivate").doc(ownEmail).get();
    if (privateSnap.exists) {
      const privateData = privateSnap.data() as any;
      privateAdminFunction =
        privateData?.adminFunction === true || privateData?.adminfunction === true;
    }
  } catch {
    // Keep best-effort behaviour; public admin flag still works.
  }

  const canManagePositions = Boolean(privateAdminFunction || ownNode.adminFunction);

  return {
    ownPosition: ownNode.position,
    canManagePositions,
    members,
  };
}

async function buildContractStatsByOwner(
  owners: string[]
): Promise<Record<string, ContractStats>> {
  const db = adminDb;
  if (!db) {
    throw new Error("Firebase Admin credentials are not configured.");
  }
  const stats: Record<string, ContractStats> = {};
  if (owners.length === 0) return stats;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const ownerSet = new Set(owners.map((email) => normalizeEmail(email)).filter(Boolean));
  const seen = new Set<string>();

  const consumeEntry = (data: any, ownerEmailRaw: string | null | undefined, entryId: string) => {
    const ownerEmail = normalizeEmail(
      (data.userEmail as string | undefined) ?? ownerEmailRaw
    );
    if (!ownerEmail || !ownerSet.has(ownerEmail)) return;

    const key = `${ownerEmail}___${entryId}`;
    if (seen.has(key)) return;
    seen.add(key);

    const current =
      stats[ownerEmail] ?? {
        total: 0,
        month: 0,
        categories: emptyCategoryCounts(),
        categoryMetrics: emptyCategoryMetrics(),
        institutionMetrics: {},
        institutionByCategory: emptyInstitutionByCategory(),
      };

    current.total += 1;
    const category = categorizeProduct(data.productKey as Product | undefined);
    current.categories[category] = (current.categories[category] ?? 0) + 1;

    const annualPremium = annualPremiumFromEntry(data, category);
    const monthlyPremium = annualPremium / 12;

    const byCategory = current.categoryMetrics[category] ?? {
      contracts: 0,
      annualPremium: 0,
      monthlyPremium: 0,
    };
    byCategory.contracts += 1;
    byCategory.annualPremium += annualPremium;
    byCategory.monthlyPremium += monthlyPremium;
    current.categoryMetrics[category] = byCategory;

    const institution = productInstitutionLabel(data.productKey as Product | undefined, "Ostatní") ?? "Ostatní";
    const byInstitution = current.institutionMetrics[institution] ?? {
      contracts: 0,
      annualPremium: 0,
      monthlyPremium: 0,
    };
    byInstitution.contracts += 1;
    byInstitution.annualPremium += annualPremium;
    byInstitution.monthlyPremium += monthlyPremium;
    current.institutionMetrics[institution] = byInstitution;

    const byInstitutionForCategory = current.institutionByCategory[category][institution] ?? {
      contracts: 0,
      annualPremium: 0,
      monthlyPremium: 0,
    };
    byInstitutionForCategory.contracts += 1;
    byInstitutionForCategory.annualPremium += annualPremium;
    byInstitutionForCategory.monthlyPremium += monthlyPremium;
    current.institutionByCategory[category][institution] = byInstitutionForCategory;

    const signed = toDate(data.contractSignedDate ?? data.createdAt);
    const ts = signed?.getTime();
    if (ts != null && ts >= monthStart && ts < nextMonthStart) {
      current.month += 1;
    }

    stats[ownerEmail] = current;
  };

  const chunkSize = 10;
  for (let i = 0; i < owners.length; i += chunkSize) {
    const chunk = owners.slice(i, i + chunkSize);
    try {
      const groupSnap = await db
        .collectionGroup("entries")
        .where("userEmail", "in", chunk)
        .get();

      groupSnap.docs.forEach((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        const owner =
          normalizeEmail((data.userEmail as string | undefined) ?? docSnap.ref.parent.parent?.id) ||
          null;
        consumeEntry(data, owner, docSnap.id);
      });
    } catch {
      // Continue with per-user fallback.
    }
  }

  await Promise.all(
    owners.map(async (owner) => {
      try {
        const ownerSnap = await db
          .collection("users")
          .doc(owner)
          .collection("entries")
          .get();
        ownerSnap.docs.forEach((docSnap) => {
          consumeEntry(docSnap.data(), owner, docSnap.id);
        });
      } catch {
        // Ignore one broken branch and keep response usable.
      }
    })
  );

  return stats;
}

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthEmail(req);

    const rateLimitResult = consumeRateLimit({
      namespace: "api:team-overview:get",
      key: email,
      limit: TEAM_OVERVIEW_RATE_LIMIT,
      windowMs: TEAM_OVERVIEW_RATE_LIMIT_WINDOW_MS,
    });
    if (!rateLimitResult.allowed) {
      const response = NextResponse.json(
        {
          ok: false,
          error: "Příliš mnoho požadavků. Zkus to prosím za chvíli.",
        } satisfies TeamOverviewError,
        { status: 429 }
      );
      applyRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    const context = await loadTeamContext(email);
    const owners = Array.from(new Set(context.members.map((member) => member.email).filter(Boolean)));
    const contractCounts = await buildContractStatsByOwner(owners);

    const responseBody: TeamOverviewSuccess = {
      ok: true,
      position: context.ownPosition,
      canManagePositions: context.canManagePositions,
      members: context.members.map((member) => ({
        email: member.email,
        name: member.name,
        position: member.position,
        managerEmail: member.managerEmail,
        docId: member.docId,
      })),
      lastActive: Object.fromEntries(
        context.members.map((member) => [member.email, member.lastActiveTs ?? null])
      ),
      contractCounts,
    };

    const response = NextResponse.json(responseBody);
    applyRateLimitHeaders(response.headers, rateLimitResult);
    return response;
  } catch (err: any) {
    const status = Number(err?.status) || 500;
    const message =
      typeof err?.message === "string" && err.message.trim().length > 0
        ? err.message
        : "Nepodařilo se načíst tým.";
    return NextResponse.json(
      {
        ok: false,
        error: message,
      } satisfies TeamOverviewError,
      { status }
    );
  }
}
