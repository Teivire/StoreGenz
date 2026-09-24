import { NextResponse } from "next/server";
import { backfillCreatedAt, ensureSeeded, getProductsCollection, getSalesCollection, normalizeLegacySales, requireStaff, type Sale, type SaleLine, type SaleStatus } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function GET() {
  try {
    await ensureSeeded();
    await backfillCreatedAt();
    await normalizeLegacySales();
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
    const servedBy = await requireStaff(request, "Cashier");
    const body = await request.json() as { lines?: Partial<SaleLine>[]; customer?: string; payment?: string; amountPaid?: number; discount?: number };
    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    if (rawLines.length === 0) return bad("A sale needs at least one line item.");

    const customer = String(body.customer ?? "").trim() || "Walk-in customer";
    if (customer.length > 80) return bad("Customer name is too long (max 80 characters).");
    const payment = String(body.payment ?? "Cash").trim();
    if (!/^(Cash|ABA Pay|Credit)$/.test(payment)) return bad("Payment must be Cash, ABA Pay, or Credit.");
    const amountPaid = body.amountPaid === undefined ? undefined : Number(body.amountPaid);
    if (amountPaid !== undefined && (!Number.isFinite(amountPaid) || amountPaid < 0)) return bad("Amount paid must be a non-negative number.");

    const products = await getProductsCollection();
    const sales = await getSalesCollection();
    const newest = await sales.find().sort({ _id: -1 }).limit(1).toArray();
    const nextNum = newest.length ? parseInt(newest[0].id.slice(5), 10) + 1 : 1049;
    const sale: Sale & { createdAt: Date; saleTotal: number } = {
      id: `#INV-${nextNum}`,
      customer, date: "Just now", payment, status: "Paid" as SaleStatus,
      discount: 0, lines: [], createdAt: new Date(), servedBy, saleTotal: 0
    };
    for (const l of rawLines) {
      const sku = String(l.sku ?? "").toUpperCase();
      const qty = Number(l.qty);
      if (!Number.isInteger(qty) || qty <= 0) return bad("Each line needs a positive whole quantity.");
      const product = await products.findOne({ _id: sku });
      if (!product) return bad(`Unknown product ${sku}.`, 404);
      // Cost is snapshotted at sale time — historical profit doesn't shift when the
      // catalog's cost is edited later.
      sale.lines.push({ name: product.name, sku: product.sku, price: product.price, cost: product.cost, qty });
    }

    // Everything money-related is derived from the same resolved prices — the client's
    // arithmetic is never trusted. Cash handling applies to Cash only: card/credit
    // tenders are always exact.
    const subtotal = sale.lines.reduce((sum, l) => sum + l.price * l.qty, 0);
    let discount = body.discount === undefined ? 0 : Math.round(Number(body.discount) * 100) / 100;
    if (!Number.isFinite(discount) || discount < 0) return bad("Discount must be zero or more.");
    if (discount > subtotal) discount = subtotal; // clamp at subtotal
    if (discount > 0 && subtotal - discount < 0.01) return bad(`Minimum charge is 0.01 after discount (subtotal ${subtotal.toFixed(2)}).`);
    sale.discount = discount;
    const saleTotal = sale.saleTotal = Math.round((subtotal - discount) * 100) / 100;

    if (payment === "Cash" && amountPaid !== undefined && amountPaid + 0.005 < saleTotal) return bad(`Amount paid is less than the total (${saleTotal.toFixed(2)}).`);
    if (payment !== "Cash" && amountPaid !== undefined) return bad("Amount paid only applies to Cash payments.");
    if (amountPaid !== undefined) {
      sale.amountPaid = Math.round(amountPaid * 100) / 100;
      sale.changeDue = Math.max(0, Math.round((amountPaid - saleTotal) * 100) / 100);
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
