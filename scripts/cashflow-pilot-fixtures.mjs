export const CASHFLOW_PILOT_SCENARIOS = [
  { name: "small", contracts: 12 },
  { name: "medium", contracts: 60 },
  { name: "large", contracts: 132 },
];

const isoDay = value => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

/** Fictional auto portfolios near the current conservative server work budget. */
export function makeCashflowPilotFixture(scenario, asOf) {
  if (!CASHFLOW_PILOT_SCENARIOS.some(item => item.name === scenario.name && item.contracts === scenario.contracts) ||
    !(asOf instanceof Date) || !Number.isFinite(asOf.getTime())) throw new Error("Invalid synthetic fixture context.");
  const email = "advisor@example.test";
  const start = isoDay(new Date(asOf.getFullYear(), asOf.getMonth() - 6, 15));
  const snapshot = {
    email, myPosition: "manazer8", myCommissionMode: "standard", hasAnyTeam: true,
    ownEntries: [], teamEntriesRaw: [], tipPayouts: [], subscriptionPayments: [],
  };
  for (let index = 0; index < scenario.contracts; index++) {
    const team = index % 4 === 3;
    const entry = {
      id: `contract-${index}`, userEmail: team ? `member-${index % 3}@example.test` : email,
      productKey: ["cppAuto", "kooperativaAuto", "pillowAuto"][index % 3],
      frequencyRaw: index % 2 === 0 ? "annual" : "quarterly",
      contractNumber: String(100000 + index), clientName: `Synthetic client ${index}`,
      contractSignedDate: start, policyStartDate: start, position: "poradce3",
      ownerCurrentPosition: "poradce3", commissionMode: "standard", status: "active",
      inputAmount: 6_000 + index, total: 120 + index / 10,
      items: [{ code: "A101", title: "Okamžitá provize", amount: 120 + index / 10 }],
      ...(team ? { managerOverrides: [{ email, position: "manazer8", commissionMode: "standard",
        total: 20 + index / 100, items: [{ code: "A101", title: "Okamžitá provize", amount: 20 + index / 100 }] }] } : {}),
    };
    (team ? snapshot.teamEntriesRaw : snapshot.ownEntries).push(entry);
  }
  snapshot.tipPayouts = Array.from({ length: 3 }, (_, index) => ({
    id: `tip-${index}`, payoutDate: new Date(asOf.getFullYear(), asOf.getMonth() + index, 25).getTime(),
    amount: 50 + index, clientName: `Synthetic TIP ${index}`,
    sourceOwnerEmail: "member-0@example.test", productKey: "cppAuto",
  }));
  const statements = Array.from({ length: 2 }, (_, index) => {
    const date = new Date(asOf.getFullYear(), asOf.getMonth() - index, 24);
    return {
      id: `statement-${index}`, fileName: `synthetic-${index}.html`, statementNumber: String(index + 1),
      statementDate: `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`,
      period: `${date.getMonth() + 1}/${date.getFullYear()}`, advisorNumber: "synthetic",
      periodStartMs: new Date(date.getFullYear(), date.getMonth(), 1).getTime(),
      periodEndMs: new Date(date.getFullYear(), date.getMonth() + 1, 0).getTime(),
      statementDateMs: date.getTime(), payoutMonthKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      paidContractNumbers: ["100000"], paidCommissionKeys: ["100000:A101"],
      commissionTotal: 120, payoutTotal: 120, otherPaymentsTotal: 0, managerCommissionTotal: 0,
      createdAtMs: date.getTime(), updatedAtMs: date.getTime(),
    };
  });
  return { snapshot, statements };
}

export function pilotSourceDocuments(input) {
  const { ownEntries, teamEntriesRaw, tipPayouts, ...metadata } = input.snapshot;
  return [
    { id: "metadata", kind: "metadata", data: metadata },
    ...ownEntries.map((data, index) => ({ id: `own-${String(index).padStart(5, "0")}`, kind: "own", data })),
    ...teamEntriesRaw.map((data, index) => ({ id: `team-${String(index).padStart(5, "0")}`, kind: "team", data })),
    ...tipPayouts.map((data, index) => ({ id: `tip-${index}`, kind: "tip", data })),
    ...input.statements.map((data, index) => ({ id: `statement-${index}`, kind: "statement", data })),
  ];
}

export function pilotInputFromDocuments(documents) {
  const metadata = documents.filter(row => row.kind === "metadata");
  if (metadata.length !== 1 || documents.some(row => !["metadata", "own", "team", "tip", "statement"].includes(row.kind))) {
    throw new Error("Incomplete synthetic input.");
  }
  return {
    snapshot: { ...metadata[0].data,
      ownEntries: documents.filter(row => row.kind === "own").map(row => row.data),
      teamEntriesRaw: documents.filter(row => row.kind === "team").map(row => row.data),
      tipPayouts: documents.filter(row => row.kind === "tip").map(row => row.data),
    },
    statements: documents.filter(row => row.kind === "statement").map(row => row.data),
  };
}
