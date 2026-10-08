import { NextResponse } from "next/server";
import { checkCredentials, createSession, deleteSession, readSession, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/db";

export const dynamic = "force-dynamic";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

// Add Secure flag on HTTPS (production). In dev (localhost) the flag would block
// the cookie over plain HTTP, so it is only applied outside development.
const isSecure = process.env.NODE_ENV !== "development";

const sessionCookie = (token: string) =>
  `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; SameSite=Lax${isSecure ? "; Secure" : ""}`;

const clearCookie = () =>
  `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${isSecure ? "; Secure" : ""}`;

/** Login: validates name+PIN, creates a server-side session, sets the HttpOnly cookie. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: string; pin?: string };
    const name = String(body.name ?? "").trim();
    const pin = String(body.pin ?? "").trim();
    if (!name || !pin) return bad("Name and PIN are required.");
    const result = await checkCredentials(name, pin);
    if (!result.ok) return bad(result.message, result.status);
    const token = await createSession(result.profile.name);
    return NextResponse.json(
      { name: result.profile.name, role: result.profile.role, permissions: result.profile.permissions },
      { headers: { "Set-Cookie": sessionCookie(token) } },
    );
  } catch (e) {
    return bad(String(e), 503);
  }
}

/** Whoami: resolves the session cookie back to the signed-in profile + sign-in time. */
export async function GET(request: Request) {
  try {
    const profile = await readSession(request);
    if (!profile) return bad("Not signed in.", 401);
    return NextResponse.json({
      name: profile.name,
      role: profile.role,
      permissions: profile.permissions,
      signedInAt: profile.signedInAt,
    });
  } catch (e) {
    return bad(String(e), 503);
  }
}

/** Logout: deletes the server-side session and expires the cookie. */
export async function DELETE(request: Request) {
  try {
    await deleteSession(request);
    return NextResponse.json(
      { ok: true },
      { headers: { "Set-Cookie": clearCookie() } },
    );
  } catch (e) {
    return bad(String(e), 503);
  }
}
