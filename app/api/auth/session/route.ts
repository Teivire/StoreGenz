import { NextResponse } from "next/server";
import { checkCredentials, createSession, deleteSession, readSession, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

const sessionCookie = (token: string) =>
  `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; SameSite=Lax`;

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

/** Whoami: resolves the session cookie back to the signed-in profile. */
export async function GET(request: Request) {
  try {
    const profile = await readSession(request);
    if (!profile) return bad("Not signed in.", 401);
    return NextResponse.json(profile);
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
      { headers: { "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax` } },
    );
  } catch (e) {
    return bad(String(e), 503);
  }
}
