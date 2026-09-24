import { NextResponse } from "next/server";
import { requireCapability, ensureSeeded, getSettingsCollection, readSettings, requireStaff } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

const POLICY_KEYS = ["taxEnabled", "taxRatePercent", "taxLabel", "taxInclusive", "allowNegativeStock", "lowStockThreshold", "maxDiscountPercent", "loyaltyEnabled", "loyaltyEarnRate", "loyaltyTiers"];

/**
 * Validates the policy groups (tax, POS & sales, loyalty) into a Mongo $set update.
 * Unknown keys are rejected so typos can never silently no-op. Returns an error
 * string on the first invalid field.
 */
function validatePolicy(s: Record<string, unknown>): { error?: string; update?: Record<string, unknown> } {
  const update: Record<string, unknown> = {};
  if (s.taxEnabled !== undefined) {
    if (typeof s.taxEnabled !== "boolean") return { error: "taxEnabled must be a boolean." };
    update.taxEnabled = s.taxEnabled;
  }
  if (s.taxRatePercent !== undefined) {
    const r = Number(s.taxRatePercent);
    if (!Number.isFinite(r) || r < 0 || r > 100) return { error: "taxRatePercent must be between 0 and 100." };
    update.taxRatePercent = Math.round(r * 100) / 100;
  }
  if (s.taxLabel !== undefined) {
    const l = String(s.taxLabel).trim();
    if (!l || l.length > 12) return { error: "taxLabel must be 1–12 characters." };
    update.taxLabel = l;
  }
  if (s.taxInclusive !== undefined) {
    if (typeof s.taxInclusive !== "boolean") return { error: "taxInclusive must be a boolean." };
    update.taxInclusive = s.taxInclusive;
  }
  if (update.taxEnabled === true && !(update.taxRatePercent ?? 0)) return { error: "Enable a non-zero taxRatePercent when taxEnabled is true (or send both)." };
  if (s.allowNegativeStock !== undefined) {
    if (typeof s.allowNegativeStock !== "boolean") return { error: "allowNegativeStock must be a boolean." };
    update.allowNegativeStock = s.allowNegativeStock;
  }
  if (s.lowStockThreshold !== undefined) {
    const t = Number(s.lowStockThreshold);
    if (!Number.isInteger(t) || t < 0 || t > 9999) return { error: "lowStockThreshold must be a whole number between 0 and 9999." };
    update.lowStockThreshold = t;
  }
  if (s.maxDiscountPercent !== undefined) {
    const d = Number(s.maxDiscountPercent);
    if (!Number.isFinite(d) || d < 0 || d > 100) return { error: "maxDiscountPercent must be between 0 and 100." };
    update.maxDiscountPercent = Math.round(d * 100) / 100;
  }
  if (s.loyaltyEnabled !== undefined) {
    if (typeof s.loyaltyEnabled !== "boolean") return { error: "loyaltyEnabled must be a boolean." };
    update.loyaltyEnabled = s.loyaltyEnabled;
  }
  if (s.loyaltyEarnRate !== undefined) {
    const e2 = Number(s.loyaltyEarnRate);
    if (!Number.isFinite(e2) || e2 < 0 || e2 > 1000) return { error: "loyaltyEarnRate must be between 0 and 1000." };
    update.loyaltyEarnRate = Math.round(e2 * 100) / 100;
  }
  if (s.loyaltyTiers !== undefined) {
    if (!Array.isArray(s.loyaltyTiers) || s.loyaltyTiers.length === 0) return { error: "loyaltyTiers must be a non-empty array." };
    const tiers: { name: string; min: number }[] = [];
    const seenT = new Set<string>();
    let lastMin = -1;
    for (const t of s.loyaltyTiers as { name?: unknown; min?: unknown }[]) {
      const name = String(t?.name ?? "").trim();
      const min = Number(t?.min);
      if (!name) return { error: "Every loyalty tier needs a name." };
      if (name.length > 30) return { error: "Loyalty tier names are limited to 30 characters." };
      const key = name.toLowerCase();
      if (seenT.has(key)) return { error: `Duplicate loyalty tier "${name}".` };
      if (!Number.isFinite(min) || min < 0) return { error: `Tier "${name}" needs a minimum of zero or more.` };
      seenT.add(key);
      if (min <= lastMin) return { error: "Loyalty tiers must have increasing minimums." };
      lastMin = min;
      tiers.push({ name, min: Math.floor(min) });
    }
    if (tiers[0].min !== 0) return { error: "The first loyalty tier must start at 0." };
    update.loyaltyTiers = tiers;
  }
  const unknownKeys = Object.keys(s).filter(k => !POLICY_KEYS.includes(k));
  if (unknownKeys.length) return { error: `Unknown settings key(s): ${unknownKeys.join(",")}.` };
  return { update };
}

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
 * Payment methods configuration: PATCH with the full enabled/disabled list, plus an
 * optional validated `settings` partial for the policy groups. Requires settings.manage.
 */
export async function PATCH(request: Request) {
  try {
    await ensureSeeded();
    await requireCapability(request, "settings.manage");
    const body = (await request.json()) as { paymentMethods?: unknown; settings?: Record<string, unknown> };
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

    // General policy groups (tax, POS & sales, loyalty) ride the same PATCH as a
    // validated `settings` partial.
    if (body.settings !== undefined) {
      if (typeof body.settings !== "object" || body.settings === null || Array.isArray(body.settings))
        return bad("settings must be an object.");
      const res = validatePolicy(body.settings);
      if (res.error) return bad(res.error);
      Object.assign(update, res.update);
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

/**
 * Store profile update (PUT with the full settings object, as the Settings UI saves).
 * Profile fields are set directly; any recognized policy fields in the body are
 * validated and persisted too, so the hub's group editors can save in one call.
 */
export async function PUT(request: Request) {
  try {
    await ensureSeeded();
    await requireCapability(request, "settings.manage");
    const body = (await request.json()) as Partial<{ name: string; location: string; receiptFooter: string; currency: string } & Record<string, unknown>>;
    // Omitted profile fields fall back to the current values, so a policy-only
    // save (Settings → Taxes/Discounts/Loyalty/POS & Sales) can't blank the store
    // name — and the store name itself can never be wiped by a partial body.
    const current = await readSettings();
    const name = String(body.name ?? current.name ?? "").trim();
    const location = String(body.location ?? current.location ?? "").trim();
    const receiptFooter = String(body.receiptFooter ?? current.receiptFooter ?? "").trim();
    const currency = String(body.currency ?? current.currency ?? "").trim();
    if (!name) return bad("Store name is required.");
    if (name.length > 60) return bad("Store name is too long (max 60 characters).");
    if (location.length > 80) return bad("Location is too long (max 80 characters).");
    if (receiptFooter.length > 120) return bad("Receipt footer is too long (max 120 characters).");
    if (!currency) return bad("Currency symbol is required.");
    if (currency.length > 4) return bad("Currency symbol is too long (max 4 characters).");

    const update: Record<string, unknown> = { name, location, receiptFooter, currency };
    const policyInput: Record<string, unknown> = {};
    for (const k of POLICY_KEYS) if (body[k] !== undefined) policyInput[k] = body[k];
    if (Object.keys(policyInput).length) {
      const res = validatePolicy(policyInput);
      if (res.error) return bad(res.error);
      Object.assign(update, res.update);
    }

    await (await getSettingsCollection()).updateOne(
      { _id: "settings" },
      { $set: update },
      { upsert: true }
    );
    return NextResponse.json({ ok: true, name, location, receiptFooter, currency, settings: await readSettings() });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    return bad(String(e), 503);
  }
}
