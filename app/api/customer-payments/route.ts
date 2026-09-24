import { NextResponse } from "next/server";
import {
  ensureSeeded, requireStaff, getCustomersCollection, getSalesCollection,
  getCustomerPaymentsCollection,
} from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/**
 * Aggregated per-customer statement: credit sales (unpaid) vs payments received.
 * Balance > 0 means the customer still owes the store. Loyalty points are
 * returned alongside for the Customers → Loyalty/Points view.
 */
export async function GET() {
  try {
    await ensureSeeded();
    const [customers, sales, payments] = await Promise.all([
      getCustomersCollection(), getSalesCollection(), getCustomerPaymentsCollection(),
    ]);
    const [customerDocs, saleDocs, payDocs] = await Promise.all([
      customers.find().sort({ name: 1 }).toArray(),
      sales.find({}, { projection: { customer: 1, status: 1, payment: 1, saleTotal: 1, createdAt: 1 } }).toArray(),
      payments.find().sort({ date: -1 }).toArray(),
    ]);

    const creditBy = new Map<string, number>();
    const pointsBy = new Map<string, number>();
    const activityBy = new Map<string, string>();
    for (const s of saleDocs) {
      if (!s.customer) continue;
      const credited = s.payment === "Credit" && s.status !== "Refunded" && s.status !== "Paid";
      if (credited) creditBy.set(s.customer, (creditBy.get(s.customer) ?? 0) + (s.saleTotal ?? 0));
      if (s.status === "Paid") pointsBy.set(s.customer, (pointsBy.get(s.customer) ?? 0) + Math.floor(s.saleTotal ?? 0));
      const iso = s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt);
      const prev = activityBy.get(s.customer);
      if (!prev || iso > prev) activityBy.set(s.customer, iso);
    }

    const statements = customerDocs.map(c => {
      const paid = payDocs.filter(p => p.customerId === c.id || p.customerName === c.name)
        .reduce((n, p) => n + p.amount, 0);
      const owed = creditBy.get(c.name) ?? 0;
      // Live points = seeded/existing points + points from sales recorded after seeding.
      const points = Math.max(c.loyaltyPoints, pointsBy.get(c.name) ?? 0);
      return {
        id: c.id, name: c.name, group: c.group, phone: c.phone, email: c.email,
        loyaltyPoints: points,
        owed: Math.round(owed * 100) / 100,
        paid: Math.round(paid * 100) / 100,
        balance: Math.round((owed - paid) * 100) / 100,
        lastActivity: activityBy.get(c.name) ?? c.createdAt,
      };
    });

    // Customers seen on sales but not yet in the directory (name-only records).
    const known = new Set(customerDocs.map(c => c.name));
    const orphans = Array.from(new Set(saleDocs.map(s => s.customer)))
      .filter((n): n is string => !!n && n.trim().length > 0 && n !== "Walk-in customer" && !known.has(n));
    return NextResponse.json({ statements, orphans });
  } catch {
    return NextResponse.json({ error: "Database offline." }, { status: 503 });
  }
}

/** Record a customer payment (managers+): money received against credit purchases. */
export async function POST(request: Request) {
  try {
    const by = await requireStaff(request, "Manager");
    await ensureSeeded();
    const body = await request.json() as Record<string, unknown>;
    const customerId = String(body.customerId ?? "").trim();
    const amount = Math.round(Number(body.amount) * 100) / 100;
    const method = String(body.method ?? "Cash").trim() || "Cash";
    if (!customerId) return bad("Choose a customer.");
    if (!Number.isFinite(amount) || amount < 0.01) return bad("Amount must be at least 0.01.");
    if (amount > 1_000_000) return bad("Amount looks too large.");

    const customers = await getCustomersCollection();
    const customer = await customers.findOne({ id: customerId });
    if (!customer) return bad("Customer not found.", 404);

    const payments = await getCustomerPaymentsCollection();
    const last = await payments.find({ id: /^CSP-/ }).sort({ id: -1 }).limit(1).next();
    const n = last ? parseInt(last.id.slice(4), 10) + 1 : 1;
    const now = new Date().toISOString();
    const payment = {
      id: `CSP-${String(n).padStart(4, "0")}`,
      customerId: customer.id,
      customerName: customer.name,
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
