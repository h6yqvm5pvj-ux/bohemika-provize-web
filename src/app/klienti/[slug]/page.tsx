import { notFound } from "next/navigation";

import ClientCardPage from "../../_klienti/[slug]/page";
import { CLIENT_CARDS_ENABLED } from "../../_klienti/clientFeature";

export const dynamic = "force-dynamic";

export default function ClientCardRoute() {
  if (!CLIENT_CARDS_ENABLED) notFound();
  return <ClientCardPage />;
}
