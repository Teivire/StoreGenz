import { NextResponse } from "next/server";
import { requireCapability, ensureSeeded, requireStaff, signOutAllUsers, getStaffCollection, logActivity, readSessionToken } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Security posture (Settings → Users & Security). Any signed-in staff may read. */
export async function GET(request: Request) {
  try {
    await ensureSeeded();
    await requireStaff(request);
    const staff = await (await getStaffCollection()).find().toArray();
    return NextResponse.json({
      authMode: "name + PIN (plain-text in this demo database — swap for bcrypt before production)",
      sessionTtlDays: 30,
      activeAccounts: staff.filter(s => s.status === "Active").length,
      inactiveAccounts: staff.filter(s => s.status === "Inactive").length,
      administrators: staff.filter(s => s.role === "Administrator").length,
      roles: staff.reduce<Record<string, number>>((acc, s) => { acc[s.role] = (acc[s.role] ?? 0) + 1; return acc; }, {}),
    });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}

/** Force sign-out of every active session. Requires staff.manage; the caller keeps their own session. */
export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const by = await requireCapability(request, "staff.manage");
    const selfToken = readSessionToken(request);
    const count = await signOutAllUsers();
    await logActivity("security.signOutAll", `All sessions force-signed-out (${count}) by ${by}`, by);
    return NextResponse.json({ ok: true, signedOut: selfToken ? Math.max(0, count - 1) : count });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}
