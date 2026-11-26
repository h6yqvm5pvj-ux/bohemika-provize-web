import { NextResponse, type NextRequest } from "next/server";
import { endorsementCommissionDay } from "@/app/lib/endorsementCommissionPlan";
import { AUTO_PRODUCTS } from "@/app/lib/productCatalog";
import { isVehicleOverlapProduct, vehicleRegistrationForMatch, vehicleVinForMatch } from "@/app/lib/vehicleOverlap";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { requireContractsEntryGuard } from "../../_lib/contractsApi";
import { isContractOwnerEmail, readContractFormBody } from "../../_lib/contractRequestForm";
import { readVehicleOverlapPreview } from "../../_lib/contractsApi.vehicleOverlap";

const fields = new Set(["ownerEmail", "productKey", "plate", "vin", "contractNumber", "policyStart", "policyEnd"]);
const invalidRequest = { ok: false, error: "Neplatný požadavek na kontrolu vozidla." };

export async function POST(req: NextRequest) {
  const guard = await requireContractsEntryGuard(req, { namespace: "api:contracts:vehicle-overlaps:preview", limit: 12, windowMs: 60_000 });
  if (!guard.ok) return guard.response;
  const { email, contractAccessEmails } = guard.ctx;
  const respond = (body: Record<string, unknown>, status = 200) => guard.withRateLimit(NextResponse.json(body, {
    status, headers: { "Cache-Control": "private, no-store" },
  }));
  const form = await readContractFormBody(req, 4 * 1024);
  if (typeof form === "number") return respond(invalidRequest, form);
  const keys = [...form.keys()];
  if (new Set(keys).size !== keys.length || keys.some(key => !fields.has(key))) return respond(invalidRequest, 400);

  const ownerEmail = form.get("ownerEmail")?.trim().toLowerCase() ?? "";
  const productKey = AUTO_PRODUCTS.find(key => key === form.get("productKey"));
  const plate = form.get("plate") ?? "";
  const vin = form.get("vin") ?? "";
  const contractNumber = form.get("contractNumber")?.trim() ?? "";
  const policyStart = form.get("policyStart") ?? "";
  const policyEnd = form.get("policyEnd") ?? "";
  if (!isContractOwnerEmail(ownerEmail) || !isVehicleOverlapProduct(productKey) || (!plate && !vin) ||
      (plate && vehicleRegistrationForMatch(plate) !== plate) || (vin && vehicleVinForMatch(vin) !== vin) ||
      contractNumber.length > 128 || (policyStart && endorsementCommissionDay(policyStart) !== policyStart) ||
      (policyEnd && endorsementCommissionDay(policyEnd) !== policyEnd) || (policyStart && policyEnd && policyEnd < policyStart)) {
    return respond(invalidRequest, 400);
  }
  if (ownerEmail !== email && !contractAccessEmails.includes(ownerEmail)) {
    return respond({ ok: false, error: "K těmto smlouvám nemáš přístup." }, 403);
  }
  if (!adminDb) return respond({ ok: false, error: "Kontrola vozidla je dočasně nedostupná." }, 503);

  try {
    const result = await readVehicleOverlapPreview({ db: adminDb, viewerEmail: email, accessibleOwners: contractAccessEmails,
      draft: { ownerEmail, productKey, plate, vin, contractNumber, policyStart, policyEnd }, signal: req.signal });
    return respond({ ok: true, ...result });
  } catch {
    return respond({ ok: false, error: "Kontrolu vozidla se nepodařilo dokončit." }, 503);
  }
}
