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
  refundedAt?: string;   // ISO — when the refund happened (cash-window math)
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
export type PaymentMethodSetting = { name: string; enabled: boolean };
export type StoreSettings = { name: string; location: string; receiptFooter: string; currency: string; paymentMethods?: PaymentMethodSetting[]; registerOpeningFloat?: number; registerVarianceAlert?: number };
export type StoredSettings = StoreSettings & { _id: "settings" };

/** Stock movement ledger: every stock change with who/why, newest-first reads. */
export type StockMovement = {
  sku: string;
  productName: string;
  delta: number;          // +in / −out
  reason: "adjustment" | "sale" | "refund" | "purchase" | "purchase-return" | "transfer-in" | "transfer-out" | "seed";
  note: string;
  by: string;             // staff name ("system" for sale/refund)
  refId: string;          // invoice / PO / transfer id / ""
  createdAt: string;      // ISO
};
export type StoredStockMovement = StockMovement & { _id: string };

/** Expense: money out (rent, utilities, supplies), recorded by managers+. */
export type Expense = {
  id: string;            // "EXP-<n>"
  date: string;          // ISO
  category: string;
  amount: number;        // positive; the expense IS money out
  note: string;
  createdBy: string;
  createdAt: string;
  recurringId?: string;  // set when generated from a recurring expense
};
export type StoredExpense = Expense & { _id: string };

/** Recurring expense: template that generates real expenses on its schedule. */
export type RecurringExpense = {
  id: string;            // "REC-<n>"
  category: string;
  amount: number;        // positive money out
  frequency: "weekly" | "monthly";
  note: string;
  nextRun: string;       // ISO date — when the next expense is generated
  lastRun?: string;      // ISO date of the most recent generation
  active: boolean;
  createdBy: string;
  createdAt: string;     // ISO
};
export type StoredRecurringExpense = RecurringExpense & { _id: string };

/** Cash register shift: open with a counted float, close with a counted drawer; every
 *  cash movement in between is recomputable from the ledger, so variances are honest. */
export type RegisterShift = {
  id: string;            // "SHF-<n>"
  openedBy: string;
  openedAt: string;      // ISO
  openingFloat: number;  // counted cash in drawer at open
  closedBy?: string;
  closedAt?: string;     // ISO
  closingCount?: number; // counted cash in drawer at close
  expectedCash?: number; // server-computed at close: float + cash sales − cash refunds ± cash movements
  variance?: number;     // closingCount − expectedCash
  note?: string;
};
export type StoredRegisterShift = RegisterShift & { _id: string };

/** Cash movement inside a shift (manager-only): tip-out, bank drop, petty cash. */
export type CashMovement = {
  id: string;            // "MOV-<n>"
  shiftId: string;
  direction: "in" | "out";
  amount: number;
  reason: string;
  by: string;
  createdAt: string;     // ISO
};
export type StoredCashMovement = CashMovement & { _id: string };

/** Purchase order: supplier delivery, received into stock via the movement ledger. */
export type PurchaseLine = { sku: string; name: string; qty: number; cost: number };
export type PurchaseStatus = "Pending" | "Received" | "Returned";
export type Purchase = {
  id: string;            // "PO-<n>"
  supplier: string;
  lines: PurchaseLine[];
  status: PurchaseStatus;
  note: string;
  createdBy: string;
  createdAt: string;     // ISO
  receivedAt?: string;
  returnedAt?: string;
};
export type StoredPurchase = Purchase & { _id: string };

/** Supplier: vendor record; balances are computed from POs vs recorded payments. */
export type Supplier = {
  id: string;            // "SUP-<n>"
  name: string;          // unique
  phone: string;
  email: string;
  address: string;
  group: string;         // "Default" until supplier groups exist
  note: string;
  createdBy: string;
  createdAt: string;     // ISO
  updatedAt: string;
};
export type StoredSupplier = Supplier & { _id: string };

/** Supplier payment: money paid to a supplier, manager-gated; reduces the balance. */
export type SupplierPayment = {
  id: string;            // "PAY-<n>"
  supplierId: string;    // Supplier.id
  supplierName: string;  // denormalized for the ledger/history views
  date: string;          // ISO
  amount: number;        // positive; the payment IS money out
  method: string;
  note: string;
  createdBy: string;
  createdAt: string;     // ISO
};
export type StoredSupplierPayment = SupplierPayment & { _id: string };

/** Stock transfer: units moved between locations; total stock unchanged (paired ledger entries). */
export type StockTransfer = {
  id: string;            // "TRF-<n>"
  sku: string;
  productName: string;
  qty: number;
  from: string;
  to: string;
  note: string;
  by: string;            // staff name
  createdAt: string;     // ISO
};
export type StoredStockTransfer = StockTransfer & { _id: string };

/** Customer: directory record; statement = unpaid sales (credit) minus payments received. */
export type Customer = {
  id: string;            // "CUS-<n>"
  name: string;          // unique
  phone: string;
  email: string;
  address: string;
  group: string;         // "Default" until customer groups are managed explicitly
  loyaltyPoints: number; // whole points, 1 point per $1 of non-refunded sales
  note: string;
  createdBy: string;
  createdAt: string;     // ISO
  updatedAt: string;
};
export type StoredCustomer = Customer & { _id: string };

/** Customer payment: money received against credit purchases; reduces the balance. */
export type CustomerPayment = {
  id: string;            // "CSP-<n>"
  customerId: string;    // Customer.id
  customerName: string;  // denormalized for the ledger/history views
  date: string;          // ISO
  amount: number;        // positive; the payment IS money in
  method: string;
  note: string;
  createdBy: string;
  createdAt: string;     // ISO
};
export type StoredCustomerPayment = CustomerPayment & { _id: string };

/** Category taxonomy: id/name/parentId/description/status/sortOrder + audit fields. */
export type Category = {
  id: string;            // stable slug id ("beverages"), also the Mongo _id
  name: string;
  parentId: string | null; // null = top level
  description: string;
  status: "Active" | "Inactive";
  sortOrder: number;
  createdBy: string;
  createdAt: string;     // ISO
  updatedAt: string;     // ISO
};
/** Server-side login session: the browser cookie holds only the random _id token. */
export type StoredSession = { _id: string; staffId: string; createdAt: Date; expiresAt: Date };
export const SESSION_COOKIE = "pos_session";
export const SESSION_TTL_MS = 30 * 86_400_000;

export const DB_NAME = "storegenz";
const uri = process.env.MONGODB_URI ?? `mongodb://127.0.0.1:27017/${DB_NAME}`;

// Pool/timeouts: the app is a POS — latency spikes and stuck sockets must fail fast
// and retry, not hang a cashier. maxPoolSize sized for a single-store workload;
// raise alongside maxPoolSize if you deploy multiple app instances.
const CLIENT_OPTIONS = {
  maxPoolSize: 20,
  minPoolSize: 2,
  maxIdleTimeMS: 60_000,
  connectTimeoutMS: 5_000,
  socketTimeoutMS: 30_000,
  serverSelectionTimeoutMS: 5_000,
  retryWrites: true,
  retryReads: true,
  w: "majority",
} as const;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  // Memoized one-shot promises — stored on global so dev HMR module re-evals don't
  // reset them and cause duplicate seeds / backfills within the same server process.
  var _seedPromise: Promise<void> | undefined;
  var _normalizePromise: Promise<void> | undefined;
  var _backfillPromise: Promise<void> | undefined;
}

// Reuse the client across dev-server hot reloads so connections don't pile up.
const clientPromise: Promise<MongoClient> =
  global._mongoClientPromise ?? new MongoClient(uri, CLIENT_OPTIONS).connect();
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

export async function getCategoriesCollection() {
  return (await getDb()).collection<Category & { _id: string }>("categories");
}

export async function getMovementsCollection() {
  return (await getDb()).collection<StoredStockMovement>("stock_movements");
}

export async function getExpensesCollection() {
  return (await getDb()).collection<StoredExpense>("expenses");
}

export async function getPurchasesCollection() {
  return (await getDb()).collection<StoredPurchase>("purchases");
}

export async function getSuppliersCollection() {
  return (await getDb()).collection<StoredSupplier>("suppliers");
}

export async function getSupplierPaymentsCollection() {
  return (await getDb()).collection<StoredSupplierPayment>("supplier_payments");
}

export async function getTransfersCollection() {
  return (await getDb()).collection<StoredStockTransfer>("stock_transfers");
}

export async function getCustomersCollection() {
  return (await getDb()).collection<StoredCustomer>("customers");
}

export async function getCustomerPaymentsCollection() {
  return (await getDb()).collection<StoredCustomerPayment>("customer_payments");
}

export async function getRecurringExpensesCollection() {
  return (await getDb()).collection<StoredRecurringExpense>("recurring_expenses");
}

export async function getRegisterShiftsCollection() {
  return (await getDb()).collection<StoredRegisterShift>("register_shifts");
}

export async function getCashMovementsCollection() {
  return (await getDb()).collection<StoredCashMovement>("cash_movements");
}

const DEFAULT_SETTINGS: StoreSettings = {
  name: "StoreGenz",
  location: "Phnom Penh",
  receiptFooter: "Thank you for shopping with us!",
  currency: "$",
  paymentMethods: [
    { name: "Cash", enabled: true },
    { name: "ABA Pay", enabled: true },
    { name: "Credit", enabled: true },
  ],
};

export async function getSettingsCollection() {
  return (await getDb()).collection<StoredSettings>("settings");
}

/** Reads the single settings doc, creating the default one on first access. */
export async function readSettings(): Promise<StoreSettings> {
  const settings = await getSettingsCollection();
  const existing = await settings.findOne({ _id: "settings" });
  if (existing) {
    return {
      name: existing.name,
      location: existing.location,
      receiptFooter: existing.receiptFooter,
      currency: existing.currency,
      // Docs written before payment methods existed fall back to the defaults.
      paymentMethods: existing.paymentMethods ?? DEFAULT_SETTINGS.paymentMethods,
    };
  }
  const doc = { _id: "settings" as const, ...DEFAULT_SETTINGS };
  await settings.insertOne(doc);
  return DEFAULT_SETTINGS;
}

/** Advances an ISO date by one frequency period. Weekly +7d; monthly clamps day-of-month (Jan 31 → Feb 28). */
export function nextOccurrence(iso: string, frequency: "weekly" | "monthly"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  if (frequency === "weekly") {
    d.setUTCDate(d.getUTCDate() + 7);
  } else {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, lastDay));
  }
  return d.toISOString();
}

/**
 * Generates due recurring expenses (managers' rent/utilities etc.) exactly once each:
 * every generated expense is a separate EXP doc tagged with recurringId, and the
 * schedule's nextRun advances past each occurrence. Safe to run repeatedly — a
 * second run with the same nextRun generates nothing.
 */
export async function runDueRecurringExpenses(): Promise<number> {
  await ensureSeeded();
  const recurrings = await getRecurringExpensesCollection();
  const expenses = await getExpensesCollection();
  const now = new Date().toISOString();
  let generated = 0;
  const due = await recurrings.find({ active: true, nextRun: { $lte: now } }).toArray();
  for (const r of due) {
    // Catch-up: generate every missed occurrence up to today (bounded).
    let cursor = r.nextRun;
    for (let i = 0; i < 60 && cursor <= now; i++) {
      const newest = await expenses.find({ id: /^EXP-/ }).sort({ _id: -1 }).limit(1).next();
      const n = newest ? parseInt(newest.id.slice(4), 10) + 1 : 1;
      const id = `EXP-${String(n).padStart(4, "0")}`;
      await expenses.insertOne({
        _id: id, id, date: cursor, category: r.category, amount: r.amount,
        note: `${r.note || r.category} (recurring ${r.id})`,
        createdBy: r.createdBy, createdAt: now, recurringId: r.id,
      });
      generated++;
      const next = nextOccurrence(cursor, r.frequency);
      cursor = next;
      await recurrings.updateOne({ id: r.id }, { $set: { nextRun: next, lastRun: cursor <= now ? next : cursor } });
    }
  }
  return generated;
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
export async function checkCredentials(
  name: string,
  pin: string,
): Promise<{ ok: true; profile: PublicStaff } | { ok: false; status: number; message: string }> {
  const doc = await getStaffCollection().then(c => c.findOne({ _id: name }));
  if (!doc || doc.pin !== pin)
    return { ok: false, status: 401, message: "Invalid staff name or PIN." };
  if (doc.status !== "Active")
    return {
      ok: false,
      status: 403,
      message: "This account is inactive. Ask an administrator to reactivate it.",
    };
  return {
    ok: true,
    profile: { name: doc.name, role: doc.role, permissions: doc.permissions, status: doc.status },
  };
}

/** Resolves the request's cookie session to the signed-in profile, or null. */
export async function readSession(request: Request): Promise<SessionProfile | null> {
  const token = readSessionToken(request);
  if (!token) return null;
  const session = await getSessionsCollection().then(c => c.findOne({ _id: token }));
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;
  const doc = await getStaffCollection().then(c => c.findOne({ _id: session.staffId }));
  if (!doc || doc.status !== "Active") return null;
  return {
    name: doc.name,
    role: doc.role,
    permissions: doc.permissions,
    status: doc.status,
    signedInAt: session.createdAt,
  };
}

/** Deletes the request's session (logout) if it has one. */
export async function deleteSession(request: Request): Promise<void> {
  const token = readSessionToken(request);
  if (token) await getSessionsCollection().then(c => c.deleteOne({ _id: token }));
}

/** Creates a new 30-day session for the staff member and returns its token. */
export async function createSession(staffId: string): Promise<string> {
  const token = crypto.randomUUID();
  await getSessionsCollection().then(c =>
    c.insertOne({
      _id: token,
      staffId,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    }),
  );
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
  const fail = (status: number, message: string): never => {
    throw Object.assign(new Error(message), { status });
  };
  if (readSessionToken(request)) {
    const viaSession = await readSession(request);
    if (viaSession) {
      if (ROLE_RANK[viaSession.role] < ROLE_RANK[minRole])
        fail(403, `Requires ${minRole} role or higher.`);
      return viaSession.name;
    }
  }
  const name = request.headers.get("x-staff-name") ?? "";
  const pin = request.headers.get("x-staff-pin") ?? "";
  if (!name || !pin) fail(401, "Sign in to make changes.");
  const doc = await getStaffCollection().then(c => c.findOne({ _id: name }));
  if (doc === null || doc.pin !== pin) return fail(401, "Invalid staff name or PIN.");
  if (doc.status !== "Active") return fail(403, "This account is inactive.");
  if (ROLE_RANK[doc.role] < ROLE_RANK[minRole])
    return fail(403, `Requires ${minRole} role or higher.`);
  return doc.name;
}

/**
 * Idempotent seed + index setup. Memoized on global so dev HMR module re-evals
 * don't reset the flag and cause duplicate seeds within the same server process.
 */
export function ensureSeeded(): Promise<void> {
  global._seedPromise ??= (async () => {
    const db = await getDb();
    const products = db.collection<StoredProduct>("products");
    const sales = db.collection<StoredSale>("sales");
    const staff = db.collection<StoredStaff>("staff");
    const sessions = db.collection<StoredSession>("sessions");

    // Products created before cost existed read as cost 0 — profit counts them at
    // zero cost rather than failing.
    await products.updateMany({ cost: { $exists: false } }, { $set: { cost: 0 } });

    // Staff created before PINs existed get a default PIN so they can still sign in.
    await staff.updateMany({ pin: { $exists: false } }, { $set: { pin: "1234" } });

    // Indexes — kept in sync with the full set in scripts/init-db.js.
    // products: category filter
    await products.createIndex({ category: 1 }, { name: "category_1" });
    // sales: newest-first list, status+date for filtered queries, customer/staff search
    await sales.createIndex({ createdAt: -1 }, { name: "createdAt_-1" });
    await sales.createIndex({ status: 1, createdAt: -1 }, { name: "status_1_createdAt_-1" });
    await sales.createIndex({ customer: 1 }, { name: "customer_1" });
    await sales.createIndex({ servedBy: 1, createdAt: -1 }, { name: "servedBy_1_createdAt_-1" });
    // sessions: TTL — Mongo auto-deletes expired sessions on its own schedule
    await sessions.createIndex({ expiresAt: 1 }, { name: "expiresAt_1", expireAfterSeconds: 0 });

    // Seed the categories taxonomy from whatever the catalog already uses so the
    // Categories collection starts consistent with live products.
    const categories = db.collection<Category & { _id: string }>("categories");
    // Bootstrap the movement ledger: one 'seed' entry per product representing
    // stock at ledger creation, so Stock Count's ledger-net matches current stock
    // and every later change is explainable.
    const movements = db.collection<StoredStockMovement>("stock_movements");
    if ((await movements.countDocuments()) === 0) {
      const now = new Date().toISOString();
      const stockDocs = await products.find({ stock: { $gt: 0 } }, { projection: { name: 1, stock: 1 } }).toArray();
      if (stockDocs.length) await movements.insertMany(stockDocs.map(p => ({
        _id: `seed-${p._id}`,
        sku: p._id, productName: p.name, delta: p.stock,
        reason: "seed" as const, note: "Initial stock at ledger creation",
        by: "system", refId: "", createdAt: now,
      })));
    }
    if ((await categories.countDocuments()) === 0) {
      const used = await products.aggregate<{ _id: string }>([{ $group: { _id: "$category" } }]).toArray();
      const now = new Date().toISOString();
      const docs: Category[] = used
        .map(u => u._id)
        .filter((n): n is string => !!n)
        .sort((a, b) => a.localeCompare(b))
        .map((name, i) => ({
          id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          name, parentId: null, description: "", status: "Active" as const,
          sortOrder: i * 10, createdBy: "system", createdAt: now, updatedAt: now,
        }));
      if (docs.length) await categories.insertMany(docs.map(d => ({ ...d, _id: d.id })));
    }

    // Seed suppliers from real PO history: one record per distinct supplier name
    // seen on a purchase order, so existing POs attach to the new module instantly.
    const supColl = db.collection<StoredSupplier>("suppliers");
    if ((await supColl.countDocuments()) === 0) {
      const poNames = await db.collection<StoredPurchase>("purchases").aggregate<{ _id: string }>([{ $group: { _id: "$supplier" } }]).toArray();
      const now = new Date().toISOString();
      const docs = poNames.map(u => u._id).filter((n): n is string => !!n && n.trim().length > 0)
        .sort((a, b) => a.localeCompare(b))
        .map((name, i) => ({
          id: `SUP-${String(i + 1).padStart(4, "0")}`,
          name, phone: "", email: "", address: "", group: "Default", note: "Seeded from purchase-order history",
          createdBy: "system", createdAt: now, updatedAt: now,
        }));
      if (docs.length) await supColl.insertMany(docs.map(d => ({ ...d, _id: d.id })));
    }

    // Seed customers from real sales history: one record per distinct customer
    // name ("Walk-in customer" excluded), loyalty points from their paid sales.
    const custColl = db.collection<StoredCustomer>("customers");
    if ((await custColl.countDocuments()) === 0) {
      const byName = await sales.aggregate<{ _id: string; total: number }>([
        { $match: { customer: { $exists: true, $nin: ["", "Walk-in customer"] }, status: "Paid" } },
        { $group: { _id: "$customer", total: { $sum: "$saleTotal" } } },
      ]).toArray();
      const now = new Date().toISOString();
      const docs = byName
        .filter(u => u._id && String(u._id).trim().length > 0)
        .sort((a, b) => String(a._id).localeCompare(String(b._id)))
        .map((u, i) => ({
          id: `CUS-${String(i + 1).padStart(4, "0")}`,
          name: String(u._id), phone: "", email: "", address: "", group: "Default",
          loyaltyPoints: Math.floor(u.total),
          note: "Seeded from sales history",
          createdBy: "system", createdAt: now, updatedAt: now,
        }));
      if (docs.length) await custColl.insertMany(docs.map(d => ({ ...d, _id: d.id })));
    }

    if ((await staff.countDocuments()) === 0) {
      const seedStaff: (StaffMember & { pin: string })[] = [
        { name: "Sokha P.", role: "Administrator", permissions: "Full access", status: "Active", pin: "1111" },
        { name: "Dara K.", role: "Manager", permissions: "POS + inventory", status: "Active", pin: "2222" },
        { name: "Mony S.", role: "Cashier", permissions: "POS access", status: "Active", pin: "3333" },
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
        { name: "Laundry Detergent 1kg", sku: "SKU-00783", category: "Household", price: 4.75, cost: 3.4, stock: 18 },
      ];
      await products.insertMany(seedProducts.map(p => ({ ...p, _id: p.sku })));
    }

    if ((await sales.countDocuments()) === 0) {
      // Each line snapshots the product's unit cost at sale time so historical profit
      // stays stable even after the catalog's cost is edited.
      const mk = (name: string, sku: string, price: number, cost: number, qty: number) => ({
        name, sku, price, cost, qty,
      });
      const rice  = (qty: number) => mk("Premium Jasmine Rice 5kg",   "SKU-09231", 12.5, 9.8,  qty);
      const water = (qty: number) => mk("Angkor Mineral Water 1.5L",  "SKU-00419",  0.5, 0.28, qty);
      const sugar = (qty: number) => mk("Palm Sugar 500g",            "SKU-00555",  3.2, 2.1,  qty);
      const beer  = (qty: number) => mk("Cambodia Beer Can 330ml",    "SKU-00128",  1.25, 0.8,  qty);
      const seed = (
        id: string, customer: string, date: string, payment: string,
        status: SaleStatus, servedBy: string, discount: number,
        lines: ReturnType<typeof mk>[], createdAt: Date,
      ) => ({
        id, customer, date, payment, status, servedBy, discount, lines, createdAt,
        saleTotal: Math.round((lines.reduce((sum, l) => sum + l.price * l.qty, 0) - discount) * 100) / 100,
      });
      const now = Date.now();
      const hoursAgo = (h: number) => new Date(now - h * 3_600_000);
      const daysAgo  = (d: number, h = 0) => hoursAgo(d * 24 + h);
      const seedSales: (Sale & { createdAt: Date; saleTotal: number })[] = [
        seed("#INV-1048", "Sokha Trading",    "Today, 10:42 AM",      "Cash",   "Paid",     "Sokha P.", 0,   [rice(16), water(96)],          hoursAgo(2)),
        seed("#INV-1047", "Dara Market",      "Today, 10:15 AM",      "ABA Pay","Paid",     "Dara K.",  2,   [sugar(25), water(13)],         hoursAgo(5)),
        seed("#INV-1046", "Walk-in customer", "Today, 09:58 AM",      "Cash",   "Paid",     "Mony S.",  0,   [beer(12), rice(2), water(4)],  hoursAgo(8)),
        seed("#INV-1045", "Srey Mom",         "Yesterday, 04:28 PM",  "Credit", "Pending",  "Mony S.",  0,   [rice(10)],                     daysAgo(1, 3)),
        seed("#INV-1044", "Vichea Mart",      "Yesterday, 02:10 PM",  "Cash",   "Refunded", "Dara K.",  0,   [rice(1)],                      daysAgo(1, 6)),
        seed("#INV-1043", "Rotha Shop",       "2 days ago",           "Cash",   "Paid",     "Dara K.",  1.5, [sugar(8), beer(6)],            daysAgo(2, 2)),
        seed("#INV-1042", "Walk-in customer", "3 days ago",           "ABA Pay","Paid",     "Mony S.",  0,   [water(40)],                    daysAgo(3, 4)),
        seed("#INV-1041", "Chan Mart",        "4 days ago",           "Cash",   "Paid",     "Dara K.",  0,   [rice(3), sugar(12)],           daysAgo(4, 5)),
        seed("#INV-1040", "Sokha Trading",    "5 days ago",           "Credit", "Paid",     "Sokha P.", 0,   [beer(24)],                     daysAgo(5, 6)),
        // Prior-week sales to feed the vs-last-week KPIs on the dashboard.
        seed("#INV-1039", "Dara Market",  "Last week", "Cash",   "Paid", "Mony S.", 0, [rice(12), water(60)],   daysAgo(9,  3)),
        seed("#INV-1038", "Vichea Mart",  "Last week", "ABA Pay","Paid", "Dara K.", 0, [sugar(18), beer(10)],   daysAgo(10, 5)),
        seed("#INV-1037", "Rotha Shop",   "Last week", "Cash",   "Paid", "Mony S.", 0, [water(80)],             daysAgo(11, 2)),
      ];
      await sales.insertMany(seedSales.map(s => ({ ...s, _id: s.id })));
    }
  })();
  return global._seedPromise;
}

/**
 * Backfill for sales written before the analytics fields existed: legacy docs get
 * discount 0, saleTotal derived from their lines, and cost 0 per line (unknown →
 * profit counts 0, never negative). Idempotent; memoized on global so the migration
 * rescan runs at most once per server lifetime, not per request.
 */
export function normalizeLegacySales(): Promise<void> {
  global._normalizePromise ??= (async () => {
    const sales = await getSalesCollection();
    const legacy = await sales
      .find({
        $or: [
          { discount: { $exists: false } },
          { saleTotal: { $exists: false } },
          { "lines.cost": { $exists: false } },
        ],
      })
      .limit(500)
      .toArray();
    for (const s of legacy) {
      const subtotal = Math.round(s.lines.reduce((sum, l) => sum + l.price * l.qty, 0) * 100) / 100;
      const patch: Record<string, unknown> = {};
      if (s.discount === undefined) patch.discount = 0;
      if (s.saleTotal === undefined) patch.saleTotal = subtotal;
      if (s.lines.some(l => l.cost === undefined)) patch.lines = s.lines.map(l => ({ ...l, cost: 0 }));
      if (Object.keys(patch).length > 0) await sales.updateOne({ _id: s._id }, { $set: patch });
    }
  })();
  return global._normalizePromise;
}

/**
 * Backfill for sales written before createdAt existed: derive a timestamp from the
 * display date ("Today", "Yesterday", "N days ago", else ordered fallback).
 * Legacy documents get spread across the recent past so they land in sensible buckets.
 */
export function backfillCreatedAt(): Promise<void> {
  global._backfillPromise ??= (async () => {
    const sales = await getSalesCollection();
    const legacy = await sales
      .find({ createdAt: { $exists: false } })
      .sort({ _id: -1 })
      .toArray();
    if (legacy.length === 0) return;
    const now = Date.now();
    let seq = 0;
    for (const s of legacy) {
      let ageHours = seq * 2; // fallback: newest doc most recent, older ones step back
      if (/^today/i.test(s.date)) ageHours = 3;
      else if (/^yesterday/i.test(s.date)) ageHours = 24 + 3;
      else {
        const m = s.date.match(/^(\d+)\s+days?\s+ago/i);
        if (m) ageHours = Number(m[1]) * 24 + 3;
      }
      await sales.updateOne(
        { _id: s._id },
        { $set: { createdAt: new Date(now - (ageHours + seq * 0.5) * 3_600_000) } },
      );
      seq++;
    }
  })();
  return global._backfillPromise;
}
