import { NextResponse } from "next/server";
import { ensureSeeded, requireStaff, getAttendanceCollection, logActivity } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** GET: recent entries, newest first (?limit= default 100, max 500). */
export async function GET(request: Request) {
  try {
    await ensureSeeded();
    await requireStaff(request, "Cashier");
    const limit = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get("limit") ?? "100", 10) || 100, 1), 500);
    const docs = await (await getAttendanceCollection()).find().sort({ clockIn: -1 }).limit(limit).toArray();
    return NextResponse.json(docs.map(({ _id, ...a }) => a));
  } catch (e) {
    const status = (e as { status?: number }).status ?? 503;
    return NextResponse.json({ error: (e as Error).message ?? "Database offline." }, { status });
  }
}

/** POST { action: "clockIn" | "clockOut" } — the signed-in staff member records their own attendance. */
export async function POST(request: Request) {
  try {
    const by = await requireStaff(request, "Cashier");
    await ensureSeeded();
    const body = await request.json() as { action?: string };
    const action = String(body.action ?? "").trim();
    const attendance = await getAttendanceCollection();
    const now = new Date().toISOString();

    if (action === "clockIn") {
      const open = await attendance.findOne({ staffName: by, clockOut: { $exists: false } });
      if (open) return bad(`You already clocked in at ${new Date(open.clockIn).toLocaleTimeString()}.`, 409);
      const id = `ATT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await attendance.insertOne({ _id: id, id, staffName: by, clockIn: now });
      await logActivity("attendance.clockIn", `${by} clocked in`, by);
      return NextResponse.json({ ok: true, id, clockIn: now }, { status: 201 });
    }

    if (action === "clockOut") {
      const open = await attendance.findOne({ staffName: by, clockOut: { $exists: false } });
      if (!open) return bad("No open clock-in to close.", 409);
      await attendance.updateOne({ _id: open._id }, { $set: { clockOut: now } });
      const hours = Math.round(((new Date(now).getTime() - new Date(open.clockIn).getTime()) / 3600_000) * 100) / 100;
      await logActivity("attendance.clockOut", `${by} clocked out (${hours}h)`, by);
      return NextResponse.json({ ok: true, id: open.id, clockOut: now, hours });
    }

    return bad("Unknown action. Use clockIn or clockOut.");
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return NextResponse.json({ error: (e as Error).message ?? "Attendance action failed." }, { status });
  }
}
