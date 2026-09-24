import { NextResponse } from "next/server";
import { requireCapability, ensureSeeded, getPurchasesCollection, getProductsCollection, getMovementsCollection, requireStaff } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/**
 * PATCH: transition a PO.
 *  - action "receive": Pending → Received. Increments product stock (and updates
 *    product cost to the PO's unit cost), writes `purchase` ledger entries.
 *  - action "return": Received → Returned. Reverses the received quantities
 *    (stock must still cover it), writes `purchase-return` entries.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await ensureSeeded();
    const by = await requireCapability(request, "purchases.manage");
    const id = decodeURIComponent(params.id);
    const body = await request.json() as { action?: string };
    const purchases = await getPurchasesCollection();
    const po = await purchases.findOne({ _id: id });
    if (!po) return bad("Purchase order not found.", 404);
    const action = body.action;

    if (action === "receive") {
      if (po.status !== "Pending") return bad(`Purchase order is ${po.status} — only Pending orders can be received.`, 409);
      const products = await getProductsCollection();
      // All-or-nothing is safe here: stock only grows, so no partial-failure risk.
      await products.bulkWrite(po.lines.map(l => ({
        updateOne: { filter: { _id: l.sku }, update: { $inc: { stock: l.qty }, $set: { cost: l.cost } } }
      })), { ordered: false });
      const now = new Date().toISOString();
      await purchases.updateOne({ _id: id, status: "Pending" }, { $set: { status: "Received", receivedAt: now } });
      await getMovementsCollection().then(m => m.insertMany(po.lines.map(l => ({
        _id: `po-${po.id}-${l.sku}`,
        sku: l.sku, productName: l.name, delta: l.qty,
        reason: "purchase" as const, note: `${po.supplier}${po.note ? ` — ${po.note}` : ""}`,
        by, refId: po.id, createdAt: now,
      })))).catch(() => {});
      return NextResponse.json({ ok: true, status: "Received" });
    }

    if (action === "return") {
      if (po.status !== "Received") return bad(`Purchase order is ${po.status} — only Received orders can be returned.`, 409);
      const products = await getProductsCollection();
      const current = await products.find({ _id: { $in: po.lines.map(l => l.sku) } }).toArray();
      const stock = new Map(current.map(p => [p._id, p.stock]));
      const short = po.lines.find(l => (stock.get(l.sku) ?? 0) < l.qty);
      if (short) return bad(`Cannot return — ${short.name} has only ${stock.get(short.sku) ?? 0} in stock (need ${short.qty}).`, 409);
      await products.bulkWrite(po.lines.map(l => ({
        updateOne: { filter: { _id: l.sku }, update: { $inc: { stock: -l.qty } } }
      })), { ordered: false });
      const now = new Date().toISOString();
      const transition = await purchases.updateOne({ _id: id, status: "Received" }, { $set: { status: "Returned", returnedAt: now } });
      if (transition.matchedCount === 0) return bad("Purchase order already returned.", 409);
      await getMovementsCollection().then(m => m.insertMany(po.lines.map(l => ({
        _id: `po-ret-${po.id}-${l.sku}`,
        sku: l.sku, productName: l.name, delta: -l.qty,
        reason: "purchase-return" as const, note: `Return to ${po.supplier}`,
        by, refId: po.id, createdAt: now,
      })))).catch(() => {});
      return NextResponse.json({ ok: true, status: "Returned" });
    }

    return bad("Action must be \"receive\" or \"return\".");
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status) return bad((e as Error).message, status);
    return bad("Could not update the purchase order.", 500);
  }
}
