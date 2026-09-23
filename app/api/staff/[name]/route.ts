import { NextResponse } from "next/server";
import { requireStaff, ensureSeeded, getStaffCollection, type StaffMember, type StaffRole } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const ROLES: StaffRole[] = ["Administrator", "Manager", "Cashier"];
const PERMS = ["Full access", "POS + inventory", "POS access"];

/** Update role/permissions/status (and optionally the PIN) for one staff member. Requires an Administrator. */
export async function PATCH(request: Request, { params }: { params: { name: string } }) {
  try {
    await ensureSeeded();
    await requireStaff(request, "Administrator");

    const name = decodeURIComponent(params.name);
    const body = (await request.json()) as Partial<{ role: string; permissions: string; status: string; pin: string }>;
    const update: Partial<StaffMember> & { pin?: string } = {};
    if (body.role !== undefined) {
      if (!ROLES.includes(body.role as StaffRole)) return bad(`Role must be one of: ${ROLES.join(", ")}.`);
      update.role = body.role as StaffRole;
    }
    if (body.permissions !== undefined) {
      if (!PERMS.includes(body.permissions)) return bad(`Permissions must be one of: ${PERMS.join(", ")}.`);
      update.permissions = body.permissions;
    }
    if (body.status !== undefined) {
      if (body.status !== "Active" && body.status !== "Inactive") return bad("Status must be Active or Inactive.");
      update.status = body.status;
    }
    if (body.pin !== undefined) {
      if (!/^\d{4,6}$/.test(String(body.pin))) return bad("PIN must be 4–6 digits.");
      update.pin = String(body.pin);
    }
    if (Object.keys(update).length === 0) return bad("Nothing to update — send role, permissions, status, and/or pin.");

    const result = await (await getStaffCollection()).updateOne({ _id: name }, { $set: update });
    if (result.matchedCount === 0) return bad(`Staff member "${name}" not found.`, 404);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    return bad(String(e), 503);
  }
}

/** Removes a staff member. Requires an Administrator. */
export async function DELETE(request: Request, { params }: { params: { name: string } }) {
  try {
    await ensureSeeded();
    await requireStaff(request, "Administrator");
    const name = decodeURIComponent(params.name);
    const result = await (await getStaffCollection()).deleteOne({ _id: name });
    if (result.deletedCount === 0) return bad(`Staff member "${name}" not found.`, 404);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    return bad(String(e), 503);
  }
}
