import { NextResponse } from "next/server";
import { requireStaff, ensureSeeded, getStaffCollection, getDepartmentsCollection, type StaffRole } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Staff list. PINs are stripped — the PIN never leaves the database. */
export async function GET() {
  try {
    await ensureSeeded();
    const docs = await (await getStaffCollection()).find().sort({ _id: 1 }).toArray();
    return NextResponse.json(docs.map(({ pin, ...m }) => m));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}

/** Creates a new staff account with a login PIN. Requires an Administrator. */
export async function POST(request: Request) {
  try {
    await ensureSeeded();
    await requireStaff(request, "Administrator");

    const body = (await request.json()) as Partial<{ name: string; role: string; permissions: string; pin: string; department: string }>;
    const name = String(body.name ?? "").trim();
    const role = String(body.role ?? "") as StaffRole;
    const permissions = String(body.permissions ?? "").trim();
    const pin = String(body.pin ?? "").trim();
    const department = String(body.department ?? "").trim();
    const ROLES: StaffRole[] = ["Administrator", "Manager", "Cashier"];
    const PERMS = ["Full access", "POS + inventory", "POS access"];
    if (!name) return bad("Staff name is required.");
    if (name.length > 80) return bad("Staff name is too long (max 80 characters).");
    if (!ROLES.includes(role)) return bad(`Role must be one of: ${ROLES.join(", ")}.`);
    if (!PERMS.includes(permissions)) return bad(`Permissions must be one of: ${PERMS.join(", ")}.`);
    if (!/^\d{4,6}$/.test(pin)) return bad("PIN must be 4–6 digits.");

    if (department) {
      if (department.length > 60) return bad("Department name is too long (max 60).");
      if (!(await (await getDepartmentsCollection()).findOne({ _id: slug(department) }))) return bad(`Unknown department "${department}" — create it in the Departments view first.`);
    }
    const staff = await getStaffCollection();
    if (await staff.findOne({ _id: name })) return bad(`Staff member "${name}" already exists.`, 409);
    await staff.insertOne({ _id: name, name, role, permissions, status: "Active", pin, ...(department ? { department } : {}) });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    return bad(String(e), 503);
  }
}
