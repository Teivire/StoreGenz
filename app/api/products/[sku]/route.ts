import { NextResponse } from "next/server";
import { requireCapability,  ensureSeeded, getProductsCollection, getMovementsCollection, type Product, type StoredProduct } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Partial update: edit fields and/or apply a stock delta (adjustment) for one product. */
export async function PATCH(request: Request, { params }: { params: { sku: string } }) {
  try {
    await ensureSeeded();
    // Capture the caller's name now — reused for the movement ledger entry below
    // so we don't make a second redundant DB round-trip for the same auth check.
    const callerName = await requireCapability(request, "inventory.manage");
    const sku = decodeURIComponent(params.sku).toUpperCase();
    const body = await request.json() as { price?: number; cost?: number; category?: string; name?: string; stock?: number; stockDelta?: number; image?: string | null };
    const products = await getProductsCollection();
    const existing = await products.findOne({ _id: sku });
    if (!existing) return bad(`Product ${sku} not found.`, 404);

    const update: Partial<Product> = {};
    let unsetImage = false;
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return bad("Product name cannot be empty.");
      update.name = name;
    }
    if (body.category !== undefined) {
      const category = String(body.category).trim();
      if (!category) return bad("Category cannot be empty.");
      update.category = category;
    }
    if (body.price !== undefined) {
      const price = Number(body.price);
      if (!Number.isFinite(price) || price <= 0) return bad("Price must be a positive number.");
      update.price = price;
    }
    if (body.cost !== undefined) {
      const cost = Number(body.cost);
      if (!Number.isFinite(cost) || cost < 0) return bad("Cost must be zero or more.");
      update.cost = cost;
    }
    if (body.stock !== undefined) {
      const stock = Number(body.stock);
      if (!Number.isInteger(stock) || stock < 0) return bad("Stock must be zero or more.");
      update.stock = stock;
    }
    if (body.stockDelta !== undefined) {
      const delta = Number(body.stockDelta);
      if (!Number.isInteger(delta)) return bad("Stock adjustment must be a whole number.");
      if (existing.stock + delta < 0) return bad(`Cannot remove ${-delta} units — only ${existing.stock} in stock.`);
      update.stock = existing.stock + delta;
    }
    if (body.image !== undefined) {
      const image = typeof body.image === "string" ? body.image : "";
      if (image) {
        // Only allow raster formats. SVG data URLs can contain embedded scripts
        // and execute them in some browsers when set as an <img src>, so they are
        // explicitly rejected regardless of size.
        const allowed = ["data:image/png;", "data:image/jpeg;", "data:image/webp;", "data:image/gif;"];
        if (!allowed.some(prefix => image.startsWith(prefix))) return bad("Image must be a PNG, JPEG, WebP, or GIF data URL.");
        if (image.length > 60_000) return bad("Image data URL must be under 60KB.");
        update.image = image;
      } else {
        unsetImage = true;
      }
    }
    if (Object.keys(update).length === 0 && !unsetImage) return bad("Nothing to update.");

    await products.updateOne({ _id: sku }, {
      ...(Object.keys(update).length ? { $set: update } : {}),
      ...(unsetImage ? { $unset: { image: "" } } : {})
    });

    // Ledger: record manual stock deltas so Stock Movement has a real history.
    if (body.stockDelta !== undefined && Number(body.stockDelta) !== 0) {
      await getMovementsCollection().then(m => m.insertOne({
        _id: `${sku}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        sku, productName: update.name ?? existing.name,
        delta: Number(body.stockDelta),
        reason: "adjustment",
        note: typeof (body as { note?: string }).note === "string" ? (body as { note?: string }).note!.slice(0, 200) : "",
        by: callerName, refId: "",
        createdAt: new Date().toISOString(),
      }));
    }
    const updated = await products.findOne({ _id: sku }) as StoredProduct;
    const { _id, ...product } = updated;
    return NextResponse.json(product);
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}

export async function DELETE(request: Request, { params }: { params: { sku: string } }) {
  try {
    await ensureSeeded();
    await requireCapability(request, "inventory.manage");
    const sku = decodeURIComponent(params.sku).toUpperCase();
    const products = await getProductsCollection();
    const result = await products.deleteOne({ _id: sku });
    if (result.deletedCount === 0) return bad(`Product ${sku} not found.`, 404);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}
