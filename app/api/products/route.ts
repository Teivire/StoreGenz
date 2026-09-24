import { NextResponse } from "next/server";
import { requireCapability,  ensureSeeded, getProductsCollection, type Product } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

/** Escapes regex special characters so user input is matched literally. */
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type ProductsQuery = {
  q?: string;
  category?: string;
  page?: string;
  limit?: string;
  all?: string;
};

/**
 * GET /api/products
 *   ?q=cola          — literal substring match on name/sku/category
 *   ?category=...    — exact category match
 *   ?page=1&limit=10 — paginated envelope { items, total, page, limit, pages }
 *   ?all=1           — legacy full list (array), for catalog-wide consumers
 */
export async function GET(request: Request) {
  try {
    await ensureSeeded();
    const { searchParams } = new URL(request.url);
    const query = Object.fromEntries(searchParams.entries()) as ProductsQuery;

    const filter: Record<string, unknown> = {};
    const q = (query.q ?? "").trim();
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ name: rx }, { sku: rx }, { category: rx }];
    }
    const category = (query.category ?? "").trim();
    if (category && category !== "All categories") filter.category = category;

    const products = await getProductsCollection();

    // Legacy mode: return every match as a plain array.
    if (query.all === "1" || query.all === "true") {
      const docs = await products.find(filter).sort({ _id: 1 }).toArray();
      return NextResponse.json(docs.map(({ _id, ...p }) => p));
    }

    // Sanitize paging params: positive integers with hard clamps.
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number.parseInt(query.limit ?? "", 10) || DEFAULT_PAGE_SIZE)
    );
    const total = await products.countDocuments(filter);
    const pages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(pages, Math.max(1, Number.parseInt(query.page ?? "", 10) || 1));

    const docs = await products
      .find(filter)
      .sort({ _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    return NextResponse.json({
      items: docs.map(({ _id, ...p }) => p),
      total,
      page,
      limit,
      pages,
      q: q || undefined,
      category: category || undefined
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureSeeded();
    await requireCapability(request, "inventory.manage");
    const body = await request.json() as Partial<Product>;
    const name = String(body.name ?? "").trim();
    const sku = String(body.sku ?? "").trim().toUpperCase();
    const category = String(body.category ?? "").trim();
    const price = Number(body.price);
    const cost = body.cost === undefined ? 0 : Number(body.cost);
    const stock = Number(body.stock);
    const image = typeof body.image === "string" ? body.image : "";
    if (!name) return bad("Product name is required.");
    if (!category) return bad("Category is required.");
    if (!Number.isFinite(price) || price <= 0) return bad("Price must be a positive number.");
    if (!Number.isFinite(cost) || cost < 0) return bad("Cost must be zero or more.");
    if (!Number.isInteger(stock) || stock < 0) return bad("Stock must be zero or more.");
    if (!sku) return bad("SKU is required.");
    if (image && (!image.startsWith("data:image/") || image.length > 60_000)) return bad("Image must be a data URL under 60KB.");

    const products = await getProductsCollection();
    if (await products.findOne({ _id: sku })) return bad(`SKU ${sku} is already used by another product.`, 409);
    const product: Product = image ? { name, sku, category, price, cost, stock, image } : { name, sku, category, price, cost, stock };
    await products.insertOne({ ...product, _id: sku });
    return NextResponse.json(product, { status: 201 });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}
