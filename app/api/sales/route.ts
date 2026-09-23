import { NextResponse } from "next/server";
import { backfillCreatedAt, ensureSeeded, getProductsCollection, getSalesCollection, requireStaff, type SaleLine, type SaleStatus } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function GET() {
  try {
    await ensureSeeded();
    await backfillCreatedAt();
    const sales = await getSalesCollection();
    const docs = await sales.find().sort({ _id: -1 }).toArray();
    return NextResponse.json(docs.map(({ _id, ...s }) => s));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const body = await request.json() as { lines?: Partial<SaleLine>[] };
    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    if (rawLines.length === 0) return bad("A sale needs at least one line item.");

    const products = await getProductsCollection();
    const sales = await getSalesCollection();
    const newest = await sales.find().sort({ _id: -1 }).limit(1).toArray();
    const nextNum = newest.length ? parseInt(newest[0].id.slice(5), 10) + 1 : 1049;
    const sale = { id: `#INV-${nextNum}`, customer: "Walk-in customer", date: "Just now", payment: "Cash", status: "Paid" as SaleStatus, lines: [] as SaleLine[], createdAt: new Date(), servedBy: await requireStaff(request, "Cashier") };

    // Resolve prices server-side from the catalog, then atomically decrement stock.
    // $gte: qty makes the decrement fail for any line that oversells; the bulkWrite
    // is ordered within a session so a sale either fully applies or throws.
    for (const l of rawLines) {
      const sku = String(l.sku ?? "").toUpperCase();
      const qty = Number(l.qty);
      if (!Number.isInteger(qty) || qty <= 0) return bad("Each line needs a positive whole quantity.");
      const product = await products.findOne({ _id: sku });
      if (!product) return bad(`Unknown product ${sku}.`, 404);
      sale.lines.push({ name: product.name, sku: product.sku, price: product.price, qty });
    }

    const decrements = sale.lines.map(l => ({
      updateOne: {
        filter: { _id: l.sku, stock: { $gte: l.qty } },
        update: { $inc: { stock: -l.qty } }
      }
    }));
    const result = await products.bulkWrite(decrements, { ordered: true });
    if (result.modifiedCount !== sale.lines.length) {
      // ordered bulkWrite stops at the first failed op, so exactly the first
      // `modifiedCount` lines were applied — revert them so the sale is all-or-nothing.
      const applied = sale.lines.slice(0, result.modifiedCount);
      if (applied.length > 0) {
        await products.bulkWrite(
          applied.map(l => ({ updateOne: { filter: { _id: l.sku }, update: { $inc: { stock: l.qty } } } })),
          { ordered: true }
        );
      }
      return bad("Not enough stock for one or more items.", 409);
    }

    // Concurrent checkouts can compute the same invoice number; on the resulting
    // duplicate-key error recompute the number and retry — the stock decrement
    // above belongs to THIS sale, so it is intentionally reused.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await sales.insertOne({ ...sale, _id: sale.id });
        return NextResponse.json(sale, { status: 201 });
      } catch (e) {
        const isDup = (e as { code?: number }).code === 11000;
        if (!isDup || attempt === 2) throw e;
        const newest2 = await sales.find().sort({ _id: -1 }).limit(1).toArray();
        const next2 = newest2.length ? parseInt(newest2[0].id.slice(5), 10) + 1 : 1049;
        sale.id = `#INV-${next2}`;
      }
    }
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}
