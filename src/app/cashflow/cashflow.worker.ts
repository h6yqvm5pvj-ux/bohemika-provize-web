import { createCashflowModel } from "./cashflowModel";
import type { CashflowModel } from "./cashflowWorker.types";
import type { CashflowWorkerRequest, CashflowWorkerResponse } from "./cashflowWorker.client";

const scope = self as unknown as {
  addEventListener(type: "message", listener: (event: MessageEvent<CashflowWorkerRequest>) => void): void;
  postMessage(message: CashflowWorkerResponse): void;
  close(): void;
};
let model: CashflowModel | null = null;
let revision = 0;

scope.addEventListener("message", ({ data }) => {
  if (!data || typeof data !== "object" || !["init", "view", "month", "dispose"].includes(data.kind)) {
    scope.postMessage({ kind: "invalid", id: -1, ok: false });
    return;
  }
  if (data.kind === "dispose") {
    try { model?.dispose(); } catch { /* Dispose must not log model contents. */ }
    finally { model = null; scope.close(); }
    return;
  }
  try {
    if (data.kind === "init") {
      if (model) throw new Error("Already initialized");
      model = createCashflowModel(data.dataset);
      scope.postMessage({ kind: "init", id: 0, ok: true });
    } else if (data.kind === "view") {
      if (!model || data.revision <= revision) throw new Error("Invalid view revision");
      const result = model.view(data.options);
      revision = data.revision;
      scope.postMessage({ kind: "view", id: data.id, revision, ok: true, result });
    } else if (data.kind === "month") {
      if (!model || data.revision !== revision || revision === 0) throw new Error("Invalid month revision");
      scope.postMessage({ kind: "month", id: data.id, revision, ok: true, result: model.month(data.key) });
    } else throw new Error("Invalid worker request");
  } catch {
    scope.postMessage({ kind: data.kind, id: data.id, ok: false });
  }
});
