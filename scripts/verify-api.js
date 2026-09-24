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
 * │ cookie session         │ no session → 401 · bad PIN → 401/no cookie │
 * │                        │ login → Set-Cookie · whoami · role gate 403│
 * │                        │ logout → Max-Age=0 · session then invalid   │
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
const PAY_SKU = "SKU-CONTRACT-PAY";

let failures = 0;
const req = (path, method, headers, body) =>
  fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });

/** Cookie-session state for the /api/auth/session contract block. */
let cookie = null;
const cookieReq = (path, method, body) =>
  fetch(BASE + path, { method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
const takeCookie = res => {
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
};

/** cases: [name, path, method, headers, body, expectStatus, expectBody?] */
const CASES = [
  // login (header probe)
  ["login rejects wrong PIN", "/api/auth/login", "POST", H_CASHIER, { name: "Mony S.", pin: "9999" }, 401],
  ["login rejects unknown staff", "/api/auth/login", "POST", H_CASHIER, { name: "Nobody", pin: "1111" }, 401],
  ["login accepts valid staff", "/api/auth/login", "POST", H_CASHIER, { name: "Mony S.", pin: "3333" }, 200, b => b.name === "Mony S." && b.role === "Cashier"],
  // sale validation boundaries
  ["sale rejects empty lines", "/api/sales", "POST", H, { lines: [] }, 400],
  ["sale rejects qty 0", "/api/sales", "POST", H, { lines: [{ sku: SKU, qty: 0 }] }, 400],
  ["sale rejects fractional qty", "/api/sales", "POST", H, { lines: [{ sku: SKU, qty: 1.5 }] }, 400],
  ["sale rejects non-numeric qty", "/api/sales", "POST", H, { lines: [{ sku: SKU, qty: "x" }] }, 400],
  ["sale rejects unknown SKU", "/api/sales", "POST", H, { lines: [{ sku: "SKU-NOPE", qty: 1 }] }, 404],
  // payment form fields (own scratch product so the boundary block below starts pristine)
  ["sale defaults customer/payment when omitted", "/api/sales", "POST", H, { lines: [{ sku: PAY_SKU, qty: 1 }] }, 201, b => b.customer === "Walk-in customer" && b.payment === "Cash"],
  ["sale rejects unknown payment method", "/api/sales", "POST", H, { lines: [{ sku: PAY_SKU, qty: 1 }], payment: "Bitcoin" }, 400],
  // discount semantics (price 1 × qty 1 → subtotal 1.00)
  ["sale without discount reports discount 0", "/api/sales", "POST", H, { lines: [{ sku: PAY_SKU, qty: 1 }] }, 201, b => b.discount === 0 && b.saleTotal === 1],
  ["sale applies discount to saleTotal", "/api/sales", "POST", H, { lines: [{ sku: PAY_SKU, qty: 2 }], discount: 0.5 }, 201, b => b.discount === 0.5 && b.saleTotal === 1.5],
  ["sale rejects negative discount", "/api/sales", "POST", H, { lines: [{ sku: PAY_SKU, qty: 1 }], discount: -1 }, 400],
  ["sale rejects non-numeric discount", "/api/sales", "POST", H, { lines: [{ sku: PAY_SKU, qty: 1 }], discount: "x" }, 400],
  ["sale rejects discount covering the whole subtotal", "/api/sales", "POST", H, { lines: [{ sku: PAY_SKU, qty: 1 }], discount: 99 }, 400],
  ["sale snapshots line cost from catalog", "/api/sales", "POST", H, { lines: [{ sku: PAY_SKU, qty: 1 }] }, 201, b => b.lines.length === 1 && b.lines[0].cost === 0.25],
  ["discounted cash sale computes change on net", "/api/sales", "POST", H, { lines: [{ sku: PAY_SKU, qty: 1 }], discount: 0.25, amountPaid: 5 }, 201, b => b.saleTotal === 0.75 && b.changeDue === 4.25],
  ["sale rejects cash short of total", "/api/sales", "POST", H, { lines: [{ sku: PAY_SKU, qty: 1 }], payment: "Cash", amountPaid: 0.5 }, 400],
  ["sale computes change server-side", "/api/sales", "POST", H, { lines: [{ sku: PAY_SKU, qty: 1 }], customer: "Contract Buyer", payment: "Cash", amountPaid: 5 }, 201, b => b.amountPaid === 5 && b.changeDue === 4 && b.customer === "Contract Buyer"],
  ["non-cash sale rejects amountPaid", "/api/sales", "POST", H, { lines: [{ sku: PAY_SKU, qty: 1 }], payment: "ABA Pay", amountPaid: 99 }, 400],
  ["sale rejects negative amountPaid", "/api/sales", "POST", H, { lines: [{ sku: PAY_SKU, qty: 1 }], payment: "Cash", amountPaid: -1 }, 400],
  // auth on mutations
  ["sale without auth is rejected", "/api/sales", "POST", { "Content-Type": "application/json" }, { lines: [{ sku: SKU, qty: 1 }] }, 401],
  ["cashier cannot add products", "/api/products", "POST", H_CASHIER, { name: "Nope", sku: "SKU-NOPE2", category: "T", price: 1, stock: 1 }, 403],
  // stock boundary: exact stock sells, one more is rejected atomically
  ["sale at exact stock succeeds", "/api/sales", "POST", H, { lines: [{ sku: SKU, qty: 5 }] }, 201],
  ["sale one over stock is rejected", "/api/sales", "POST", H, { lines: [{ sku: SKU, qty: 1 }] }, 409],
  // refund lifecycle (the @last sale above is the one refunded)
  ["refund of paid sale succeeds", "/api/sales/@last", "PATCH", H, { reason: "contract" }, 200],
  ["second refund is a conflict", "/api/sales/@last", "PATCH", H, { reason: "again" }, 409],
  ["refund without auth is rejected", "/api/sales/@last", "PATCH", { "Content-Type": "application/json" }, { reason: "nope" }, 401],
];

/** Server-pagination contract for GET /api/sales (runs after the table, before cleanup). */
async function runPaginationBlock() {
  const check = (name, ok, detail) => { console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; };
  const get = async qs => { const r = await fetch(`${BASE}/api/sales${qs}`); return { status: r.status, body: await r.json().catch(() => ({})) }; };

  let res = await get("?page=1&limit=5");
  check("pagination envelope has total/pages", res.status === 200 && Array.isArray(res.body.sales) && typeof res.body.total === "number" && typeof res.body.pages === "number", `total=${res.body.total} pages=${res.body.pages}`);
  const total = res.body.total;
  const firstPage = res.body.sales;
  check("page size is respected", firstPage.length <= 5, `got ${firstPage.length}`);

  const res2 = await get("?page=2&limit=5");
  check("page 2 differs from page 1", res2.body.sales.length > 0 && res2.body.sales[0].id !== firstPage[0].id, `${res2.body.sales[0]?.id} vs ${firstPage[0]?.id}`);
  check("pages clamp past the end", (await get(`?page=9999&limit=5`)).body.page <= Math.max(1, Math.ceil(total / 5)));

  res = await get("?limit=0");
  check("limit 0 falls back to default", res.body.sales.length > 0 && res.body.limit >= 1, `limit=${res.body.limit}`);
  res = await get("?limit=-5");
  check("negative limit is clamped", res.status === 200 && res.body.limit >= 1, `limit=${res.body.limit}`);
  res = await get("?limit=100000");
  check("limit caps at max", res.body.limit <= 100, `limit=${res.body.limit}`);

  res = await get(`?q=${encodeURIComponent("#INV-")}`);
  check("q search matches invoice prefix", res.status === 200 && res.body.total > 0 && res.body.sales.every(s => /inv/i.test(s.id)), `total=${res.body.total}`);
  const known = await get("?limit=1");
  const cust = known.body.sales[0]?.customer ?? "";
  if (cust) {
    const byCust = await get(`?q=${encodeURIComponent(cust)}`);
    check("q search matches customer", byCust.body.total > 0 && byCust.body.sales.every(s => `${s.id} ${s.customer}`.toLowerCase().includes(cust.toLowerCase())), `customer="${cust}" total=${byCust.body.total}`);
  }
  res = await get(`?q=${encodeURIComponent("Contract Widget(")}`);
  check("regex metacharacters are matched literally", res.status === 200 && res.body.total === 0, `total=${res.body.total}`);

  res = await get("?all=1");
  check("all=1 returns legacy array", res.status === 200 && Array.isArray(res.body), `length=${Array.isArray(res.body) ? res.body.length : "-"}`);
  res = await get("?all=1&q=zzz-no-match");
  check("all=1 respects q filter", Array.isArray(res.body) && res.body.length === 0);

  // Sorting: newest first
  const sorted = await get("?page=1&limit=3");
  const ids = sorted.body.sales.map(s => parseInt(s.id.slice(5), 10));
  check("results sort newest-first", ids.every((n, i) => i === 0 || ids[i - 1] >= n), ids.join(","));
}

/** Cookie-session block: runs before the header-table (POST also arms the cookie). */
async function runSessionBlock() {
  const check = (name, ok, detail) => { console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; };

  let res = await cookieReq("/api/auth/session", "GET");
  check("whoami without a session is rejected", res.status === 401, `got ${res.status}`);

  res = await cookieReq("/api/auth/session", "POST", { name: "Mony S.", pin: "9999" });
  check("cookie login rejects wrong PIN (401, no cookie set)", res.status === 401 && !res.headers.get("set-cookie"), `got ${res.status}`);

  res = await cookieReq("/api/auth/session", "POST", { name: "Mony S.", pin: "3333" });
  const body = await res.json().catch(() => ({}));
  check("cookie login returns profile and sets HttpOnly cookie", res.status === 200 && body.role === "Cashier" && /HttpOnly/i.test(res.headers.get("set-cookie") ?? ""), `got ${res.status}, role=${body.role}`);
  takeCookie(res);

  res = await cookieReq("/api/auth/session", "GET");
  const who = await res.json().catch(() => ({}));
  check("whoami resolves the session cookie", res.status === 200 && who.name === "Mony S." && who.role === "Cashier", `got ${res.status}, name=${who.name}`);

  res = await cookieReq("/api/products", "POST", { name: "Nope", sku: "SKU-NOPE3", category: "T", price: 1, stock: 1 });
  check("cookie session drives a role-gated mutation (cashier add → 403)", res.status === 403, `got ${res.status}`);

  res = await cookieReq("/api/auth/session", "DELETE");
  check("logout deletes the session and expires the cookie", res.status === 200 && /Max-Age=0/.test(res.headers.get("set-cookie") ?? ""), `got ${res.status}`);
  takeCookie(res);

  res = await cookieReq("/api/auth/session", "GET");
  check("session is invalid after logout", res.status === 401, `got ${res.status}`);
}

async function main() {
  await runSessionBlock();
  await runPaginationBlock();

  // setup: scratch product with stock 5, sold through the boundary cases;
  // a second product with stock 10 hosts the payment-form cases
  const made = await req("/api/products", "POST", H, { name: "Contract Widget", sku: SKU, category: "Test", price: 1, stock: 5 });
  if (!made.ok) throw new Error(`setup failed: ${await made.text()}`);
  const madePay = await req("/api/products", "POST", H, { name: "Contract Pay Widget", sku: PAY_SKU, category: "Test", price: 1, cost: 0.25, stock: 10 });
  if (!madePay.ok) throw new Error(`setup (pay product) failed: ${await madePay.text()}`);
  const idByIndex = [];

  for (const [name, path, method, headers, body, expectStatus, expectBody] of CASES) {
    const lastSale = idByIndex[idByIndex.length - 1];
    const resolved = path.replace("@last", encodeURIComponent(lastSale ?? "UNKNOWN"));
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

  // cleanup: scratch products + every sale that touched either
  await req(`/api/products/${SKU}`, "DELETE", H);
  await req(`/api/products/${PAY_SKU}`, "DELETE", H);
  const c2 = new MongoClient(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/storegenz");
  await c2.connect();
  const removed = await c2.db().collection("sales").deleteMany({ "lines.sku": { $in: [SKU, PAY_SKU] } });
  await c2.close();
  console.log(`cleanup: scratch product + ${removed.deletedCount} sale(s) removed`);

  if (failures > 0) { console.error(`\nFAILED: ${failures} case(s).`); process.exit(1); }
  console.log("\nPASSED: API contract holds.");
}

main().catch(e => { console.error("verify-api failed:", e.message); process.exit(1); });
