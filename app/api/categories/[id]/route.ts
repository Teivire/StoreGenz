import { NextResponse } from "next/server";
import { requireCapability, ensureSeeded, getCategoriesCollection, getProductsCollection,  type Category } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/**
 * PATCH: edit name/description/status/sortOrder/parentId.
 * - Renaming cascades to products so counts and filters stay consistent.
 * - Reparenting rejects cycles (a category cannot move under its own descendants).
 * DELETE: allowed only when the category has no products and no children.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await ensureSeeded();
    const by = await requireCapability(request, "inventory.manage");
    const id = decodeURIComponent(params.id);
    const cats = await getCategoriesCollection();
    const existing = await cats.findOne({ _id: id as string });
    if (!existing) return bad("Category not found.", 404);

    const body = await request.json() as {
      name?: string; parentId?: string | null; description?: string;
      status?: string; sortOrder?: number;
    };
    const update: Partial<Category> = {};
    let cascadeName: string | null = null;

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return bad("Category name cannot be empty.");
      if (name.length > 60) return bad("Category name is too long (max 60).");
      const dup = await cats.findOne({ _id: { $ne: id }, name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } });
      if (dup) return bad(`Category "${name}" already exists.`, 409);
      update.name = name;
      if (name !== existing.name) cascadeName = name;
    }
    if (body.description !== undefined) update.description = String(body.description).trim();
    if (body.status !== undefined) {
      if (body.status !== "Active" && body.status !== "Inactive") return bad("Status must be Active or Inactive.");
      update.status = body.status;
    }
    if (body.sortOrder !== undefined) {
      const n = Number(body.sortOrder);
      if (!Number.isFinite(n)) return bad("Sort order must be a number.");
      update.sortOrder = Math.trunc(n);
    }
    if (body.parentId !== undefined) {
      const parentId = body.parentId ? String(body.parentId) : null;
      if (parentId === id) return bad("A category cannot be its own parent.");
      if (parentId) {
        const parent = await cats.findOne({ _id: parentId });
        if (!parent) return bad("Parent category not found.", 404);
        // Walk up from the proposed parent; reaching this category means a cycle.
        let cursor: string | null = parentId;
        const seen = new Set<string>();
        while (cursor) {
          if (cursor === id) return bad("Cannot move a category under its own subcategory.", 400);
          if (seen.has(cursor)) break;
          seen.add(cursor);
          cursor = (await cats.findOne({ _id: cursor }))?.parentId ?? null;
        }
      }
      update.parentId = parentId;
    }
    if (Object.keys(update).length === 0) return bad("Nothing to update.");

    const now = new Date().toISOString();
    await cats.updateOne({ _id: id }, { $set: { ...update, updatedAt: now, ...(cascadeName ? {} : {}) } });
    if (cascadeName) {
      await getProductsCollection().then(c => c.updateMany({ category: existing.name }, { $set: { category: cascadeName } }));
      // Keep children's parent pointers pointing at the same logical node.
      await cats.updateMany({ parentId: id }, { $set: { updatedAt: now } });
    }
    const fresh = await cats.findOne({ _id: id });
    return NextResponse.json({ ...fresh, updatedBy: by });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status) return bad((e as Error).message, status);
    return bad("Could not update the category.", 500);
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    await ensureSeeded();
    await requireCapability(request, "inventory.manage");
    const id = decodeURIComponent(params.id);
    const cats = await getCategoriesCollection();
    const existing = await cats.findOne({ _id: id as string });
    if (!existing) return bad("Category not found.", 404);
    const products = await getProductsCollection();
    const inUse = await products.countDocuments({ category: existing.name });
    if (inUse > 0) return bad(`Cannot delete — ${inUse} product${inUse === 1 ? "" : "s"} still use this category.`, 409);
    const childCount = await cats.countDocuments({ parentId: id });
    if (childCount > 0) return bad(`Cannot delete — ${childCount} subcategor${childCount === 1 ? "y" : "ies"} still under it.`, 409);
    await cats.deleteOne({ _id: id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status) return bad((e as Error).message, status);
    return bad("Could not delete the category.", 500);
  }
}
