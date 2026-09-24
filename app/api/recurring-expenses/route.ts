import { NextResponse } from "next/server";
import { requireCapability, ensureSeeded,  getRecurringExpensesCollection, runDueRecurringExpenses } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function GET() {
  try {
    await ensureSeeded();
    const docs = await (await getRecurringExpensesCollection()).find().sort({ createdAt: -1 }).toArray();
    return NextResponse.json(docs.map(({ _id, ...r }) => r));
  } catch {
    return NextResponse.json({ error: "Database offline." }, { status: 503 });
  }
}

/** Create a recurring expense template (managers+). First generation is due at nextRun. */
export async function POST(request: Request) {
  try {
    const by = await requireCapability(request, "finance.manage");
    await ensureSeeded();
    const body = await request.json() as Record<string, unknown>;
    const category = String(body.category ?? "").trim();
    const amount = Math.round(Number(body.amount) * 100) / 100;
    const frequency = String(body.frequency ?? "monthly");
    const nextRun = String(body.nextRun ?? "").trim() || new Date().toISOString();
    if (!category) return bad("Category is required.");
    if (!Number.isFinite(amount) || amount < 0.01) return bad("Amount must be at least 0.01.");
    if (amount > 1_000_000) return bad("Amount looks too large.");
    if (frequency !== "weekly" && frequency !== "monthly") return bad("Frequency must be weekly or monthly.");
    if (Number.isNaN(new Date(nextRun).getTime())) return bad("Invalid start date.");

    const recurrings = await getRecurringExpensesCollection();
    const last = await recurrings.find({ id: /^REC-/ }).sort({ id: -1 }).limit(1).next();
    const n = last ? parseInt(last.id.slice(4), 10) + 1 : 1;
    const id = `REC-${String(n).padStart(4, "0")}`;
    const now = new Date().toISOString();
    const doc = {
      id,
      category: category.slice(0, 40),
      amount,
      frequency: frequency as "weekly" | "monthly",
      note: String(body.note ?? "").slice(0, 200),
      nextRun: new Date(nextRun).toISOString(),
      active: true,
      createdBy: by,
      createdAt: now,
    };
    await recurrings.insertOne({ ...doc, _id: id });
    return NextResponse.json(doc, { status: 201 });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return NextResponse.json({ error: (e as Error).message ?? "Could not create recurring expense." }, { status });
  }
}

/** Pause/resume or delete a template (managers+): { id, action: "pause" | "resume" | "delete" }. */
export async function PATCH(request: Request) {
  try {
    await requireCapability(request, "finance.manage");
    await ensureSeeded();
    const body = await request.json() as { id?: string; action?: string };
    const id = String(body.id ?? "").trim();
    const action = String(body.action ?? "").trim();
    if (!id || !["pause", "resume", "delete"].includes(action)) return bad("Provide an id and action (pause, resume, delete).");
    const recurrings = await getRecurringExpensesCollection();
    if (action === "delete") {
      const r = await recurrings.deleteOne({ id });
      if (!r.deletedCount) return bad("Recurring expense not found.", 404);
      return NextResponse.json({ ok: true, deleted: true });
    }
    const r = await recurrings.updateOne({ id }, { $set: { active: action === "resume" } });
    if (!r.matchedCount) return bad("Recurring expense not found.", 404);
    return NextResponse.json({ ok: true, active: action === "resume" });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return NextResponse.json({ error: (e as Error).message ?? "Could not update recurring expense." }, { status });
  }
}

/** Generates any due expenses now (also runs automatically on server boot). */
export async function PUT(request: Request) {
  try {
    await requireCapability(request, "finance.manage");
    const generated = await runDueRecurringExpenses();
    return NextResponse.json({ ok: true, generated });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return NextResponse.json({ error: (e as Error).message ?? "Could not run recurring expenses." }, { status });
  }
}
