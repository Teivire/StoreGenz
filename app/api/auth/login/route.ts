import { NextResponse } from "next/server";
import { checkCredentials } from "@/lib/db";

/**
 * Header-friendly login probe kept for scripts/tests: validates a staff name + PIN
 * against MongoDB and returns the public profile. It does NOT set a cookie — browsers
 * should use POST /api/auth/session, which creates a real session. PINs are stored in
 * plain text — appropriate for a demo POS; swap for bcrypt/argon2 before any real
 * deployment.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: string; pin?: string };
    const name = String(body.name ?? "").trim();
    const pin = String(body.pin ?? "").trim();
    if (!name || !pin) return NextResponse.json({ error: "Name and PIN are required." }, { status: 400 });
    const result = await checkCredentials(name, pin);
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
    return NextResponse.json({ name: result.profile.name, role: result.profile.role, permissions: result.profile.permissions });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}
