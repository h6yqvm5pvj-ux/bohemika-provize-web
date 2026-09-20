import type { Metadata, Viewport } from "next";
import { AuthEmailActionPage } from "./AuthEmailActionPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Potvrzení účtu | Bohemka.App",
  referrer: "no-referrer",
  robots: { index: false, follow: false, nocache: true },
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true, themeColor: "#0e0a18",
};

export default function Page() {
  return <AuthEmailActionPage />;
}
