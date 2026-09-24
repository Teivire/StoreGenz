#!/usr/bin/env node
/**
 * Concurrency regression check for the sales and refund endpoints.
 * Races the real HTTP API and asserts the money-critical invariants in MongoDB:
 *
 *   1. Concurrent checkouts of the same product produce distinct invoice numbers
 *      and decrement stock by exactly the total quantity sold (no lost or leaked
 *      decrements — the retry-on-duplicate-key path).
 *   2. Concurrent refunds of the SAME sale flip it once (one 200, rest 409) and
 *      restock exactly once (the atomic one-way transition).
 *
 * Everything runs against a scratch product + its own sale, so live data is
 * never touched. Run with the dev server up:
 *
 *   npm run verify-concurrency
 *
 * Env: BASE_URL (default http://localhost:3000), STAFF_NAME / STAFF_PIN
 * (default Sokha P. / 1111 — requires a Manager+ account: it adds a product).
 */
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const STAFF_NAME = process.env.STAFF_NAME || "Sokha P.";
const STAFF_PIN = process.env.STAFF_PIN || "1111";
// 1x1 PNG — the smallest valid image the API accepts, so the scratch product
// can be created through the normal POST /api/products path.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

function resolveUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const envPath = path.join(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*MONGODB_URI\s*=\s*(.+)\s*$/);
      if (m) return m[1].trim();
    }
  }
  return "mongodb://127.0.0.1:27017/storegenz";
}

const headers = { "Content-Type": "application/json", "X-Staff-Name": STAFF_NAME, "X-Staff-Pin": STAFF_PIN };
const post = (p, body) => fetch(BASE + p, { method: "POST", headers, body: JSON.stringify(body) });
const patch = (p, body) => fetch(BASE + p, { method: "PATCH", headers, body: JSON.stringify(body) });

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  const uri = resolveUri();
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  const products = db.collection("products");
  const sales = db.collection("sales");

  const sku = "SKU-RACECHK";
  console.log(`verify-concurrency against ${BASE} (db: ${client.db().databaseName})`);

  // --- setup: scratch product with known stock ---
  await products.deleteOne({ _id: sku });
  const made = await post("/api/products", { name: "Race Check Widget", sku, category: "Test", price: 2, stock: 10 });
  if (!made.ok) throw new Error(`could not create scratch product: ${await made.text()}`);
  // If the server was already running before this script seeded anything, its
  // cached catalog is stale — refresh it by touching nothing; POST resolves
  // prices from the DB directly, so no explicit warmup is needed.

  try {
    // --- race 1: 3 concurrent checkouts of qty 2 each (stock 10 → 4) ---
    const responses = await Promise.all([post("/api/sales", { lines: [{ sku, qty: 2 }] }), post("/api/sales", { lines: [{ sku, qty: 2 }] }), post("/api/sales", { lines: [{ sku, qty: 2 }] })]);
    const statuses = responses.map(r => r.status);
    const created = responses.filter(r => r.ok);
    const ids = [];
    for (const r of created) ids.push((await r.json()).id);

    check("all 3 concurrent checkouts succeed", statuses.every(s => s === 201), `statuses=${statuses}`);
    check("invoice numbers are distinct", new Set(ids).size === ids.length, ids.join(", "));

    const afterSales = await products.findOne({ _id: sku });
    check("stock decremented by exactly 6", afterSales.stock === 4, `stock=${afterSales.stock} (expected 4)`);

    // --- race 2: refund ONE of those sales concurrently from 3 clients ---
    const target = ids[0];
    const refundRes = await Promise.all([patch(`/api/sales/${encodeURIComponent(target)}`, { reason: "race check" }), patch(`/api/sales/${encodeURIComponent(target)}`, { reason: "race check" }), patch(`/api/sales/${encodeURIComponent(target)}`, { reason: "race check" })]);
    const refundStatuses = refundRes.map(r => r.status).sort();
    check("exactly one refund wins", refundStatuses[0] === 200 && refundStatuses[1] === 409 && refundStatuses[2] === 409, `statuses=${refundStatuses.join(", ")}`);

    const refunded = await sales.findOne({ id: target });
    check("sale flipped to Refunded exactly once", refunded.status === "Refunded", `status=${refunded.status}`);

    const afterRefund = await products.findOne({ _id: sku });
    check("stock restocked by exactly 2 (once)", afterRefund.stock === 6, `stock=${afterRefund.stock} (expected 6)`);

    // --- cleanup: remove every sale that touched the scratch SKU, then the product ---
    const del = await fetch(`${BASE}/api/products/${sku}`, { method: "DELETE", headers });
    if (!del.ok) console.warn(`  ! could not delete scratch product via API: ${await del.text()}`);
    const removed = await sales.deleteMany({ "lines.sku": sku });
    // Remove the probe sales' movement entries so the ledger keeps reconciling
    // to current stock (Stock Count nets the ledger per product).
    await db.collection("stock_movements").deleteMany({ sku, reason: { $in: ["sale", "refund"] } });
    const left = await products.findOne({ _id: sku });
    if (left) await products.deleteOne({ _id: sku }); // belt and braces
    console.log(`  cleanup: scratch product + ${removed.deletedCount} probe sale${removed.deletedCount === 1 ? "" : "s"} removed`);
  } finally {
    await client.close();
  }

  if (failures > 0) {
    console.error(`\nFAILED: ${failures} invariant${failures === 1 ? "" : "s"} broken.`);
    process.exit(1);
  }
  console.log("\nPASSED: all concurrency invariants hold.");
}

main().catch(e => { console.error("verify-concurrency failed:", e.message); process.exit(1); });
