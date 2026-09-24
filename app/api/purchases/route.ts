import { NextResponse } from "next/server";
import { requireCapability, ensureSeeded, getPurchasesCollection, getProductsCollection, getMovementsCollection,  type Purchase, type PurchaseStatus } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** GET: purchase orders newest-first. ?status= filters; each line annotated with cost snapshot. */
export async function GET(request: Request) {
  try {
    await ensureSeeded();
    const { searchParams } = new URL(request.url);
    const status = (searchParams.get("status") ?? "").trim() as PurchaseStatus | "";
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    const docs = await (await getPurchasesCollection()).find(filter).sort({ createdAt: -1, _id: -1 }).limit(500).toArray();
    return NextResponse.json(docs.map(({ _id, ...p }) => p));
  } catch {
    return NextResponse.json({ error: "Database offline" }, { status: 503 });
  }
}

/**
 * POST: create a purchase order (managers+). Lines validated against the catalog
 * (unknown SKUs rejected; qty/cost must be positive). Status starts Pending.
 */
export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const by = await requireCapability(request, "purchases.manage");
    const body = await request.json() as {
      supplier?: string; note?: string;
      lines?: { sku?: string; qty?: number; cost?: number }[];
    };
    const supplier = String(body.supplier ?? "").trim();
    if (!supplier) return bad("Supplier name is required.");
    if (supplier.length > 80) return bad("Supplier name is too long (max 80).");
    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    if (rawLines.length === 0) return bad("Add at least one line.");
    if (rawLines.length > 50) return bad("Too many lines (max 50).");

    const products = await getProductsCollection();
    const lines: Purchase["lines"] = [];
    const seen = new Set<string>();
    for (const l of rawLines) {
      const sku = String(l.sku ?? "").trim().toUpperCase();
      const qty = Number(l.qty);
      const cost = Math.round(Number(l.cost) * 100) / 100;
      if (!sku) return bad("Every line needs a product SKU.");
      if (seen.has(sku)) return bad(`Duplicate line for ${sku}.`);
      seen.add(sku);
      if (!Number.isInteger(qty) || qty <= 0) return bad(`Quantity for ${sku} must be a positive whole number.`);
      if (!Number.isFinite(cost) || cost < 0) return bad(`Cost for ${sku} must be zero or more.`);
      const p = await products.findOne({ _id: sku });
      if (!p) return bad(`Unknown product ${sku}.`, 404);
      lines.push({ sku, name: p.name, qty, cost });
    }

    const purchases = await getPurchasesCollection();
    const newest = await purchases.find().sort({ _id: -1 }).limit(1).toArray();
    const next = newest.length ? parseInt(newest[0].id.slice(3), 10) + 1 : 2049;
    const doc: Purchase = {
      id: `PO-${next}`, supplier,
      lines, status: "Pending",
      note: String(body.note ?? "").trim().slice(0, 200),
      createdBy: by, createdAt: new Date().toISOString(),
    };
    await purchases.insertOne({ ...doc, _id: doc.id });
    return NextResponse.json(doc, { status: 201 });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status) return bad((e as Error).message, status);
    return bad("Could not create the purchase order.", 500);
  }
}
