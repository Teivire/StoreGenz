import { NextResponse } from "next/server";
import { requireCapability, ensureSeeded, getCategoriesCollection, getProductsCollection,  type Category } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

const slugify = (name: string) =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `cat-${Date.now()}`;

/** GET: all categories (sorted), each annotated with its live product count. */
export async function GET() {
  try {
    await ensureSeeded();
    const [cats, products] = await Promise.all([getCategoriesCollection(), getProductsCollection()]);
    const docs = await cats.find().sort({ sortOrder: 1, name: 1 }).toArray();
    const counts = await products.aggregate([{ $group: { _id: "$category", n: { $sum: 1 } } }]).toArray();
    const byName = new Map(counts.map(c => [c._id as string, c.n]));
    return NextResponse.json(docs.map(c => ({ ...c, productCount: byName.get(c.name) ?? 0 })));
  } catch {
    return NextResponse.json({ error: "Database offline" }, { status: 503 });
  }
}

/** POST: create a category. Name unique, parent must exist, no self/descendant parents. */
export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const by = await requireCapability(request, "inventory.manage");
    const body = await request.json() as {
      name?: string; parentId?: string | null; description?: string;
      status?: string; sortOrder?: number;
    };
    const name = String(body.name ?? "").trim();
    if (!name) return bad("Category name is required.");
    if (name.length > 60) return bad("Category name is too long (max 60).");

    const cats = await getCategoriesCollection();
    if (await cats.findOne({ name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } }))
      return bad(`Category "${name}" already exists.`, 409);

    const parentId = body.parentId ? String(body.parentId) : null;
    if (parentId && !(await cats.findOne({ _id: parentId }))) return bad("Parent category not found.", 404);

    const status = body.status === "Inactive" ? "Inactive" : "Active";
    const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Math.trunc(Number(body.sortOrder)) : 0;
    const now = new Date().toISOString();
    let id = slugify(name);
    while (await cats.findOne({ _id: id })) id = `${id}-${Date.now().toString(36).slice(-4)}`;

    const doc: Category = { id, name, parentId, description: String(body.description ?? "").trim(), status, sortOrder, createdBy: by, createdAt: now, updatedAt: now };
    await cats.insertOne({ ...doc, _id: id });
    return NextResponse.json({ ...doc, productCount: 0 }, { status: 201 });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status) return bad((e as Error).message, status);
    return bad("Could not create the category.", 500);
  }
}
