import { NextResponse } from "next/server";
import { requireStaff, ensureSeeded, getProductsCollection, type Product, type StoredProduct } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Partial update: edit fields and/or apply a stock delta (adjustment) for one product. */
export async function PATCH(request: Request, { params }: { params: { sku: string } }) {
  try {
    await ensureSeeded();
    await requireStaff(request, "Manager");
    const sku = decodeURIComponent(params.sku).toUpperCase();
    const body = await request.json() as { price?: number; category?: string; name?: string; stock?: number; stockDelta?: number; image?: string | null };
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
      if (image && (!image.startsWith("data:image/") || image.length > 60_000)) return bad("Image must be a data URL under 60KB.");
      if (image) update.image = image; else unsetImage = true;
    }
    if (Object.keys(update).length === 0 && !unsetImage) return bad("Nothing to update.");

    await products.updateOne({ _id: sku }, {
      ...(Object.keys(update).length ? { $set: update } : {}),
      ...(unsetImage ? { $unset: { image: "" } } : {})
    });
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
    await requireStaff(request, "Manager");
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
