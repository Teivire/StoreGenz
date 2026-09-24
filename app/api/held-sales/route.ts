import { NextResponse } from "next/server";
import { requireStaff, requireCapability, ensureSeeded, getHeldSalesCollection, logActivity, HeldSale, SaleLine } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Sanitizes one submitted cart line: clamps qty, keeps the snapshotted price so the held cart totals identically on resume. */
function sanitizeLine(raw: { sku?: unknown; name?: unknown; price?: unknown; qty?: unknown }): { ok: true; line: SaleLine } | { ok: false; error: string } {
  const sku = String(raw.sku ?? "").trim();
  const name = String(raw.name ?? "").trim() || sku;
  const price = Number(raw.price);
  const qty = Number(raw.qty);
  if (!sku) return { ok: false, error: "Each line needs a product." };
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: "Each line needs a valid price." };
  if (!Number.isInteger(qty) || qty <= 0 || qty > 9999) return { ok: false, error: "Each line needs a quantity between 1 and 9999." };
  return { ok: true, line: { sku, name, price: Math.round(price * 100) / 100, cost: 0, qty } };
}

const publicDoc = ({ _id, ...rest }: HeldSale & { _id: string }) => rest;

/** Lists held (suspended) sales, newest first (POS → Held / Suspended Sales). Any signed-in staff. */
export async function GET(request: Request) {
  try {
    await ensureSeeded();
    await requireStaff(request);
    const docs = await (await getHeldSalesCollection()).find().sort({ heldAt: -1 }).limit(200).toArray();
    return NextResponse.json(docs.map(publicDoc));
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}

/** Holds the current cart (POS → New Sale → Hold sale). Any signed-in staff — holding is part of selling. */
export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const by = await requireStaff(request);
    const body = (await request.json()) as { lines?: unknown; note?: unknown };
    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    if (rawLines.length === 0) return bad("Nothing to hold — the cart is empty.");
    if (rawLines.length > 100) return bad("Too many lines (max 100).");
    const lines: SaleLine[] = [];
    for (const raw of rawLines) {
      const res = sanitizeLine(raw as { sku?: unknown; name?: unknown; qty?: unknown });
      if (!res.ok) return bad(res.error);
      lines.push(res.line);
    }
    const held = await getHeldSalesCollection();
    const newest = await held.find().sort({ _id: -1 }).limit(1).toArray();
    const n = newest.length ? (Number.parseInt(newest[0].id.slice(2), 10) || 0) + 1 : 1;
    const doc: HeldSale & { _id: string } = {
      _id: `H-${String(n).padStart(3, "0")}`,
      id: `H-${String(n).padStart(3, "0")}`,
      lines,
      itemCount: lines.reduce((s, l) => s + l.qty, 0),
      heldBy: by,
      heldAt: new Date().toISOString(),
      ...(String(body.note ?? "").trim() ? { note: String(body.note).trim().slice(0, 140) } : {}),
    };
    await held.insertOne(doc);
    await logActivity("sale.hold", `${doc.id} — ${doc.itemCount} item(s) held by ${by}`, by);
    return NextResponse.json(publicDoc(doc), { status: 201 });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}

/** Resumes a held sale back into the active cart (stock was never deducted — no recheck needed). Any signed-in staff. */
export async function PUT(request: Request) {
  try {
    await ensureSeeded();
    const by = await requireStaff(request);
    const body = (await request.json()) as { id?: unknown };
    const id = String(body.id ?? "");
    const held = await getHeldSalesCollection();
    const doc = await held.findOne({ id });
    if (!doc) return bad(`Held sale ${id || "(none)"} not found.`, 404);
    await held.deleteOne({ _id: doc._id });
    await logActivity("sale.resume", `${doc.id} — ${doc.itemCount} item(s) resumed by ${by}`, by);
    return NextResponse.json({ id: doc.id, lines: doc.lines, itemCount: doc.itemCount });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}

/** Discards a held sale without resuming it. Any signed-in staff — the held cart was never a real sale. */
export async function DELETE(request: Request) {
  try {
    await ensureSeeded();
    const by = await requireStaff(request);
    const id = new URL(request.url).searchParams.get("id") ?? "";
    const held = await getHeldSalesCollection();
    const doc = await held.findOne({ id });
    if (!doc) return bad(`Held sale ${id || "(none)"} not found.`, 404);
    await held.deleteOne({ _id: doc._id });
    await logActivity("sale.discard", `${doc.id} — ${doc.itemCount} item(s) discarded by ${by}`, by);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}
