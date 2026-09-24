import { NextResponse } from "next/server";
import { requireCapability, ensureSeeded, getCustomersCollection, getSalesCollection, requireStaff } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Update a customer (managers+). Name must stay unique. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireCapability(request, "customers.manage");
    await ensureSeeded();
    const id = decodeURIComponent(params.id);
    const body = await request.json() as Record<string, unknown>;
    const customers = await getCustomersCollection();
    const existing = await customers.findOne({ id });
    if (!existing) return bad("Customer not found.", 404);

    const update: Record<string, string | number> = { updatedAt: new Date().toISOString() };
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return bad("Customer name is required.");
      if (name.length > 80) return bad("Customer name is too long (max 80).");
      const clash = await customers.findOne({ name, id: { $ne: id } });
      if (clash) return bad(`Customer "${name}" already exists.`, 409);
      update.name = name;
    }
    if (body.loyaltyPoints !== undefined) {
      const pts = Number(body.loyaltyPoints);
      if (!Number.isInteger(pts) || pts < 0) return bad("Loyalty points must be a whole number ≥ 0.");
      update.loyaltyPoints = pts;
    }
    for (const field of ["phone", "email", "address", "group", "note"] as const) {
      if (body[field] !== undefined) update[field] = String(body[field]).slice(0, field === "address" || field === "note" ? 200 : 120);
    }
    await customers.updateOne({ id }, { $set: update });
    const { _id, ...rest } = (await customers.findOne({ id }))!;
    return NextResponse.json(rest);
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return NextResponse.json({ error: (e as Error).message ?? "Could not update customer." }, { status });
  }
}

/** Delete a customer (managers+). Blocked while sales history references the name. */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireCapability(request, "customers.manage");
    await ensureSeeded();
    const id = decodeURIComponent(params.id);
    const customers = await getCustomersCollection();
    const existing = await customers.findOne({ id });
    if (!existing) return bad("Customer not found.", 404);
    const saleCount = await (await getSalesCollection()).countDocuments({ customer: existing.name });
    if (saleCount > 0) return bad(`Cannot delete — ${saleCount} sale${saleCount === 1 ? "" : "s"} reference this customer.`, 409);
    await customers.deleteOne({ id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return NextResponse.json({ error: (e as Error).message ?? "Could not delete customer." }, { status });
  }
}
