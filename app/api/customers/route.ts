import { NextResponse } from "next/server";
import { ensureSeeded, getCustomersCollection } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function GET() {
  try {
    await ensureSeeded();
    const docs = await (await getCustomersCollection()).find().sort({ name: 1 }).toArray();
    return NextResponse.json(docs.map(({ _id, ...c }) => c));
  } catch {
    return NextResponse.json({ error: "Database offline." }, { status: 503 });
  }
}

/** Create a customer. Names are unique (the statement join is by name). */
export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const body = await request.json() as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    if (!name) return bad("Customer name is required.");
    if (name.length > 80) return bad("Customer name is too long (max 80).");

    const customers = await getCustomersCollection();
    if (await customers.findOne({ name })) return bad(`Customer "${name}" already exists.`, 409);

    const last = await customers.find({ id: /^CUS-/ }).sort({ id: -1 }).limit(1).next();
    const n = last ? parseInt(last.id.slice(4), 10) + 1 : 1;
    const now = new Date().toISOString();
    const customer = {
      id: `CUS-${String(n).padStart(4, "0")}`,
      name,
      phone: String(body.phone ?? "").slice(0, 40),
      email: String(body.email ?? "").slice(0, 120),
      address: String(body.address ?? "").slice(0, 200),
      group: String(body.group ?? "Default").trim().slice(0, 40) || "Default",
      loyaltyPoints: 0,
      note: String(body.note ?? "").slice(0, 200),
      createdBy: request.headers.get("x-staff-name") ?? "system",
      createdAt: now,
      updatedAt: now,
    };
    await customers.insertOne({ ...customer, _id: customer.id });
    return NextResponse.json(customer, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not create customer." }, { status: 500 });
  }
}
