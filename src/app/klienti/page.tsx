import { notFound } from "next/navigation";

import ClientsPage from "../_klienti/page";
import { CLIENT_CARDS_ENABLED } from "../_klienti/clientFeature";

export const dynamic = "force-dynamic";

export default function ClientsRoute() {
  if (!CLIENT_CARDS_ENABLED) notFound();
  return <ClientsPage />;
}
