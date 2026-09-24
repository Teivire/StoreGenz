import { NextResponse } from "next/server";
import { requireCapability, ensureSeeded,  getDepartmentsCollection, getStaffCollection } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function GET() {
  try {
    await ensureSeeded();
    const docs = await (await getDepartmentsCollection()).find().sort({ name: 1 }).toArray();
    return NextResponse.json(docs.map(({ _id, ...d }) => d));
  } catch {
    return NextResponse.json({ error: "Database offline." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const by = await requireCapability(request, "departments.manage");
    await ensureSeeded();
    const body = await request.json() as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    if (!name) return bad("Department name is required.");
    if (name.length > 60) return bad("Department name is too long (max 60).");
    const departments = await getDepartmentsCollection();
    const id = slug(name);
    if (!id) return bad("Department name must contain letters or numbers.");
    if (await departments.findOne({ _id: id })) return bad(`Department "${name}" already exists.`, 409);
    const doc = {
      _id: id, id, name,
      description: String(body.description ?? "").slice(0, 200),
      createdBy: by, createdAt: new Date().toISOString(),
    };
    await departments.insertOne(doc);
    const { _id, ...rest } = doc;
    return NextResponse.json(rest, { status: 201 });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return NextResponse.json({ error: (e as Error).message ?? "Could not create department." }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireCapability(request, "departments.manage");
    await ensureSeeded();
    const id = new URL(request.url).searchParams.get("id") ?? "";
    const departments = await getDepartmentsCollection();
    const existing = await departments.findOne({ _id: id });
    if (!existing) return bad("Department not found.", 404);
    const inUse = await (await getStaffCollection()).countDocuments({ department: existing.name });
    if (inUse > 0) return bad(`Cannot delete — ${inUse} staff member${inUse === 1 ? "" : "s"} belong to this department.`, 409);
    await departments.deleteOne({ _id: id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return NextResponse.json({ error: (e as Error).message ?? "Could not delete department." }, { status });
  }
}
