import { NextResponse } from "next/server";
import { requireCapability, requireStaff, ensureSeeded, getStoresCollection, logActivity, StoreRecord } from "@/lib/db";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

const STORE_TYPES = ["Retail Store", "Warehouse", "Online Store"] as const;
type StoreType = (typeof STORE_TYPES)[number];

const nextCode = (existing: string[]) => {
  const max = existing.reduce((m, c) => Math.max(m, Number.parseInt(c.slice(3), 10) || 0), 0);
  return `ST-${String(max + 1).padStart(3, "0")}`;
};

/** Lists the store registry (Settings → Store / Locations). Any signed-in staff may read. */
export async function GET(request: Request) {
  try {
    await ensureSeeded();
    await requireStaff(request);
    const docs = await (await getStoresCollection()).find().sort({ code: 1 }).toArray();
    return NextResponse.json(docs.map(({ _id, ...s }) => s));
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}

/**
 * Adds a store to the registry (Settings → Store / Locations → Add Store). Requires settings.manage.
 * The next free code (ST-nnn, highest existing + 1) can be computed client-side from GET.
 */
export async function POST(request: Request) {
  try {
    const by = await requireCapability(request, "settings.manage");
    await ensureSeeded();
    const body = (await request.json()) as { name?: string; code?: string; type?: string; status?: string };
    const name = String(body.name ?? "").trim();
    const code = String(body.code ?? "").trim().toUpperCase();
    const type = String(body.type ?? "Retail Store").trim() as StoreType;
    const status: StoreRecord["status"] = body.status === "Inactive" ? "Inactive" : "Active";
    if (!name) return bad("Store name is required.");
    if (name.length > 80) return bad("Store name is too long (max 80 characters).");
    if (!code) return bad("Store code is required.");
    if (code.length > 20) return bad("Store code is too long (max 20 characters).");
    if (!STORE_TYPES.includes(type)) return bad(`Store type must be one of: ${STORE_TYPES.join(", ")}.`);

    const stores = await getStoresCollection();
    if (await stores.findOne({ code })) return bad(`Store code "${code}" is already in use.`, 409);
    if (await stores.findOne({ name })) return bad(`Store name "${name}" is already in use.`, 409);

    const now = new Date().toISOString();
    const doc = { _id: code, id: code, code, name, type, status, createdBy: by, createdAt: now, updatedAt: now };
    await stores.insertOne(doc);
    await logActivity("store.create", `${code} — ${name} (${type}, ${status})`, by);
    const { _id, ...rest } = doc;
    return NextResponse.json(rest, { status: 201 });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return NextResponse.json({ error: (e as Error).message ?? "Could not create store." }, { status });
  }
}
