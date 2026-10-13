"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { APP_SESSION_COOKIE_NAME } from "@/lib/appSession";
import { verifyActiveAppSession } from "@/lib/server/activeAppSession";
import { consumeRateLimit } from "@/lib/server/rateLimit";

export async function refreshAuthenticatedRoutes(): Promise<void> {
  const verification = await verifyActiveAppSession(
    (await cookies()).get(APP_SESSION_COOKIE_NAME)?.value,
  );
  if (!verification.ok) {
    throw new Error("Přihlášení se nepodařilo ověřit. Zkus to znovu.");
  }
  const limit = await consumeRateLimit({
    namespace: "action:auth:refresh-routes",
    key: verification.session.uid,
    limit: 20,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    throw new Error("Dokončení přihlášení není momentálně dostupné. Zkus to za chvíli.");
  }

  // A cookie set by the session Route Handler does not invalidate client route
  // entries. Even router.refresh() retains cached guest redirects in Next 16.
  // A Server Action revalidation clears those entries without losing Firebase's
  // in-memory persistence through a full document navigation.
  revalidatePath("/", "layout");
}
