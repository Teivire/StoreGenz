import { NextResponse } from "next/server";
import { requireCapability, ensureSeeded, getSuppliersCollection, requireStaff } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Update a supplier (managers+). Name must stay unique. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireCapability(request, "suppliers.manage");
    await ensureSeeded();
    const id = decodeURIComponent(params.id);
    const body = await request.json() as Record<string, unknown>;
    const suppliers = await getSuppliersCollection();
    const existing = await suppliers.findOne({ id });
    if (!existing) return bad("Supplier not found.", 404);

    const update: Record<string, string> = { updatedAt: new Date().toISOString() };
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return bad("Supplier name is required.");
      if (name.length > 80) return bad("Supplier name is too long (max 80).");
      const clash = await suppliers.findOne({ name, id: { $ne: id } });
      if (clash) return bad(`Supplier "${name}" already exists.`, 409);
      update.name = name;
    }
    for (const field of ["phone", "email", "address", "group", "note"] as const) {
      if (body[field] !== undefined) update[field] = String(body[field]).slice(0, field === "address" || field === "note" ? 200 : 120);
    }
    await suppliers.updateOne({ id }, { $set: update });
    const { _id, ...rest } = (await suppliers.findOne({ id }))!;
    return NextResponse.json(rest);
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return NextResponse.json({ error: (e as Error).message ?? "Could not update supplier." }, { status });
  }
}

/** Delete a supplier (managers+). Blocked while purchase orders still reference the name. */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireCapability(request, "suppliers.manage");
    await ensureSeeded();
    const id = decodeURIComponent(params.id);
    const suppliers = await getSuppliersCollection();
    const existing = await suppliers.findOne({ id });
    if (!existing) return bad("Supplier not found.", 404);
    const { getPurchasesCollection } = await import("@/lib/db");
    const poCount = await (await getPurchasesCollection()).countDocuments({ supplier: existing.name });
    if (poCount > 0) return bad(`Cannot delete — ${poCount} purchase order${poCount === 1 ? "" : "s"} reference this supplier.`, 409);
    await suppliers.deleteOne({ id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return NextResponse.json({ error: (e as Error).message ?? "Could not delete supplier." }, { status });
  }
}
