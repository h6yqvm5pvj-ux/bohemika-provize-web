import { adminDb } from "@/lib/server/firebaseAdmin";
import type { Product } from "@/app/types/domain";

import type { ContractDoc } from "./contractsApi.types";
import {
  contractNumberClaimDocId,
  normalizeContractEntryType,
  normalizeContractNumber,
  normalizeContractNumberLoose,
} from "./contractsApi.identity";

export const CONTRACT_REFS_COLLECTION = "contractRefs";
export const CONTRACT_NUMBER_CLAIMS_COLLECTION = "contractNumberClaims";

const normalizeEmail = (email: string | null | undefined): string =>
  (email ?? "").trim().toLowerCase();

export const isFirestoreFailedPrecondition = (error: unknown): boolean => {
  const code =
    typeof (error as { code?: unknown })?.code === "number"
      ? (error as { code?: number }).code
      : null;
  if (code === 9) return true;
  const message =
    typeof (error as { message?: unknown })?.message === "string"
      ? (error as { message?: string }).message ?? ""
      : "";
  return /FAILED_PRECONDITION/i.test(message);
};

export type ExistingContractByNumber = {
  entryPath: string;
  ownerEmail: string | null;
  entryId: string | null;
};

export async function findExistingContractByNumber(
  contractNumber: string,
  options: { excludeEntryPath?: string | null } = {}
): Promise<ExistingContractByNumber | null> {
  if (!adminDb) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const db = adminDb;
  const normalized = normalizeContractNumber(contractNumber);
  const excludeEntryPath = (options.excludeEntryPath ?? "").trim();
  if (!normalized) return null;

  const claimRef = db
    .collection(CONTRACT_NUMBER_CLAIMS_COLLECTION)
    .doc(contractNumberClaimDocId(normalized));
  const claimSnap = await claimRef.get();
  if (claimSnap.exists) {
    const claimData = (claimSnap.data() ?? {}) as {
      entryPath?: string | null;
      ownerEmail?: string | null;
      entryId?: string | null;
    };
    const claimedEntryPath = (claimData.entryPath ?? "").trim();
    if (claimedEntryPath && claimedEntryPath !== excludeEntryPath) {
      const claimedEntrySnap = await db.doc(claimedEntryPath).get();
      if (claimedEntrySnap.exists) {
        const claimedEntry = (claimedEntrySnap.data() ?? {}) as ContractDoc;
        if (
          normalizeContractEntryType(claimedEntry.entryType ?? "contract") ===
            "contract" &&
          normalizeContractNumber(claimedEntry.contractNumber) === normalized
        ) {
          return {
            entryPath: claimedEntryPath,
            ownerEmail:
              normalizeEmail(claimData.ownerEmail) ||
              normalizeEmail(
                (claimedEntry.userEmail as string | undefined) ??
                  claimedEntrySnap.ref.path.split("/")[1]
              ) ||
              null,
            entryId: (claimData.entryId ?? "").trim() || claimedEntrySnap.id,
          };
        }
      }
    }
  }

  const refs = await resolveEntryRefsByContractNumber(normalized);
  const refsByPath = new Map<
    string,
    FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>
  >();
  refs.forEach((ref) => refsByPath.set(ref.path, ref));
  for (const ref of refsByPath.values()) {
    if (excludeEntryPath && ref.path === excludeEntryPath) continue;
    const snap = await ref.get();
    if (!snap.exists) continue;

    const data = (snap.data() ?? {}) as ContractDoc;
    if (normalizeContractEntryType(data.entryType ?? "contract") !== "contract") {
      continue;
    }
    if (normalizeContractNumber(data.contractNumber) !== normalized) continue;

    const ownerFromPath = ref.path.split("/")[1] ?? "";
    return {
      entryPath: ref.path,
      ownerEmail:
        normalizeEmail((data.userEmail as string | undefined) ?? ownerFromPath) ||
        null,
      entryId: ref.id,
    };
  }

  return null;
}

export async function collectContractDuplicateGuardRefs({
  ownerEntriesRef,
  contractNumber,
  excludeEntryPath,
}: {
  ownerEntriesRef: FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>;
  contractNumber: string;
  excludeEntryPath?: string | null;
}): Promise<FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>[]> {
  const normalized = normalizeContractNumber(contractNumber);
  if (!normalized) return [];

  const excludedPath = (excludeEntryPath ?? "").trim();
  const refsByPath = new Map<
    string,
    FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>
  >();
  const addRef = (
    ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>
  ) => {
    if (excludedPath && ref.path === excludedPath) return;
    refsByPath.set(ref.path, ref);
  };

  const indexedRefs = await resolveEntryRefsByContractNumber(normalized);
  indexedRefs.forEach(addRef);

  const ownerRefs = await collectOwnerEntryRefsByContractNumber({
    ownerEntriesRef,
    contractNumber,
    excludeEntryPath,
    contextLabel: "collectContractDuplicateGuardRefs",
  });
  ownerRefs.forEach(addRef);

  return [...refsByPath.values()];
}

export async function collectOwnerEntryRefsByContractNumber({
  ownerEntriesRef,
  contractNumber,
  excludeEntryPath,
  contextLabel = "collectOwnerEntryRefsByContractNumber",
}: {
  ownerEntriesRef: FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>;
  contractNumber: string;
  excludeEntryPath?: string | null;
  contextLabel?: string;
}): Promise<FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>[]> {
  const normalized = normalizeContractNumber(contractNumber);
  if (!normalized) return [];

  const excludedPath = (excludeEntryPath ?? "").trim();
  const refsByPath = new Map<
    string,
    FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>
  >();
  const addRef = (
    ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>
  ) => {
    if (excludedPath && ref.path === excludedPath) return;
    refsByPath.set(ref.path, ref);
  };

  const possibleStoredNumbers = new Set<string>();
  const raw = contractNumber.trim();
  if (raw) possibleStoredNumbers.add(raw);
  possibleStoredNumbers.add(normalized);
  const loose = normalizeContractNumberLoose(contractNumber);
  if (loose) possibleStoredNumbers.add(loose);

  const consumeOwnerSnap = (
    snap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>
  ) => {
    for (const docSnap of snap.docs) {
      addRef(docSnap.ref);
    }
  };

  try {
    const ownerSnaps = await Promise.all(
      [...possibleStoredNumbers].map((number) =>
        ownerEntriesRef.where("contractNumber", "==", number).get()
      )
    );
    ownerSnaps.forEach(consumeOwnerSnap);
  } catch (queryErr) {
    if (!isFirestoreFailedPrecondition(queryErr)) {
      throw queryErr;
    }
    console.warn(
      `${contextLabel}: owner entries contractNumber query failed with FAILED_PRECONDITION, falling back to owner collection scan.`,
      queryErr
    );
    const ownerSnap = await ownerEntriesRef.get();
    for (const docSnap of ownerSnap.docs) {
      const data = (docSnap.data() ?? {}) as { contractNumber?: unknown };
      const docContractNumber =
        typeof data.contractNumber === "string" ? data.contractNumber : null;
      if (normalizeContractNumber(docContractNumber) !== normalized) continue;
      addRef(docSnap.ref);
    }
  }

  return [...refsByPath.values()];
}

export const contractRefDocId = (ownerEmail: string, entryId: string): string =>
  `${normalizeEmail(ownerEmail)}___${entryId.trim()}`;

export const entryRefPath = (ownerEmail: string, entryId: string): string =>
  `users/${normalizeEmail(ownerEmail)}/entries/${entryId.trim()}`;

export type ContractRefPayload = {
  ownerEmail: string;
  entryId: string;
  entryPath: string;
  contractNumberRaw: string;
  contractNumberNormalized: string;
  contractNumberLoose: string;
  productKey: Product | null;
  updatedAt: Date;
};

export const contractRefFromData = ({
  ownerEmail,
  entryId,
  contractNumber,
  productKey,
}: {
  ownerEmail: string;
  entryId: string;
  contractNumber: string | null | undefined;
  productKey: Product | null | undefined;
}): ContractRefPayload | null => {
  const normalizedOwner = normalizeEmail(ownerEmail);
  const trimmedEntryId = entryId.trim();
  const contractNumberNormalized = normalizeContractNumber(contractNumber);
  const contractNumberLoose = normalizeContractNumberLoose(contractNumber);

  if (!normalizedOwner || !trimmedEntryId || !contractNumberNormalized) {
    return null;
  }

  return {
    ownerEmail: normalizedOwner,
    entryId: trimmedEntryId,
    entryPath: entryRefPath(normalizedOwner, trimmedEntryId),
    contractNumberRaw:
      typeof contractNumber === "string" ? contractNumber.trim() : "",
    contractNumberNormalized,
    contractNumberLoose,
    productKey: productKey ?? null,
    updatedAt: new Date(),
  };
};

export const applyContractRefToBatch = ({
  batch,
  ownerEmail,
  entryId,
  contractNumber,
  productKey,
}: {
  batch: FirebaseFirestore.WriteBatch;
  ownerEmail: string;
  entryId: string;
  contractNumber: string | null | undefined;
  productKey: Product | null | undefined;
}) => {
  if (!adminDb) return;
  const ref = adminDb
    .collection(CONTRACT_REFS_COLLECTION)
    .doc(contractRefDocId(ownerEmail, entryId));
  const payload = contractRefFromData({
    ownerEmail,
    entryId,
    contractNumber,
    productKey,
  });
  if (!payload) {
    batch.delete(ref);
    return;
  }
  batch.set(ref, payload, { merge: true });
};

export async function resolveEntryRefsByContractNumber(
  contractNumber: string
): Promise<FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>[]> {
  if (!adminDb) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const db = adminDb;
  const normalized = normalizeContractNumber(contractNumber);
  if (!normalized) return [];
  const loose = normalizeContractNumberLoose(contractNumber);

  const refsByPath = new Map<
    string,
    FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>
  >();

  const consumeContractRefSnap = (
    snap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>
  ) => {
    for (const docSnap of snap.docs) {
      const data = docSnap.data() as {
        ownerEmail?: string | null;
        entryId?: string | null;
        entryPath?: string | null;
      };
      const ownerEmail = normalizeEmail(data.ownerEmail);
      const entryId = (data.entryId ?? "").trim();
      const entryPathRaw = (data.entryPath ?? "").trim();
      const entryPath =
        entryPathRaw || (ownerEmail && entryId ? entryRefPath(ownerEmail, entryId) : "");
      if (!entryPath) continue;
      refsByPath.set(entryPath, db.doc(entryPath));
    }
  };

  const consumeEntrySnap = (
    snap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>
  ) => {
    for (const docSnap of snap.docs) {
      refsByPath.set(docSnap.ref.path, docSnap.ref);
    }
  };

  const contractRefQueries: Promise<
    FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>
  >[] = [
    db
      .collection(CONTRACT_REFS_COLLECTION)
      .where("contractNumberNormalized", "==", normalized)
      .get(),
  ];
  if (loose && loose !== normalized) {
    contractRefQueries.push(
      db
        .collection(CONTRACT_REFS_COLLECTION)
        .where("contractNumberLoose", "==", loose)
        .get()
    );
  }

  try {
    const contractRefSnaps = await Promise.all(contractRefQueries);
    contractRefSnaps.forEach(consumeContractRefSnap);
  } catch (queryErr) {
    if (isFirestoreFailedPrecondition(queryErr)) {
      console.warn(
        "resolveEntryRefsByContractNumber: contractRefs query failed with FAILED_PRECONDITION, skipping deep duplicate lookup.",
        queryErr
      );
      return [...refsByPath.values()];
    }
    throw queryErr;
  }

  if (refsByPath.size === 0) {
    const entryQueries: Promise<
      FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>
    >[] = [
      db.collectionGroup("entries").where("contractNumber", "==", contractNumber).get(),
    ];
    if (normalized && normalized !== contractNumber) {
      entryQueries.push(
        db.collectionGroup("entries").where("contractNumber", "==", normalized).get()
      );
    }
    if (loose && loose !== normalized && loose !== contractNumber) {
      entryQueries.push(
        db.collectionGroup("entries").where("contractNumber", "==", loose).get()
      );
    }
    try {
      const entrySnaps = await Promise.all(entryQueries);
      entrySnaps.forEach(consumeEntrySnap);
    } catch (queryErr) {
      if (isFirestoreFailedPrecondition(queryErr)) {
        console.warn(
          "resolveEntryRefsByContractNumber: collectionGroup entries query failed with FAILED_PRECONDITION, returning refs from contractRefs only.",
          queryErr
        );
        return [...refsByPath.values()];
      }
      throw queryErr;
    }
  }

  return [...refsByPath.values()];
}
