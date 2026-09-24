import { NextResponse } from "next/server";
import { ensureSeeded, getExpensesCollection, requireStaff, logActivity } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

const EXPENSE_CATEGORIES = ["Rent", "Utilities", "Supplies", "Salaries", "Marketing", "Maintenance", "Transport", "Other"];

/** GET: expenses newest-first with optional ?category= and ?limit= (default 200, max 1000). */
export async function GET(request: Request) {
  try {
    await ensureSeeded();
    const { searchParams } = new URL(request.url);
    const category = (searchParams.get("category") ?? "").trim();
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "200", 10) || 200, 1), 1000);
    const filter: Record<string, unknown> = {};
    if (category) filter.category = category;
    const docs = await (await getExpensesCollection()).find(filter).sort({ date: -1, _id: -1 }).limit(limit).toArray();
    return NextResponse.json(docs.map(({ _id, ...e }) => e));
  } catch {
    return NextResponse.json({ error: "Database offline" }, { status: 503 });
  }
}

/** POST: record an expense (managers+). Amount must be positive; id is auto-assigned EXP-n. */
export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const by = await requireStaff(request, "Manager");
    const body = await request.json() as { category?: string; amount?: number; note?: string; date?: string };
    const category = EXPENSE_CATEGORIES.includes(String(body.category)) ? String(body.category) : "";
    if (!category) return bad(`Category must be one of: ${EXPENSE_CATEGORIES.join(", ")}.`);
    const amount = Math.round(Number(body.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) return bad("Amount must be a positive number.");
    const note = String(body.note ?? "").trim().slice(0, 200);
    const date = body.date ? new Date(body.date) : new Date();
    if (Number.isNaN(date.getTime())) return bad("Invalid date.");

    const expenses = await getExpensesCollection();
    const newest = await expenses.find().sort({ _id: -1 }).limit(1).toArray();
    const next = newest.length ? parseInt(newest[0].id.slice(4), 10) + 1 : 1;
    const doc = {
      id: `EXP-${next}`, date: date.toISOString(), category, amount, note, createdBy: by, createdAt: new Date().toISOString(),
    };
    await expenses.insertOne({ ...doc, _id: doc.id });
    void logActivity("expense.create", `${doc.id} — ${category} $${amount.toFixed(2)}${note ? ` (${note})` : ""}`, by);
    return NextResponse.json(doc, { status: 201 });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status) return bad((e as Error).message, status);
    return bad("Could not record the expense.", 500);
  }
}
