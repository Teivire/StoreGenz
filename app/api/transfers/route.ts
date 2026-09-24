import { NextResponse } from "next/server";
import {
  ensureSeeded, requireStaff, getProductsCollection, getMovementsCollection,
  getTransfersCollection, type StoredProduct,
} from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** GET: transfer history, newest first (?limit=, default 100, max 500). */
export async function GET(request: Request) {
  try {
    await ensureSeeded();
    const limit = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get("limit") ?? "100", 10) || 100, 1), 500);
    const docs = await (await getTransfersCollection()).find().sort({ createdAt: -1 }).limit(limit).toArray();
    return NextResponse.json(docs.map(({ _id, ...t }) => t));
  } catch {
    return NextResponse.json({ error: "Database offline." }, { status: 503 });
  }
}

/**
 * Record a stock transfer between two locations: writes the transfer record and
 * a paired ledger entry (transfer-out at the source, transfer-in at the target).
 * Total stock is unchanged by design — the units move, they do not appear or vanish.
 */
export async function POST(request: Request) {
  try {
    const by = await requireStaff(request, "Manager");
    await ensureSeeded();
    const body = await request.json() as Record<string, unknown>;
    const sku = String(body.sku ?? "").trim().toUpperCase();
    const qty = Number(body.qty);
    const from = String(body.from ?? "").trim();
    const to = String(body.to ?? "").trim();
    if (!sku) return bad("Choose a product.");
    if (!Number.isInteger(qty) || qty < 1) return bad("Quantity must be a whole number of at least 1.");
    if (!from || !to) return bad("Both source and destination locations are required.");
    if (from.toLowerCase() === to.toLowerCase()) return bad("Source and destination must be different.");

    const products = await getProductsCollection();
    const product = await products.findOne({ _id: sku }) as StoredProduct | null;
    if (!product) return bad("Product not found.", 404);
    if (product.stock < qty) return bad(`Only ${product.stock} unit${product.stock === 1 ? "" : "s"} in stock — cannot transfer ${qty}.`, 409);

    const transfers = await getTransfersCollection();
    const last = await transfers.find({ id: /^TRF-/ }).sort({ id: -1 }).limit(1).next();
    const n = last ? parseInt(last.id.slice(4), 10) + 1 : 1;
    const id = `TRF-${String(n).padStart(4, "0")}`;
    const now = new Date().toISOString();
    const note = String(body.note ?? "").slice(0, 200);

    await transfers.insertOne({
      _id: id, id, sku, productName: product.name, qty, from: from.slice(0, 80), to: to.slice(0, 80),
      note, by, createdAt: now,
    });

    // Paired ledger entries — one movement out, one in, both referencing the transfer.
    const movements = await getMovementsCollection();
    const stamp = Date.now();
    await movements.insertMany([
      {
        _id: `${sku}-${stamp}-${Math.random().toString(36).slice(2, 7)}`,
        sku, productName: product.name, delta: -qty, reason: "transfer-out" as const,
        note: `${from} → ${to}${note ? ` · ${note}` : ""}`, by, refId: id, createdAt: now,
      },
      {
        _id: `${sku}-${stamp + 1}-${Math.random().toString(36).slice(2, 7)}`,
        sku, productName: product.name, delta: qty, reason: "transfer-in" as const,
        note: `${from} → ${to}${note ? ` · ${note}` : ""}`, by, refId: id, createdAt: now,
      },
    ]);

    return NextResponse.json({ id, sku, productName: product.name, qty, from, to, note, by, createdAt: now }, { status: 201 });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return NextResponse.json({ error: (e as Error).message ?? "Could not record transfer." }, { status });
  }
}
