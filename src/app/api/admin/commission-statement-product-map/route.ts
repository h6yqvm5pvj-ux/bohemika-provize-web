import { NextResponse, type NextRequest } from "next/server";

import {
  adminAuthErrorResponse,
  getAdminAuthContext,
} from "@/lib/server/adminAuth";
import {
  readStatementProductMapConfig,
  saveStatementProductMapConfig,
} from "@/lib/server/commissionStatementProductMap";

export async function GET(req: NextRequest) {
  const auth = await getAdminAuthContext(req, {
    minimumRole: "admin",
    actionLabel: "správu produktové mapy výpisů",
  });
  if ("error" in auth) return adminAuthErrorResponse(auth);

  try {
    const config = await readStatementProductMapConfig();
    return NextResponse.json({
      ok: true,
      ...config,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Produktovou mapu výpisů se nepodařilo načíst.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const auth = await getAdminAuthContext(req, {
    minimumRole: "admin",
    actionLabel: "úpravu produktové mapy výpisů",
  });
  if ("error" in auth) return adminAuthErrorResponse(auth);

  const body = (await req.json().catch(() => null)) as
    | { entries?: unknown }
    | null;
  if (!body || !Array.isArray(body.entries)) {
    return NextResponse.json(
      { ok: false, error: "Chybí pole entries s produktovou mapou." },
      { status: 400 }
    );
  }

  try {
    const config = await saveStatementProductMapConfig({
      entries: body.entries,
      updatedBy: auth.adminEmail,
    });
    return NextResponse.json({
      ok: true,
      ...config,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Produktovou mapu výpisů se nepodařilo uložit.",
      },
      { status: 500 }
    );
  }
}
