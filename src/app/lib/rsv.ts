// src/app/lib/rsv.ts
import { auth } from "@/app/firebase-auth";

const RSV_PROXY_URL = "/api/rsv/vehicle";

export async function rsvVehicleLookupByVin(vin: string) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Nejsi přihlášen.");
  }

  const token = await user.getIdToken();
  const queryVin = vin.trim().toUpperCase();
  if (queryVin.length < 11) {
    throw new Error("VIN je moc krátké.");
  }

  const url = `${RSV_PROXY_URL}?vin=${encodeURIComponent(queryVin)}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const data = (await resp.json().catch(() => ({}))) as {
    message?: string;
    detail?: string;
    error?: string;
    [key: string]: unknown;
  };

  if (!resp.ok) {
    throw new Error(data.message || data.detail || data.error || "Chyba volání RSV.");
  }

  return data;
}
