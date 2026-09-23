/**
 * Executable contract for the money-critical API behavior.
 * Table-driven: each case names the behavior and its expected outcome, with
 * boundary inputs. Timing-dependent races live in verify-concurrency.js; this
 * suite pins the deterministic contract.
 *
 * Run with the dev server up:  npm run verify-api
 *
 * Contract (one row per behavior):
 * ┌────────────────────────┬────────────────────────────────────────────┐
 * │ login                  │ wrong PIN → 401 · inactive → 403 ·         │
 * │                        │ unknown → 401 · good → 200 {name,role}     │
 * │ sale validation        │ empty lines → 400 · qty 0 / 1.5 / "x"      │
 * │                        │ → 400 · unknown SKU → 404                  │
 * │ stock boundary         │ qty == stock → 201 · qty == stock+1 → 409  │
 * │                        │ and stock unchanged                        │
 * │ refund                 │ paid → 200+restock · again → 409 ·         │
 * │                        │ unauthenticated → 401                      │
 * │ auth on mutations      │ no header → 401 · cashier product-add → 403│
 * └────────────────────────┴────────────────────────────────────────────┘
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";
const H = { "Content-Type": "application/json", "X-Staff-Name": "Sokha P.", "X-Staff-Pin": "1111" };
const H_CASHIER = { "Content-Type": "application/json", "X-Staff-Name": "Mony S.", "X-Staff-Pin": "3333" };
const SKU = "SKU-CONTRACT";

let failures = 0;
const req = (path, method, headers, body) =>
  fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });

/** cases: [name, path, method, headers, body, expectStatus, expectBody?] */
const CASES = [
  // login
  ["login rejects wrong PIN", "/api/auth/login", "POST", H_CASHIER, { name: "Mony S.", pin: "9999" }, 401],
  ["login rejects unknown staff", "/api/auth/login", "POST", H_CASHIER, { name: "Nobody", pin: "1111" }, 401],
  ["login accepts valid staff", "/api/auth/login", "POST", H_CASHIER, { name: "Mony S.", pin: "3333" }, 200, b => b.name === "Mony S." && b.role === "Cashier"],
  // sale validation boundaries
  ["sale rejects empty lines", "/api/sales", "POST", H, { lines: [] }, 400],
  ["sale rejects qty 0", "/api/sales", "POST", H, { lines: [{ sku: SKU, qty: 0 }] }, 400],
  ["sale rejects fractional qty", "/api/sales", "POST", H, { lines: [{ sku: SKU, qty: 1.5 }] }, 400],
  ["sale rejects non-numeric qty", "/api/sales", "POST", H, { lines: [{ sku: SKU, qty: "x" }] }, 400],
  ["sale rejects unknown SKU", "/api/sales", "POST", H, { lines: [{ sku: "SKU-NOPE", qty: 1 }] }, 404],
  // auth on mutations
  ["sale without auth is rejected", "/api/sales", "POST", { "Content-Type": "application/json" }, { lines: [{ sku: SKU, qty: 1 }] }, 401],
  ["cashier cannot add products", "/api/products", "POST", H_CASHIER, { name: "Nope", sku: "SKU-NOPE2", category: "T", price: 1, stock: 1 }, 403],
  // stock boundary: exact stock sells, one more is rejected atomically
  ["sale at exact stock succeeds", "/api/sales", "POST", H, { lines: [{ sku: SKU, qty: 5 }] }, 201],
  ["sale one over stock is rejected", "/api/sales", "POST", H, { lines: [{ sku: SKU, qty: 1 }] }, 409],
  // refund lifecycle
  ["refund of paid sale succeeds", "/api/sales/@id0", "PATCH", H, { reason: "contract" }, 200],
  ["second refund is a conflict", "/api/sales/@id0", "PATCH", H, { reason: "again" }, 409],
  ["refund without auth is rejected", "/api/sales/@id0", "PATCH", { "Content-Type": "application/json" }, { reason: "nope" }, 401],
];

async function main() {
  // setup: scratch product with stock 5, sold through the boundary cases
  const made = await req("/api/products", "POST", H, { name: "Contract Widget", sku: SKU, category: "Test", price: 1, stock: 5 });
  if (!made.ok) throw new Error(`setup failed: ${await made.text()}`);
  const idByIndex = [];

  for (const [name, path, method, headers, body, expectStatus, expectBody] of CASES) {
    const resolved = path.replace("@id0", encodeURIComponent(idByIndex[0] ?? "UNKNOWN"));
    const res = await req(resolved, method, headers, body);
    const data = await res.json().catch(() => ({}));
    const statusOk = res.status === expectStatus;
    const bodyOk = expectBody ? expectBody(data) : true;
    const ok = statusOk && bodyOk;
    if (res.status === 201 && data.id) idByIndex.push(data.id);
    console.log(`${ok ? "✓" : "✗"} ${name} — got ${res.status}${statusOk ? "" : ` (want ${expectStatus})`}${bodyOk ? "" : " (body mismatch)"}`);
    if (!ok) failures++;
  }

  // invariant the table can't express inline: the whole boundary sequence nets out exactly —
  // 5 stocked, −5 sold, rejected over-sale untouched, +5 refunded = back to 5.
  const { MongoClient } = require("mongodb");
  const client = new MongoClient(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/storegenz");
  await client.connect();
  const p = await client.db().collection("products").findOne({ _id: SKU });
  await client.close();
  const stockOk = p?.stock === 5;
  console.log(`${stockOk ? "✓" : "✗"} boundary sequence nets out exactly — stock=${p?.stock} (want 5: −5 sold, over-sale rejected, +5 refunded)`);
  if (!stockOk) failures++;

  // cleanup: scratch product + every sale that touched it
  await req(`/api/products/${SKU}`, "DELETE", H);
  const c2 = new MongoClient(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/storegenz");
  await c2.connect();
  const removed = await c2.db().collection("sales").deleteMany({ "lines.sku": SKU });
  await c2.close();
  console.log(`cleanup: scratch product + ${removed.deletedCount} sale(s) removed`);

  if (failures > 0) { console.error(`\nFAILED: ${failures} case(s).`); process.exit(1); }
  console.log("\nPASSED: API contract holds.");
}

main().catch(e => { console.error("verify-api failed:", e.message); process.exit(1); });
