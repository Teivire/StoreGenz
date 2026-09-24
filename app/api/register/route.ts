import { NextResponse } from "next/server";
import {
  ensureSeeded, requireStaff, getRegisterShiftsCollection, getCashMovementsCollection,
  getSalesCollection, readSettings, type StoredSale,
} from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const money2 = (n: number) => Math.round(n * 100) / 100;

/** Server-side truth: expected drawer cash for a shift, recomputed from the ledger. */
function expectedCash(
  shift: { openingFloat: number; openedAt: string; closedAt?: string },
  sales: StoredSale[],
  movements: { direction: "in" | "out"; amount: number }[],
): number {
  const endIso = shift.closedAt ?? new Date().toISOString();
  // Every cash sale put money INTO the drawer at sale time (regardless of later
  // refund — the refund is subtracted separately, at refund time).
  const cashSales = sales.filter(s => s.payment === "Cash" && iso(s.createdAt) >= shift.openedAt && iso(s.createdAt) <= endIso)
    .reduce((n, s) => n + (s.saleTotal ?? 0), 0);
  // A refund takes cash OUT of the drawer at refund time — even if it refunds a
  // sale made before the shift opened. Date by refundedAt when present.
  const cashRefunds = sales.filter(s => s.payment === "Cash" && s.status === "Refunded" && iso(s.refundedAt ?? s.createdAt) >= shift.openedAt && iso(s.refundedAt ?? s.createdAt) <= endIso)
    .reduce((n, s) => n + (s.saleTotal ?? 0), 0);
  const movedIn = movements.filter(m => m.direction === "in").reduce((n, m) => n + m.amount, 0);
  const movedOut = movements.filter(m => m.direction === "out").reduce((n, m) => n + m.amount, 0);
  return money2(shift.openingFloat + cashSales - cashRefunds + movedIn - movedOut);
}

const iso = (d: Date | string | undefined): string =>
  d instanceof Date ? d.toISOString() : String(d ?? "");

/** GET: current open shift (with live expected cash + movements) and close history. */
export async function GET() {
  try {
    await ensureSeeded();
    const [shifts, movements, sales, settings] = await Promise.all([
      getRegisterShiftsCollection(), getCashMovementsCollection(), getSalesCollection(), readSettings(),
    ]);
    const [shiftDocs, saleDocs] = await Promise.all([
      shifts.find().sort({ openedAt: -1 }).limit(200).toArray(),
      sales.find({}, { projection: { payment: 1, status: 1, saleTotal: 1, createdAt: 1, refundedAt: 1 } }).toArray(),
    ]);
    const movementDocs = await movements.find().sort({ createdAt: -1 }).toArray();
    const open = shiftDocs.find(s => !s.closedAt) ?? null;

    const decorate = (s: typeof shiftDocs[number]) => {
      const movs = movementDocs.filter(m => m.shiftId === s.id);
      return {
        id: s.id, openedBy: s.openedBy, openedAt: s.openedAt, openingFloat: s.openingFloat,
        closedBy: s.closedBy, closedAt: s.closedAt, closingCount: s.closingCount,
        expectedCash: s.closedAt ? s.expectedCash : expectedCash(s, saleDocs, movs),
        variance: s.closedAt ? s.variance : undefined,
        note: s.note ?? "",
        movements: movs.map(m => ({ id: m.id, direction: m.direction, amount: m.amount, reason: m.reason, by: m.by, createdAt: m.createdAt })),
      };
    };

    const defaults = { openingFloat: settings.registerOpeningFloat ?? 50, varianceAlert: settings.registerVarianceAlert ?? 5 };
    return NextResponse.json({ open: open ? decorate(open) : null, history: shiftDocs.filter(s => s.closedAt).map(decorate), movements: movementDocs, defaults });
  } catch {
    return NextResponse.json({ error: "Database offline." }, { status: 503 });
  }
}

/** POST actions: open (new shift), cashIn/cashOut (movement), close (count + variance). */
export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "").trim();

    if (action === "open") {
      const by = await requireStaff(request, "Manager");
      const amount = money2(Number(body.openingFloat ?? 0));
      if (!Number.isFinite(amount) || amount < 0) return bad("Opening float must be zero or more.");
      const shifts = await getRegisterShiftsCollection();
      const open = await shifts.findOne({ closedAt: { $exists: false } });
      if (open) return bad(`Register is already open (shift ${open.id} opened by ${open.openedBy}).`, 409);
      const last = await shifts.find({ id: /^SHF-/ }).sort({ id: -1 }).limit(1).next();
      const n = last ? parseInt(last.id.slice(4), 10) + 1 : 1;
      const id = `SHF-${String(n).padStart(4, "0")}`;
      await shifts.insertOne({
        _id: id, id, openedBy: by, openedAt: new Date().toISOString(),
        openingFloat: amount, note: String(body.note ?? "").slice(0, 200),
      });
      return NextResponse.json({ ok: true, id, openingFloat: amount }, { status: 201 });
    }

    if (action === "cashIn" || action === "cashOut") {
      const by = await requireStaff(request, "Manager");
      const amount = money2(Number(body.amount));
      const reason = String(body.reason ?? "").trim();
      if (!Number.isFinite(amount) || amount < 0.01) return bad("Amount must be at least 0.01.");
      if (!reason) return bad("A reason is required for cash movements.");
      const shifts = await getRegisterShiftsCollection();
      const open = await shifts.findOne({ closedAt: { $exists: false } });
      if (!open) return bad("No open shift — open the register first.", 409);
      const movements = await getCashMovementsCollection();
      const last = await movements.find({ id: /^MOV-/ }).sort({ id: -1 }).limit(1).next();
      const n = last ? parseInt(last.id.slice(4), 10) + 1 : 1;
      const id = `MOV-${String(n).padStart(4, "0")}`;
      await movements.insertOne({
        _id: id, id, shiftId: open.id, direction: action === "cashIn" ? "in" : "out",
        amount, reason: reason.slice(0, 120), by, createdAt: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, id }, { status: 201 });
    }

    if (action === "close") {
      const by = await requireStaff(request, "Manager");
      const count = money2(Number(body.closingCount));
      if (!Number.isFinite(count) || count < 0) return bad("Closing count must be zero or more.");
      const shifts = await getRegisterShiftsCollection();
      const open = await shifts.findOne({ closedAt: { $exists: false } });
      if (!open) return bad("No open shift to close.", 409);
      const movements = await getCashMovementsCollection().then(c => c.find({ shiftId: open.id }).toArray());
      const saleDocs = await (await getSalesCollection()).find({}, { projection: { payment: 1, status: 1, saleTotal: 1, createdAt: 1, refundedAt: 1 } }).toArray();
      const expected = expectedCash(open, saleDocs, movements);
      const closedAt = new Date().toISOString();
      await shifts.updateOne(
        { _id: open._id, closedAt: { $exists: false } }, // guard: no double close
        { $set: { closedAt, closedBy: by, closingCount: count, expectedCash: expected, variance: money2(count - expected), note: String(body.note ?? "").slice(0, 200) } },
      );
      return NextResponse.json({ ok: true, id: open.id, expectedCash: expected, closingCount: count, variance: money2(count - expected) });
    }

    return bad("Unknown action. Use open, cashIn, cashOut, or close.");
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return NextResponse.json({ error: (e as Error).message ?? "Register action failed." }, { status });
  }
}
