import { NextResponse } from "next/server";
import { ensureSeeded, getMovementsCollection } from "@/lib/db";

/**
 * GET /api/movements — the stock-movement ledger, newest first.
 *   ?sku=SKU-1     — one product's history
 *   ?reason=sale   — filter by kind (adjustment | sale | refund | transfer-in | transfer-out)
 *   ?limit=100     — cap (default 100, max 500)
 */
export async function GET(request: Request) {
  try {
    await ensureSeeded();
    const { searchParams } = new URL(request.url);
    const sku = (searchParams.get("sku") ?? "").trim().toUpperCase();
    const reason = (searchParams.get("reason") ?? "").trim();
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "100", 10) || 100, 1), 500);

    const filter: Record<string, unknown> = {};
    if (sku) filter.sku = sku;
    if (reason) filter.reason = reason;

    const docs = await (await getMovementsCollection())
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray();
    return NextResponse.json(docs.map(({ _id, ...m }) => m));
  } catch {
    return NextResponse.json({ error: "Database offline" }, { status: 503 });
  }
}
