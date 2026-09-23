import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { loadOnlineCardBySlug, ONLINE_CARD_SLUG_RE } from "@/lib/server/onlineCard";
import { onlineCardSharePortrait } from "@/lib/server/onlineCardShareImage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug.length < 3 || slug.length > 64 || !ONLINE_CARD_SLUG_RE.test(slug)) return new Response(null, { status: 404 });
  const card = await loadOnlineCardBySlug(slug);
  if (!card) return new Response(null, { status: 404 });
  const [portrait, regular, bold] = await Promise.all([
    onlineCardSharePortrait(card.profileAvatar),
    readFile(join(process.cwd(), "public/fonts/LiberationSans-Regular.ttf")),
    readFile(join(process.cwd(), "public/fonts/LiberationSans-Bold.ttf")),
  ]);
  const fullName = card.fullName.replace(/\s+/g, " ").trim();
  const bio = card.bio?.trim().split(/\n\s*\n/)[0]?.replace(/\s+/g, " ") || "";
  const introduction = bio.length > 130 ? `${bio.slice(0, 127).replace(/\s+\S*$/, "")}…` : bio;
  const initials = fullName.split(" ").filter(Boolean).map(part => Array.from(part)[0]).filter(Boolean);
  const initialsLabel = [initials[0], initials.length > 1 ? initials.at(-1) : ""].join("");
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#f7f9fc", fontFamily: "Liberation Sans", color: "#142334", padding: "58px 64px", alignItems: "center", gap: 56 }}>
      <div style={{ display: "flex", flex: 1, flexDirection: "column", height: "100%", minWidth: 0 }}>
        <div style={{ display: "flex", fontSize: 27, fontWeight: 700, color: "#226486", marginBottom: 38 }}>Bohemika</div>
        <div style={{ display: "flex", fontSize: fullName.length > 45 ? 40 : fullName.length > 27 ? 52 : 64, lineHeight: 1.06, fontWeight: 700, overflowWrap: "anywhere", lineClamp: 3 }}>{fullName}</div>
        <div style={{ display: "flex", fontSize: 26, lineHeight: 1.2, color: "#496179", marginTop: 18, lineClamp: 2 }}>{card.title || "Finanční poradce"}</div>
        {introduction ? <div style={{ display: "flex", fontSize: 23, lineHeight: 1.3, color: "#496179", marginTop: 20, lineClamp: 3 }}>{introduction}</div> : null}
        {card.location ? <div style={{ display: "flex", fontSize: 23, color: "#226486", marginTop: 20, lineClamp: 2 }}>{card.location}</div> : null}
        <div style={{ display: "flex", marginTop: "auto", paddingTop: 20, fontSize: 20, color: "#708397" }}>bohemka.app</div>
      </div>
      <div style={{ display: "flex", width: 370, height: 430, borderRadius: 40, overflow: "hidden", background: "#e0ecf3", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {portrait
          // ImageResponse renders the supplied bytes directly, without browser image loading.
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={portrait} alt="" width={370} height={430} style={{ objectFit: "cover" }} />
          : <div style={{ display: "flex", fontSize: 120, fontWeight: 700, color: "#226486" }}>{initialsLabel}</div>}
      </div>
    </div>,
    {
      width: 1200, height: 630,
      fonts: [
        { name: "Liberation Sans", data: regular, weight: 400, style: "normal" },
        { name: "Liberation Sans", data: bold, weight: 700, style: "normal" },
      ],
      headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
    },
  );
}
