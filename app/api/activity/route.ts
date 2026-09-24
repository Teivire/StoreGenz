import { NextResponse } from "next/server";
import { ensureSeeded, requireStaff, getActivityCollection } from "@/lib/db";

/** GET: activity trail, newest first (?limit= default 100, max 500). Manager+. */
export async function GET(request: Request) {
  try {
    await requireStaff(request, "Manager");
    await ensureSeeded();
    const limit = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get("limit") ?? "100", 10) || 100, 1), 500);
    const docs = await (await getActivityCollection()).find().sort({ createdAt: -1 }).limit(limit).toArray();
    return NextResponse.json(docs.map(({ _id, ...a }) => a));
  } catch (e) {
    const status = (e as { status?: number }).status ?? 503;
    return NextResponse.json({ error: (e as Error).message ?? "Database offline." }, { status });
  }
}
