import { NextResponse } from "next/server";
import { ensureSeeded, getSuppliersCollection } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function GET() {
  try {
    await ensureSeeded();
    const suppliers = await getSuppliersCollection();
    const docs = await suppliers.find().sort({ name: 1 }).toArray();
    return NextResponse.json(docs.map(({ _id, ...s }) => s));
  } catch {
    return NextResponse.json({ error: "Database offline." }, { status: 503 });
  }
}

/** Create a supplier. Names are unique (the balance join is by name). */
export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const body = await request.json() as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    if (!name) return bad("Supplier name is required.");
    if (name.length > 80) return bad("Supplier name is too long (max 80).");

    const suppliers = await getSuppliersCollection();
    if (await suppliers.findOne({ name })) return bad(`Supplier "${name}" already exists.`, 409);

    // Keep ids monotonic even after deletes.
    const last = await suppliers.find({ id: /^SUP-/ }).sort({ id: -1 }).limit(1).next();
    const n = last ? parseInt(last.id.slice(4), 10) + 1 : 1;
    const now = new Date().toISOString();
    const supplier = {
      id: `SUP-${String(n).padStart(4, "0")}`,
      name,
      phone: String(body.phone ?? "").slice(0, 40),
      email: String(body.email ?? "").slice(0, 120),
      address: String(body.address ?? "").slice(0, 200),
      group: String(body.group ?? "Default").trim().slice(0, 40) || "Default",
      note: String(body.note ?? "").slice(0, 200),
      createdBy: request.headers.get("x-staff-name") ?? "system",
      createdAt: now,
      updatedAt: now,
    };
    await suppliers.insertOne({ ...supplier, _id: supplier.id });
    return NextResponse.json(supplier, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not create supplier." }, { status: 500 });
  }
}
