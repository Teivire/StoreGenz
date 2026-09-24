import { MongoClient } from "mongodb";

export type Product = { name: string; sku: string; category: string; price: number; cost: number; stock: number; image?: string };
export type SaleLine = { name: string; sku: string; price: number; cost: number; qty: number };
export type SaleStatus = "Paid" | "Pending" | "Refunded";
export type StaffRole = "Administrator" | "Manager" | "Cashier";
export type StaffMember = { name: string; role: StaffRole; permissions: string; status: "Active" | "Inactive" };
export type StoredStaff = StaffMember & { _id: string; pin: string };
/** What the UI may see after login — never includes the PIN. */
export type PublicStaff = { name: string; role: StaffRole; permissions: string; status: "Active" | "Inactive" };
/** Public profile plus the server-side sign-in time of the active session. */
export type SessionProfile = PublicStaff & { signedInAt: Date };
export type Sale = {
  id: string;
  customer: string;
  date: string;
  payment: string;
  status: SaleStatus;
  /** Manager-approved markdown off the subtotal (0 when none). */
  discount: number;
  lines: SaleLine[];
  refundReason?: string;
  servedBy?: string;
  /** Cash handling: amount the customer handed over and the change owed (server-computed). */
  amountPaid?: number;
  changeDue?: number;
};
export type StoredProduct = Product & { _id: string };
export type StoredSale = Sale & { _id: string; createdAt: Date; /** Subtotal − discount, snapshotted at sale time. */ saleTotal: number };
export type StoredStaffLegacy = StaffMember & { _id: string };
/** Single-store settings: identity used by the sidebar, login screen, and printed invoices. */
export type StoreSettings = { name: string; location: string; receiptFooter: string; currency: string };
export type StoredSettings = StoreSettings & { _id: "settings" };
/** Server-side login session: the browser cookie holds only the random _id token. */
export type StoredSession = { _id: string; staffId: string; createdAt: Date; expiresAt: Date };
export const SESSION_COOKIE = "pos_session";
export const SESSION_TTL_MS = 30 * 86_400_000;

export const DB_NAME = "storegenz";
const uri = process.env.MONGODB_URI ?? `mongodb://127.0.0.1:27017/${DB_NAME}`;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

// Reuse the client across dev-server hot reloads so connections don't pile up.
const clientPromise: Promise<MongoClient> =
  global._mongoClientPromise ?? new MongoClient(uri).connect();
if (process.env.NODE_ENV === "development") global._mongoClientPromise = clientPromise;

export async function getDb() {
  const client = await clientPromise;
  return client.db(DB_NAME);
}

export async function getProductsCollection() {
  return (await getDb()).collection<StoredProduct>("products");
}

export async function getSalesCollection() {
  return (await getDb()).collection<StoredSale>("sales");
}

export async function getStaffCollection() {
  return (await getDb()).collection<StoredStaff>("staff");
}

export async function getSessionsCollection() {
  return (await getDb()).collection<StoredSession>("sessions");
}

const DEFAULT_SETTINGS: StoreSettings = { name: "StoreGenz", location: "Phnom Penh", receiptFooter: "Thank you for shopping with us!", currency: "$" };
export async function getSettingsCollection() {
  return (await getDb()).collection<StoredSettings>("settings");
}

/** Reads the single settings doc, creating the default one on first access. */
export async function readSettings(): Promise<StoreSettings> {
  const settings = await getSettingsCollection();
  const existing = await settings.findOne({ _id: "settings" });
  if (existing) return { name: existing.name, location: existing.location, receiptFooter: existing.receiptFooter, currency: existing.currency };
  const doc = { _id: "settings" as const, ...DEFAULT_SETTINGS };
  await settings.insertOne(doc);
  return DEFAULT_SETTINGS;
}

/** Permission tiers, highest first. Cashiers sell and refund; managers run the catalog; admins manage people. */
const ROLE_RANK: Record<StaffRole, number> = { Cashier: 1, Manager: 2, Administrator: 3 };

/** Reads the session token from the request's Cookie header, if present. */
function readSessionToken(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq) === SESSION_COOKIE) return part.slice(eq + 1) || null;
  }
  return null;
}

/** Validates a name+PIN pair; returns the public profile or an HTTP status to map. */
export async function checkCredentials(name: string, pin: string): Promise<{ ok: true; profile: PublicStaff } | { ok: false; status: number; message: string }> {
  const doc = await getStaffCollection().then(c => c.findOne({ _id: name }));
  if (!doc || doc.pin !== pin) return { ok: false, status: 401, message: "Invalid staff name or PIN." };
  if (doc.status !== "Active") return { ok: false, status: 403, message: "This account is inactive. Ask an administrator to reactivate it." };
  return { ok: true, profile: { name: doc.name, role: doc.role, permissions: doc.permissions, status: doc.status } };
}

/** Resolves the request's cookie session to the signed-in profile, or null. */
export async function readSession(request: Request): Promise<SessionProfile | null> {
  const token = readSessionToken(request);
  if (!token) return null;
  const session = await getSessionsCollection().then(c => c.findOne({ _id: token }));
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;
  const doc = await getStaffCollection().then(c => c.findOne({ _id: session.staffId }));
  if (!doc || doc.status !== "Active") return null;
  return { name: doc.name, role: doc.role, permissions: doc.permissions, status: doc.status, signedInAt: session.createdAt };
}

/** Deletes the request's session (logout) if it has one. */
export async function deleteSession(request: Request): Promise<void> {
  const token = readSessionToken(request);
  if (token) await getSessionsCollection().then(c => c.deleteOne({ _id: token }));
}

/** Creates a new 30-day session for the staff member and returns its token. */
export async function createSession(staffId: string): Promise<string> {
  const token = crypto.randomUUID();
  await getSessionsCollection().then(c => c.insertOne({ _id: token, staffId, createdAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) }));
  return token;
}

/**
 * Shared guard for mutating API routes: authenticates via the HttpOnly session
 * cookie first (browser), falling back to the X-Staff-Name / X-Staff-Pin headers
 * (scripts and tests), then enforces the minimum role and that the account is
 * Active. Returns the caller's name on success. Throws plain Error objects
 * carrying an HTTP `status` (401 unauthenticated, 403 forbidden) for routes to map.
 */
export async function requireStaff(request: Request, minRole: StaffRole): Promise<string> {
  const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }); };
  if (readSessionToken(request)) {
    const viaSession = await readSession(request);
    if (viaSession) {
      if (ROLE_RANK[viaSession.role] < ROLE_RANK[minRole]) fail(403, `Requires ${minRole} role or higher.`);
      return viaSession.name;
    }
  }
  const name = request.headers.get("x-staff-name") ?? "";
  const pin = request.headers.get("x-staff-pin") ?? "";
  if (!name || !pin) fail(401, "Sign in to make changes.");
  const doc = await getStaffCollection().then(c => c.findOne({ _id: name }));
  if (doc === null || doc.pin !== pin) return fail(401, "Invalid staff name or PIN.");
  if (doc.status !== "Active") return fail(403, "This account is inactive.");
  if (ROLE_RANK[doc.role] < ROLE_RANK[minRole]) return fail(403, `Requires ${minRole} role or higher.`);
  return doc.name;
}

/**
 * Idempotent seed + index setup: inserts starter data and ensures query indexes.
 * Seed sales carry createdAt timestamps staggered across the current week (and the
 * prior one, for the comparison KPIs) relative to "now", so the Dashboard aggregates
 * always have plausible data regardless of when the database is created.
 */
export async function ensureSeeded() {
  const db = await getDb();
  const products = db.collection<StoredProduct>("products");
  const sales = db.collection<StoredSale>("sales");
  const staff = db.collection<StoredStaff>("staff");
  const sessions = db.collection<StoredSession>("sessions");

  // Products created before cost existed read as cost 0 — profit counts them at
  // zero cost rather than failing.
  await products.updateMany({ cost: { $exists: false } }, { $set: { cost: 0 } });

  // Indexes: products category filter; sales list sort and stats aggregations;
  // sessions TTL cleanup (Mongo deletes expired sessions on its own schedule).
  await products.createIndex({ category: 1 });
  await sales.createIndex({ createdAt: -1 });
  await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  // Staff created before PINs existed get a default PIN so they can still sign in.
  await staff.updateMany({ pin: { $exists: false } }, { $set: { pin: "1234" } });

  if ((await staff.countDocuments()) === 0) {
    const seedStaff: (StaffMember & { pin: string })[] = [
      { name: "Sokha P.", role: "Administrator", permissions: "Full access", status: "Active", pin: "1111" },
      { name: "Dara K.", role: "Manager", permissions: "POS + inventory", status: "Active", pin: "2222" },
      { name: "Mony S.", role: "Cashier", permissions: "POS access", status: "Active", pin: "3333" }
    ];
    await staff.insertMany(seedStaff.map(m => ({ ...m, _id: m.name })));
  }

  if ((await products.countDocuments()) === 0) {
    const seedProducts: Product[] = [
      { name: "Premium Jasmine Rice 5kg", sku: "SKU-09231", category: "Groceries", price: 12.5, cost: 9.8, stock: 4 },
      { name: "Coca Cola Original 330ml", sku: "SKU-00842", category: "Beverages", price: 0.75, cost: 0.45, stock: 48 },
      { name: "Cambodia Beer Can 330ml", sku: "SKU-00128", category: "Beverages", price: 1.25, cost: 0.8, stock: 12 },
      { name: "Angkor Mineral Water 1.5L", sku: "SKU-00419", category: "Beverages", price: 0.5, cost: 0.28, stock: 96 },
      { name: "Palm Sugar 500g", sku: "SKU-00555", category: "Groceries", price: 3.2, cost: 2.1, stock: 25 },
      { name: "Laundry Detergent 1kg", sku: "SKU-00783", category: "Household", price: 4.75, cost: 3.4, stock: 18 }
    ];
    await products.insertMany(seedProducts.map(p => ({ ...p, _id: p.sku })));
  }

  if ((await sales.countDocuments()) === 0) {
    // Each line snapshots the product's unit cost at sale time so historical profit
    // stays stable even after the catalog's cost is edited.
    const mk = (name: string, sku: string, price: number, cost: number, qty: number) => ({ name, sku, price, cost, qty });
    const rice = (qty: number) => mk("Premium Jasmine Rice 5kg", "SKU-09231", 12.5, 9.8, qty);
    const water = (qty: number) => mk("Angkor Mineral Water 1.5L", "SKU-00419", 0.5, 0.28, qty);
    const sugar = (qty: number) => mk("Palm Sugar 500g", "SKU-00555", 3.2, 2.1, qty);
    const beer = (qty: number) => mk("Cambodia Beer Can 330ml", "SKU-00128", 1.25, 0.8, qty);
    const seed = (id: string, customer: string, date: string, payment: string, status: SaleStatus, servedBy: string, discount: number, lines: ReturnType<typeof mk>[], createdAt: Date) =>
      ({ id, customer, date, payment, status, servedBy, discount, lines, createdAt, saleTotal: Math.round((lines.reduce((sum, l) => sum + l.price * l.qty, 0) - discount) * 100) / 100 });
    const now = Date.now();
    const hoursAgo = (h: number) => new Date(now - h * 3600_000);
    const daysAgo = (d: number, h = 0) => hoursAgo(d * 24 + h);
    const seedSales: (Sale & { createdAt: Date; saleTotal: number })[] = [
      seed("#INV-1048", "Sokha Trading", "Today, 10:42 AM", "Cash", "Paid", "Sokha P.", 0, [rice(16), water(96)], hoursAgo(2)),
      seed("#INV-1047", "Dara Market", "Today, 10:15 AM", "ABA Pay", "Paid", "Dara K.", 2, [sugar(25), water(13)], hoursAgo(5)),
      seed("#INV-1046", "Walk-in customer", "Today, 09:58 AM", "Cash", "Paid", "Mony S.", 0, [beer(12), rice(2), water(4)], hoursAgo(8)),
      seed("#INV-1045", "Srey Mom", "Yesterday, 04:28 PM", "Credit", "Pending", "Mony S.", 0, [rice(10)], daysAgo(1, 3)),
      seed("#INV-1044", "Vichea Mart", "Yesterday, 02:10 PM", "Cash", "Refunded", "Dara K.", 0, [rice(1)], daysAgo(1, 6)),
      seed("#INV-1043", "Rotha Shop", "2 days ago", "Cash", "Paid", "Dara K.", 1.5, [sugar(8), beer(6)], daysAgo(2, 2)),
      seed("#INV-1042", "Walk-in customer", "3 days ago", "ABA Pay", "Paid", "Mony S.", 0, [water(40)], daysAgo(3, 4)),
      seed("#INV-1041", "Chan Mart", "4 days ago", "Cash", "Paid", "Dara K.", 0, [rice(3), sugar(12)], daysAgo(4, 5)),
      seed("#INV-1040", "Sokha Trading", "5 days ago", "Credit", "Paid", "Sokha P.", 0, [beer(24)], daysAgo(5, 6)),
      // Prior-week sales (same weekdays, seven days earlier) to feed the vs-last-week KPIs.
      seed("#INV-1039", "Dara Market", "Last week", "Cash", "Paid", "Mony S.", 0, [rice(12), water(60)], daysAgo(9, 3)),
      seed("#INV-1038", "Vichea Mart", "Last week", "ABA Pay", "Paid", "Dara K.", 0, [sugar(18), beer(10)], daysAgo(10, 5)),
      seed("#INV-1037", "Rotha Shop", "Last week", "Cash", "Paid", "Mony S.", 0, [water(80)], daysAgo(11, 2))
    ];
    await sales.insertMany(seedSales.map(s => ({ ...s, _id: s.id })));
  }
}

/**
 * Backfill for sales written before the analytics fields existed: legacy docs get
 * discount 0, saleTotal derived from their lines, and cost 0 per line (unknown →
 * profit counts 0, never negative). Idempotent; runs on sales reads.
 */
export async function normalizeLegacySales() {
  const sales = await getSalesCollection();
  const legacy = await sales.find({ $or: [{ discount: { $exists: false } }, { saleTotal: { $exists: false } }, { "lines.cost": { $exists: false } }] }).limit(500).toArray();
  for (const s of legacy) {
    const subtotal = Math.round(s.lines.reduce((sum, l) => sum + l.price * l.qty, 0) * 100) / 100;
    const patch: Record<string, unknown> = {};
    if (s.discount === undefined) patch.discount = 0;
    if (s.saleTotal === undefined) patch.saleTotal = subtotal;
    if (s.lines.some(l => l.cost === undefined)) patch.lines = s.lines.map(l => ({ ...l, cost: 0 }));
    if (Object.keys(patch).length > 0) await sales.updateOne({ _id: s._id }, { $set: patch });
  }
}

/**
 * Backfill for sales written before createdAt existed: derive a timestamp from the
 * display date ("Today", "Yesterday", "N days ago", else ordered fallback).
 * Legacy documents get spread across the recent past so they land in sensible buckets.
 */
export async function backfillCreatedAt() {
  const sales = await getSalesCollection();
  const legacy = await sales.find({ createdAt: { $exists: false } }).sort({ _id: -1 }).toArray();
  if (legacy.length === 0) return;
  const now = Date.now();
  let seq = 0;
  for (const s of legacy) {
    let ageHours = seq * 2; // fallback: newest doc is most recent, older ones step back
    if (/^today/i.test(s.date)) ageHours = 3;
    else if (/^yesterday/i.test(s.date)) ageHours = 24 + 3;
    else {
      const m = s.date.match(/^(\d+)\s+days?\s+ago/i);
      if (m) ageHours = Number(m[1]) * 24 + 3;
    }
    await sales.updateOne({ _id: s._id }, { $set: { createdAt: new Date(now - (ageHours + seq * 0.5) * 3600_000) } });
    seq++;
  }
}
