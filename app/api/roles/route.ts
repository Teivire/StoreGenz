import { NextResponse } from "next/server";
import { ensureSeeded, requireCapability, getRolesCollection, logActivity, CAPABILITIES, type Capability } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Role list (public read — the login screen and client capability map need it). */
export async function GET() {
  try {
    await ensureSeeded();
    const docs = await (await getRolesCollection()).find().sort({ system: -1, name: 1 }).toArray();
    return NextResponse.json(docs.map(({ _id, ...r }) => r));
  } catch {
    return NextResponse.json({ error: "Database offline." }, { status: 503 });
  }
}

/** Creates a custom role. Requires the staff.manage capability. */
export async function POST(request: Request) {
  try {
    const by = await requireCapability(request, "staff.manage");
    await ensureSeeded();
    const body = (await request.json()) as Partial<{ name: string; description: string; capabilities: string[] }>;
    const name = String(body.name ?? "").trim();
    const description = String(body.description ?? "").slice(0, 300);
    const capabilities = Array.isArray(body.capabilities)
      ? Array.from(new Set(body.capabilities.map(c => String(c))))
      : [];
    if (!name) return bad("Role name is required.");
    if (name.length > 60) return bad("Role name is too long (max 60).");
    const invalid = capabilities.filter(c => !(CAPABILITIES as readonly string[]).includes(c));
    if (invalid.length) return bad(`Unknown capabilit${invalid.length === 1 ? "y" : "ies"}: ${invalid.join(", ")}.`);

    const roles = await getRolesCollection();
    const id = slug(name);
    if (!id) return bad("Role name must contain letters or numbers.");
    if (await roles.findOne({ _id: id })) return bad(`A role with this name already exists.`, 409);
    if (await roles.findOne({ name })) return bad(`A role named "${name}" already exists.`, 409);

    const now = new Date().toISOString();
    const doc = { id, name, description, capabilities: capabilities as Capability[], system: false, createdBy: by, createdAt: now, updatedAt: now };
    await roles.insertOne({ ...doc, _id: id });
    await logActivity("role.create", `${name} (${capabilities.length} capabilities)`, by);
    return NextResponse.json(doc, { status: 201 });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    return bad(String(e), 503);
  }
}
