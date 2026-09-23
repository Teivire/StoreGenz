import { MongoClient } from "mongodb";

export type Product = { name: string; sku: string; category: string; price: number; stock: number; image?: string };
export type SaleLine = { name: string; sku: string; price: number; qty: number };
export type SaleStatus = "Paid" | "Pending" | "Refunded";
export type StaffRole = "Administrator" | "Manager" | "Cashier";
export type StaffMember = { name: string; role: StaffRole; permissions: string; status: "Active" | "Inactive" };
export type StoredStaff = StaffMember & { _id: string; pin: string };
/** What the UI may see after login — never includes the PIN. */
export type PublicStaff = { name: string; role: StaffRole; permissions: string; status: "Active" | "Inactive" };
export type Sale = {
  id: string;
  customer: string;
  date: string;
  payment: string;
  status: SaleStatus;
  lines: SaleLine[];
  refundReason?: string;
  servedBy?: string;
};
export type StoredProduct = Product & { _id: string };
export type StoredSale = Sale & { _id: string; createdAt: Date };
export type StoredStaffLegacy = StaffMember & { _id: string };
/** Single-store settings: identity used by the sidebar, login screen, and printed invoices. */
export type StoreSettings = { name: string; location: string; receiptFooter: string; currency: string };
export type StoredSettings = StoreSettings & { _id: "settings" };

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

/**
 * Shared guard for mutating API routes: authenticates the X-Staff-Name / X-Staff-Pin
 * headers against the staff collection, then enforces the minimum role and that the
 * account is Active. Returns the caller's name on success. Throws plain Error objects
 * carrying an HTTP `status` (401 unauthenticated, 403 forbidden) for routes to map.
 */
export async function requireStaff(request: Request, minRole: StaffRole): Promise<string> {
  const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }); };
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

  // Indexes: products category filter; sales list sort and stats aggregations.
  await products.createIndex({ category: 1 });
  await sales.createIndex({ createdAt: -1 });

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
      { name: "Premium Jasmine Rice 5kg", sku: "SKU-09231", category: "Groceries", price: 12.5, stock: 4 },
      { name: "Coca Cola Original 330ml", sku: "SKU-00842", category: "Beverages", price: 0.75, stock: 48 },
      { name: "Cambodia Beer Can 330ml", sku: "SKU-00128", category: "Beverages", price: 1.25, stock: 12 },
      { name: "Angkor Mineral Water 1.5L", sku: "SKU-00419", category: "Beverages", price: 0.5, stock: 96 },
      { name: "Palm Sugar 500g", sku: "SKU-00555", category: "Groceries", price: 3.2, stock: 25 },
      { name: "Laundry Detergent 1kg", sku: "SKU-00783", category: "Household", price: 4.75, stock: 18 }
    ];
    await products.insertMany(seedProducts.map(p => ({ ...p, _id: p.sku })));
  }

  if ((await sales.countDocuments()) === 0) {
    const rice = { name: "Premium Jasmine Rice 5kg", sku: "SKU-09231", price: 12.5 };
    const water = { name: "Angkor Mineral Water 1.5L", sku: "SKU-00419", price: 0.5 };
    const sugar = { name: "Palm Sugar 500g", sku: "SKU-00555", price: 3.2 };
    const beer = { name: "Cambodia Beer Can 330ml", sku: "SKU-00128", price: 1.25 };
    const now = Date.now();
    const hoursAgo = (h: number) => new Date(now - h * 3600_000);
    const daysAgo = (d: number, h = 0) => hoursAgo(d * 24 + h);
    const seedSales: (Sale & { createdAt: Date })[] = [
      { id: "#INV-1048", customer: "Sokha Trading", date: "Today, 10:42 AM", payment: "Cash", status: "Paid", lines: [{ ...rice, qty: 16 }, { ...water, qty: 96 }], createdAt: hoursAgo(2) },
      { id: "#INV-1047", customer: "Dara Market", date: "Today, 10:15 AM", payment: "ABA Pay", status: "Paid", lines: [{ ...sugar, qty: 25 }, { ...water, qty: 13 }], createdAt: hoursAgo(5) },
      { id: "#INV-1046", customer: "Walk-in customer", date: "Today, 09:58 AM", payment: "Cash", status: "Paid", lines: [{ ...beer, qty: 12 }, { ...rice, qty: 2 }, { ...water, qty: 4 }], createdAt: hoursAgo(8) },
      { id: "#INV-1045", customer: "Srey Mom", date: "Yesterday, 04:28 PM", payment: "Credit", status: "Pending", lines: [{ ...rice, qty: 10 }], createdAt: daysAgo(1, 3) },
      { id: "#INV-1044", customer: "Vichea Mart", date: "Yesterday, 02:10 PM", payment: "Cash", status: "Refunded", refundReason: "Changed their mind", lines: [{ ...rice, qty: 1 }], createdAt: daysAgo(1, 6) },
      { id: "#INV-1043", customer: "Rotha Shop", date: "2 days ago", payment: "Cash", status: "Paid", lines: [{ ...sugar, qty: 8 }, { ...beer, qty: 6 }], createdAt: daysAgo(2, 2) },
      { id: "#INV-1042", customer: "Walk-in customer", date: "3 days ago", payment: "ABA Pay", status: "Paid", lines: [{ ...water, qty: 40 }], createdAt: daysAgo(3, 4) },
      { id: "#INV-1041", customer: "Chan Mart", date: "4 days ago", payment: "Cash", status: "Paid", lines: [{ ...rice, qty: 3 }, { ...sugar, qty: 12 }], createdAt: daysAgo(4, 5) },
      { id: "#INV-1040", customer: "Sokha Trading", date: "5 days ago", payment: "Credit", status: "Paid", lines: [{ ...beer, qty: 24 }], createdAt: daysAgo(5, 6) },
      // Prior-week sales (same weekdays, seven days earlier) to feed the vs-last-week KPIs.
      { id: "#INV-1039", customer: "Dara Market", date: "Last week", payment: "Cash", status: "Paid", lines: [{ ...rice, qty: 12 }, { ...water, qty: 60 }], createdAt: daysAgo(9, 3) },
      { id: "#INV-1038", customer: "Vichea Mart", date: "Last week", payment: "ABA Pay", status: "Paid", lines: [{ ...sugar, qty: 18 }, { ...beer, qty: 10 }], createdAt: daysAgo(10, 5) },
      { id: "#INV-1037", customer: "Rotha Shop", date: "Last week", payment: "Cash", status: "Paid", lines: [{ ...water, qty: 80 }], createdAt: daysAgo(11, 2) }
    ];
    await sales.insertMany(seedSales.map(s => ({ ...s, _id: s.id })));
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
