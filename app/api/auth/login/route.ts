import { NextResponse } from "next/server";
import { ensureSeeded, getStaffCollection } from "@/lib/db";

/**
 * Login: validates a staff name + PIN against MongoDB and returns the public profile.
 * PINs are stored in plain text — appropriate for a demo POS; swap for bcrypt/argon2
 * before any real deployment.
 */
export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const body = (await request.json()) as { name?: string; pin?: string };
    const name = String(body.name ?? "").trim();
    const pin = String(body.pin ?? "").trim();
    if (!name || !pin) {
      return NextResponse.json({ error: "Name and PIN are required." }, { status: 400 });
    }
    const staff = await getStaffCollection();
    const doc = await staff.findOne({ _id: name });
    if (!doc || doc.pin !== pin) {
      return NextResponse.json({ error: "Invalid staff name or PIN." }, { status: 401 });
    }
    if (doc.status !== "Active") {
      return NextResponse.json({ error: "This account is inactive. Ask an administrator to reactivate it." }, { status: 403 });
    }
    const { pin: _pin, ...profile } = doc;
    return NextResponse.json({ name: profile.name, role: profile.role, permissions: profile.permissions });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}
