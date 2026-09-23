import { NextResponse } from "next/server";
import { ensureSeeded, getSettingsCollection, readSettings, requireStaff } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Store settings. Readable by any signed-in staff; only Administrators may change it. */
export async function GET() {
  try {
    await ensureSeeded();
    const s = await readSettings();
    return NextResponse.json(s);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}

/** Updates the store profile. Requires an Administrator. */
export async function PUT(request: Request) {
  try {
    await ensureSeeded();
    await requireStaff(request, "Administrator");
    const body = (await request.json()) as Partial<{ name: string; location: string; receiptFooter: string; currency: string }>;
    const name = String(body.name ?? "").trim();
    const location = String(body.location ?? "").trim();
    const receiptFooter = String(body.receiptFooter ?? "").trim();
    const currency = String(body.currency ?? "").trim();
    if (!name) return bad("Store name is required.");
    if (name.length > 60) return bad("Store name is too long (max 60 characters).");
    if (location.length > 80) return bad("Location is too long (max 80 characters).");
    if (receiptFooter.length > 120) return bad("Receipt footer is too long (max 120 characters).");
    if (!currency) return bad("Currency symbol is required.");
    if (currency.length > 4) return bad("Currency symbol is too long (max 4 characters).");

    await (await getSettingsCollection()).updateOne(
      { _id: "settings" },
      { $set: { name, location, receiptFooter, currency } },
      { upsert: true }
    );
    return NextResponse.json({ ok: true, name, location, receiptFooter, currency });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    return bad(String(e), 503);
  }
}
