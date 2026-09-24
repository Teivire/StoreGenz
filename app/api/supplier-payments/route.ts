import { NextResponse } from "next/server";
import {
  ensureSeeded, getSuppliersCollection, getPurchasesCollection,
  getSupplierPaymentsCollection, requireStaff,
} from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/**
 * Aggregated per-supplier statement: ordered value (non-returned POs) vs payments
 * made. Balance > 0 means the store still owes the supplier. Supplied by the API
 * so the Purchases and Reports hubs read one consistent computation.
 */
export async function GET() {
  try {
    await ensureSeeded();
    const [suppliers, purchases, payments] = await Promise.all([
      getSuppliersCollection(), getPurchasesCollection(), getSupplierPaymentsCollection(),
    ]);
    const [supplierDocs, poDocs, payDocs] = await Promise.all([
      suppliers.find().sort({ name: 1 }).toArray(),
      purchases.find().toArray(),
      payments.find().sort({ date: -1 }).toArray(),
    ]);

    const orderedBy = new Map<string, number>();
    for (const po of poDocs) {
      if (po.status === "Returned") continue;
      const total = po.lines.reduce((n, l) => n + l.qty * l.cost, 0);
      orderedBy.set(po.supplier, (orderedBy.get(po.supplier) ?? 0) + total);
    }

    const statements = supplierDocs.map(s => {
      const paid = payDocs.filter(p => p.supplierId === s.id || p.supplierName === s.name)
        .reduce((n, p) => n + p.amount, 0);
      const ordered = orderedBy.get(s.name) ?? 0;
      return {
        id: s.id, name: s.name, group: s.group, phone: s.phone, email: s.email,
        ordered, paid, balance: Math.round((ordered - paid) * 100) / 100,
        lastActivity: [
          ...poDocs.filter(p => p.supplier === s.name).map(p => p.createdAt),
          ...payDocs.filter(p => p.supplierId === s.id).map(p => p.date),
        ].sort().at(-1) ?? s.createdAt,
      };
    });

    // Suppliers seen on POs but not yet in the directory (name-only records).
    const known = new Set(supplierDocs.map(s => s.name));
    const orphanNames = Array.from(new Set(poDocs.map(p => p.supplier))).filter(n => n && !known.has(n));
    return NextResponse.json({ statements, orphans: orphanNames });
  } catch {
    return NextResponse.json({ error: "Database offline." }, { status: 503 });
  }
}

/** Record a payment to a supplier. Manager+ only — this is money out the door. */
export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const by = await requireStaff(request, "Manager");
    const body = await request.json() as Record<string, unknown>;
    const supplierId = String(body.supplierId ?? "").trim();
    const amount = Math.round(Number(body.amount) * 100) / 100;
    const method = String(body.method ?? "Cash").trim() || "Cash";
    if (!supplierId) return bad("Choose a supplier.");
    if (!Number.isFinite(amount) || amount < 0.01) return bad("Amount must be at least 0.01.");
    if (amount > 1_000_000) return bad("Amount looks too large.");

    const suppliers = await getSuppliersCollection();
    const supplier = await suppliers.findOne({ id: supplierId });
    if (!supplier) return bad("Supplier not found.", 404);

    const payments = await getSupplierPaymentsCollection();
    const last = await payments.find({ id: /^SPP-/ }).sort({ id: -1 }).limit(1).next();
    const n = last ? parseInt(last.id.slice(4), 10) + 1 : 1;
    const now = new Date().toISOString();
    const payment = {
      id: `SPP-${String(n).padStart(4, "0")}`,
      supplierId: supplier.id,
      supplierName: supplier.name,
      date: now,
      amount,
      method: method.slice(0, 40),
      note: String(body.note ?? "").slice(0, 200),
      createdBy: by,
      createdAt: now,
    };
    await payments.insertOne({ ...payment, _id: payment.id });
    return NextResponse.json(payment, { status: 201 });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return NextResponse.json({ error: (e as Error).message ?? "Could not record payment." }, { status });
  }
}
