import { NextResponse } from "next/server";
import { ensureSeeded, requireCapability, getRolesCollection, getStaffCollection, logActivity, CAPABILITIES, type Capability, type StoredRole } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Updates a role's capabilities/description (and name for custom roles). Requires staff.manage. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const by = await requireCapability(request, "staff.manage");
    await ensureSeeded();
    const id = decodeURIComponent(params.id);
    const roles = await getRolesCollection();
    const existing = await roles.findOne({ _id: id });
    if (!existing) return bad("Role not found.", 404);

    const body = (await request.json()) as Partial<{ name: string; description: string; capabilities: string[] }>;
    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };

    if (body.capabilities !== undefined) {
      const capabilities = Array.isArray(body.capabilities) ? Array.from(new Set(body.capabilities.map(c => String(c)))) : [];
      const invalid = capabilities.filter(c => !(CAPABILITIES as readonly string[]).includes(c));
      if (invalid.length) return bad(`Unknown capabilit${invalid.length === 1 ? "y" : "ies"}: ${invalid.join(", ")}.`);
      update.capabilities = capabilities;
    }
    if (body.description !== undefined) update.description = String(body.description).slice(0, 300);

    let renamedTo: string | null = null;
    if (body.name !== undefined && body.name.trim() && body.name.trim() !== existing.name) {
      if (existing.system) return bad("System roles cannot be renamed — their ids are load-bearing. Edit the description or capabilities instead.");
      const name = body.name.trim();
      if (name.length > 60) return bad("Role name is too long (max 60).");
      const newId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      if (!newId) return bad("Role name must contain letters or numbers.");
      if (newId !== id && await roles.findOne({ _id: newId })) return bad("A role with this name already exists.", 409);
      if (await roles.findOne({ name, _id: { $ne: id } })) return bad(`A role named "${name}" already exists.`, 409);
      update.id = newId;
      update.name = name;
      renamedTo = name;
    }

    if (renamedTo && renamedTo !== existing.name) {
      // Renaming a custom role re-points every assigned staff member in one go.
      const newId = update.id as string;
      await roles.replaceOne({ _id: id }, { ...existing, ...update, _id: newId } as StoredRole);
      await (await getStaffCollection()).updateMany({ role: id }, { $set: { role: newId } });
      await logActivity("role.rename", `${existing.name} → ${renamedTo} (staff re-pointed)`, by);
      return NextResponse.json({ ok: true, id: newId, renamed: true });
    }
    await roles.updateOne({ _id: id }, { $set: update });
    if (body.capabilities !== undefined)
      await logActivity("role.update", `${existing.name} capabilities → ${(update.capabilities as string[]).length || "none"}`, by);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    return bad(String(e), 503);
  }
}

/** Deletes a custom role. System roles and roles still assigned to staff are protected. */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const by = await requireCapability(request, "staff.manage");
    await ensureSeeded();
    const id = decodeURIComponent(params.id);
    const roles = await getRolesCollection();
    const existing = await roles.findOne({ _id: id });
    if (!existing) return bad("Role not found.", 404);
    if (existing.system) return bad("System roles cannot be deleted.", 409);
    const assigned = await (await getStaffCollection()).countDocuments({ role: id });
    if (assigned > 0)
      return bad(`Cannot delete — ${assigned} staff member${assigned === 1 ? "" : "s"} still use this role. Reassign them first.`, 409);
    await roles.deleteOne({ _id: id });
    await logActivity("role.delete", `${existing.name} removed`, by);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    return bad(String(e), 503);
  }
}
