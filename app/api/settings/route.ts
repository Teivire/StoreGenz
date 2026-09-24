import { NextResponse } from "next/server";
import { requireCapability, ensureSeeded, getSettingsCollection, readSettings, requireStaff } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/**
 * Store settings. Requires any signed-in staff (Cashier+) to read; only
 * Administrators may update. Requiring auth prevents anonymous enumeration of
 * store name, location, and currency from a public network.
 */
export async function GET(request: Request) {
  try {
    await ensureSeeded();
    await requireStaff(request);
    const s = await readSettings();
    return NextResponse.json(s);
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}

/**
 * Payment methods configuration: PATCH with the full enabled/disabled list.
 * Requires an Administrator — this changes what the POS will accept.
 */
export async function PATCH(request: Request) {
  try {
    await ensureSeeded();
    await requireCapability(request, "settings.manage");
    const body = (await request.json()) as { paymentMethods?: unknown };
    const raw = Array.isArray(body.paymentMethods) ? body.paymentMethods : null;
    if (!raw) return bad("paymentMethods must be an array.");
    const seen = new Set<string>();
    const methods: { name: string; enabled: boolean }[] = [];
    for (const m of raw) {
      const name = String((m as { name?: unknown })?.name ?? "").trim();
      const enabled = Boolean((m as { enabled?: unknown })?.enabled);
      if (!name) return bad("Every payment method needs a name.");
      if (name.length > 40) return bad("Payment method names are limited to 40 characters.");
      const key = name.toLowerCase();
      if (seen.has(key)) return bad(`Duplicate payment method "${name}".`);
      seen.add(key);
      methods.push({ name, enabled });
    }
    if (methods.length === 0) return bad("At least one payment method is required.");
    if (!methods.some(m => m.enabled)) return bad("At least one payment method must stay enabled.");
    if (!methods.some(m => m.name === "Cash" && m.enabled)) return bad("Cash must remain enabled — the register has to stay operable.");

    // Register defaults may arrive in the same PATCH (both are admin config).
    const reg = body as { registerOpeningFloat?: unknown; registerVarianceAlert?: unknown };
    const update: Record<string, unknown> = { paymentMethods: methods };
    if (reg.registerOpeningFloat !== undefined) {
      const f = Number(reg.registerOpeningFloat);
      if (!Number.isFinite(f) || f < 0) return bad("Opening float must be zero or more.");
      update.registerOpeningFloat = Math.round(f * 100) / 100;
    }
    if (reg.registerVarianceAlert !== undefined) {
      const v = Number(reg.registerVarianceAlert);
      if (!Number.isFinite(v) || v < 0) return bad("Variance alert must be zero or more.");
      update.registerVarianceAlert = Math.round(v * 100) / 100;
    }

    await (await getSettingsCollection()).updateOne(
      { _id: "settings" },
      { $set: update },
      { upsert: true }
    );
    return NextResponse.json({ ok: true, paymentMethods: methods });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}

/** Updates the store profile. Requires an Administrator. */
export async function PUT(request: Request) {
  try {
    await ensureSeeded();
    await requireCapability(request, "settings.manage");
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
