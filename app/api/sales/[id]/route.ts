import { NextResponse } from "next/server";
import { requireStaff, ensureSeeded, getProductsCollection, getSalesCollection } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Marks a sale refunded, with an optional reason. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await ensureSeeded();
    await requireStaff(request, "Cashier");
    const id = decodeURIComponent(params.id);
    const body = await request.json().catch(() => ({})) as { reason?: string };
    const sales = await getSalesCollection();
    const existing = await sales.findOne({ _id: id });
    if (!existing) return bad(`Sale ${id} not found.`, 404);

    const reason = String(body.reason ?? "").trim() || "No reason provided";
    // One-way transition: only the request that actually flips the status to
    // Refunded restocks, so concurrent/double refunds can never restock twice.
    const transition = await sales.updateOne(
      { _id: id, status: { $ne: "Refunded" } },
      { $set: { status: "Refunded", refundReason: reason } }
    );
    if (transition.matchedCount === 0) return bad(`Sale ${id} is already refunded.`, 409);

    // Restock: a refund returns the items to inventory, mirroring the sale-time decrement.
    if (existing.lines.length > 0) {
      await (await getProductsCollection()).bulkWrite(
        existing.lines.map(l => ({ updateOne: { filter: { _id: l.sku }, update: { $inc: { stock: l.qty } } } })),
        { ordered: false }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}
