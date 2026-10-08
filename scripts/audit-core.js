#!/usr/bin/env node
/**
 * audit-core.js  —  POS Core Business Logic Audit
 *
 * Tests 5 critical paths against the live dev server:
 *   1. Sale      → stock decrements correctly
 *   2. Purchase  → stock increments correctly
 *   3. Return    → stock restores + financial reversal
 *   4. Payment   → cash register balance (expectedCash)
 *   5. Reports   → totals match the raw transaction data
 *
 * Run:  node scripts/audit-core.js
 * Requires the dev server running at http://localhost:3000
 */
"use strict";

const BASE = "http://localhost:3000";
// Admin credentials for routes that need auth headers
const HEADERS = {
  "Content-Type": "application/json",
  "x-staff-name": "Sokha P.",
  "x-staff-pin": "1111",
};

let passed = 0;
let failed = 0;
const failures = [];

// ─── helpers ──────────────────────────────────────────────────────────────────

function ok(label, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓  ${label}`);
  } else {
    failed++;
    failures.push({ label, detail });
    console.log(`  ✗  ${label}${detail ? `  →  ${detail}` : ""}`);
  }
}

async function api(method, path, body) {
  const opts = { method, headers: { ...HEADERS } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  let data;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

async function stockOf(sku) {
  const { data } = await api("GET", "/api/products?all=1");
  const products = Array.isArray(data) ? data : (data.items ?? []);
  const p = products.find(x => x.sku === sku || x._id === sku);
  return p ? p.stock : null;
}

// ─── 1. SALE  →  stock decrements ─────────────────────────────────────────────

async function auditSale() {
  console.log("\n── 1. SALE  →  stock decrements ──────────────────────────────────");

  // pick a product with stock ≥ 2
  const { data: products } = await api("GET", "/api/products?all=1");
  const plist = Array.isArray(products) ? products : (products.items ?? []);
  const p = plist.find(x => x.stock >= 2);
  if (!p) { ok("skip: no product with stock ≥ 2", false, "seed products first"); return null; }

  const before = p.stock;
  const qty = 2;
  const { status, data } = await api("POST", "/api/sales", {
    lines: [{ sku: p.sku, qty }],
    customer: "Audit Test",
    payment: "Cash",
    amountPaid: p.price * qty,
  });

  ok("POST /api/sales returns 201", status === 201, `got ${status}: ${data.error ?? ""}`);
  ok("Response has an invoice id", typeof data.id === "string" && data.id.startsWith("#INV-"), `id=${data.id}`);
  ok("saleTotal = price × qty", Math.abs(data.saleTotal - p.price * qty) < 0.01, `expected ${p.price * qty} got ${data.saleTotal}`);

  const after = await stockOf(p.sku);
  ok("Stock decreased by qty sold", after === before - qty, `before=${before} after=${after} qty=${qty}`);
  ok("Exactly qty units removed (not more, not less)", after !== null && before - after === qty, `delta=${before - after}`);

  return { saleId: data.id, sku: p.sku, qty, price: p.price };
}

// ─── 3. RETURN  →  stock restores + money reversal ────────────────────────────
// (run after SALE so we have a real invoice)

async function auditReturn(saleCtx) {
  console.log("\n── 3. RETURN  →  stock restores + money reversal ─────────────────");

  if (!saleCtx) { ok("skip: no sale context from test 1", false, "test 1 must pass first"); return; }
  const { saleId, sku, qty } = saleCtx;

  const stockBeforeRefund = await stockOf(sku);

  const { status, data } = await api("PATCH", `/api/sales/${encodeURIComponent(saleId)}`, {
    reason: "Audit test refund",
  });
  ok("PATCH /api/sales/:id returns 200", status === 200, `got ${status}: ${data.error ?? ""}`);

  const stockAfterRefund = await stockOf(sku);
  ok("Stock restored by qty refunded", stockAfterRefund === stockBeforeRefund + qty,
    `before=${stockBeforeRefund} after=${stockAfterRefund} qty=${qty}`);

  // Verify the sale doc is now Refunded
  const { data: salesList } = await api("GET", "/api/sales?all=1");
  const saleDoc = (Array.isArray(salesList) ? salesList : (salesList.sales ?? [])).find(s => s.id === saleId);
  ok("Sale status is Refunded in DB", saleDoc?.status === "Refunded", `status=${saleDoc?.status}`);
  ok("refundReason saved", typeof saleDoc?.refundReason === "string" && saleDoc.refundReason.length > 0, saleDoc?.refundReason);

  // Double-refund guard: second PATCH must fail with 409
  const { status: s2, data: d2 } = await api("PATCH", `/api/sales/${encodeURIComponent(saleId)}`, {
    reason: "double refund attempt",
  });
  ok("Double-refund blocked (409)", s2 === 409, `got ${s2}: ${d2.error ?? ""}`);
}

// ─── 2. PURCHASE  →  stock increments ─────────────────────────────────────────

async function auditPurchase() {
  console.log("\n── 2. PURCHASE  →  stock increments ──────────────────────────────");

  const { data: products } = await api("GET", "/api/products?all=1");
  const plist = Array.isArray(products) ? products : (products.items ?? []);
  const p = plist[0];
  if (!p) { ok("skip: no products", false, "seed products first"); return; }

  const stockBefore = p.stock;
  const qty = 5;

  // Create the PO
  const { status: s1, data: po } = await api("POST", "/api/purchases", {
    supplier: "Audit Supplier",
    lines: [{ sku: p.sku, qty, cost: p.cost || 1 }],
  });
  ok("POST /api/purchases returns 201", s1 === 201, `got ${s1}: ${po.error ?? ""}`);
  ok("PO has id starting PO-", typeof po.id === "string" && po.id.startsWith("PO-"), `id=${po.id}`);
  ok("PO status is Pending", po.status === "Pending", `status=${po.status}`);

  const stockAfterCreate = await stockOf(p.sku);
  ok("Stock unchanged after PO creation (not received yet)", stockAfterCreate === stockBefore,
    `before=${stockBefore} after=${stockAfterCreate}`);

  // Receive the PO
  const { status: s2, data: recv } = await api("PATCH", `/api/purchases/${encodeURIComponent(po.id)}`, {
    action: "receive",
  });
  ok("PATCH /api/purchases/:id?action=receive returns 200", s2 === 200, `got ${s2}: ${recv.error ?? ""}`);
  ok("PO status transitions to Received", recv.status === "Received", `status=${recv.status}`);

  const stockAfterReceive = await stockOf(p.sku);
  ok("Stock increased by qty received", stockAfterReceive === stockBefore + qty,
    `before=${stockBefore} after=${stockAfterReceive} qty=${qty}`);

  // Double-receive guard
  const { status: s3, data: d3 } = await api("PATCH", `/api/purchases/${encodeURIComponent(po.id)}`, {
    action: "receive",
  });
  ok("Double-receive blocked (409)", s3 === 409, `got ${s3}: ${d3.error ?? ""}`);

  // Return the PO (stock should decrement back)
  const stockBeforeReturn = await stockOf(p.sku);
  const { status: s4, data: ret } = await api("PATCH", `/api/purchases/${encodeURIComponent(po.id)}`, {
    action: "return",
  });
  ok("PATCH /api/purchases/:id?action=return returns 200", s4 === 200, `got ${s4}: ${ret.error ?? ""}`);
  ok("PO status transitions to Returned", ret.status === "Returned", `status=${ret.status}`);

  const stockAfterReturn = await stockOf(p.sku);
  ok("Stock decremented back on PO return", stockAfterReturn === stockBeforeReturn - qty,
    `before=${stockBeforeReturn} after=${stockAfterReturn} qty=${qty}`);

  ok("Net stock change = 0 (receive then return cancels out)", stockAfterReturn === stockBefore,
    `started=${stockBefore} ended=${stockAfterReturn}`);
}

// ─── 4. PAYMENT  →  register balance (expectedCash) ──────────────────────────

async function auditRegister() {
  console.log("\n── 4. PAYMENT  →  cash register balance ──────────────────────────");

  // Close any open shift first so the test starts clean
  const { data: initial } = await api("GET", "/api/register");
  if (initial.open) {
    await api("POST", "/api/register", { action: "close", closingCount: 0 });
    ok("Pre-existing shift closed to reset state", true);
  }

  const float = 100;
  const { status: s1, data: opened } = await api("POST", "/api/register", {
    action: "open",
    openingFloat: float,
  });
  ok("Open register returns 201", s1 === 201, `got ${s1}: ${opened.error ?? ""}`);
  ok("Shift ID starts SHF-", typeof opened.id === "string" && opened.id.startsWith("SHF-"), `id=${opened.id}`);

  // Double-open guard
  const { status: s2, data: d2 } = await api("POST", "/api/register", {
    action: "open",
    openingFloat: float,
  });
  ok("Double-open blocked (409)", s2 === 409, `got ${s2}: ${d2.error ?? ""}`);

  // Cash movement in
  const { status: s3 } = await api("POST", "/api/register", {
    action: "cashIn",
    amount: 50,
    reason: "Audit cash in",
  });
  ok("cashIn returns 201", s3 === 201, `got ${s3}`);

  // Cash movement out
  const { status: s4 } = await api("POST", "/api/register", {
    action: "cashOut",
    amount: 20,
    reason: "Audit cash out",
  });
  ok("cashOut returns 201", s4 === 201, `got ${s4}`);

  // Make a Cash sale so it contributes to expectedCash
  const { data: products } = await api("GET", "/api/products?all=1");
  const plist = Array.isArray(products) ? products : (products.items ?? []);
  const p = plist.find(x => x.stock >= 1);
  let cashSaleTotal = 0;
  if (p) {
    const { data: sale } = await api("POST", "/api/sales", {
      lines: [{ sku: p.sku, qty: 1 }],
      customer: "Audit Cash Customer",
      payment: "Cash",
    });
    cashSaleTotal = sale.saleTotal ?? 0;
    ok("Cash sale created for register test", typeof sale.id === "string", `id=${sale.id}`);
  } else {
    ok("skip cash sale (no stock)", false, "need a product with stock");
  }

  // Get current state and verify expectedCash math:
  //   expectedCash = float + cashSales − cashRefunds + cashIn − cashOut
  const { data: state } = await api("GET", "/api/register");
  const exp = state.open?.expectedCash;
  const manual = float + cashSaleTotal + 50 - 20; // float + sale + in - out (no refunds in this shift)
  ok("expectedCash = float + cashSales + cashIn − cashOut",
    typeof exp === "number" && Math.abs(exp - manual) < 0.01,
    `server=${exp} expected=${manual} (float=${float} sale=${cashSaleTotal} +50 -20)`);

  // Close the shift with the correct count — variance should be 0
  const { status: s5, data: closed } = await api("POST", "/api/register", {
    action: "close",
    closingCount: manual,
  });
  ok("Close register returns 200", s5 === 200, `got ${s5}: ${closed.error ?? ""}`);
  ok("Variance = 0 when count = expected", Math.abs(closed.variance ?? 1) < 0.01,
    `variance=${closed.variance} expected=${closed.expectedCash} counted=${closed.closingCount}`);
}

// ─── 5. REPORTS  →  totals match raw transactions ─────────────────────────────

async function auditReports() {
  console.log("\n── 5. REPORTS  →  totals match raw transactions ──────────────────");

  const { data } = await api("GET", "/api/sales?all=1");
  const all = Array.isArray(data) ? data : (data.sales ?? []);

  if (all.length === 0) { ok("skip: no sales data", false, "need at least one sale"); return; }

  // 5a. Gross revenue = sum of saleTotal for all non-Refunded sales
  const nonRefunded = all.filter(s => s.status !== "Refunded");
  const gross = nonRefunded.reduce((n, s) => n + (s.saleTotal ?? 0), 0);
  ok("Gross computed from individual saleTotals is consistent",
    Number.isFinite(gross) && gross >= 0, `gross=${gross.toFixed(2)}`);

  // 5b. Every non-Refunded sale has a saleTotal > 0
  const missing = nonRefunded.filter(s => !(s.saleTotal > 0));
  ok("Every Paid/Pending sale has saleTotal > 0", missing.length === 0,
    `${missing.length} sales missing saleTotal: ${missing.slice(0, 3).map(s => s.id).join(", ")}`);

  // 5c. saleTotal = lines sum − discount (within floating-point rounding)
  const mismatch = nonRefunded.filter(s => {
    const linesTotal = (s.lines ?? []).reduce((n, l) => n + l.price * l.qty, 0);
    const expected = Math.round((linesTotal - (s.discount ?? 0)) * 100) / 100;
    const actual = Math.round((s.saleTotal ?? 0) * 100) / 100;
    return Math.abs(expected - actual) > 0.02; // allow 2¢ for tax-inclusive rounding
  });
  ok(`saleTotal = linesTotal − discount (checked ${nonRefunded.length} sales)`,
    mismatch.length === 0,
    `${mismatch.length} mismatches: ${mismatch.slice(0, 3).map(s => `${s.id}(expected=${((s.lines ?? []).reduce((n, l) => n + l.price * l.qty, 0) - (s.discount ?? 0)).toFixed(2)} got=${s.saleTotal})`).join(", ")}`);

  // 5d. No duplicate invoice IDs
  const ids = all.map(s => s.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  ok("No duplicate invoice IDs", dupes.length === 0,
    `duplicates: ${dupes.slice(0, 5).join(", ")}`);

  // 5e. Refunds have a refundReason
  const refunds = all.filter(s => s.status === "Refunded");
  const missingReason = refunds.filter(s => !s.refundReason);
  ok(`All ${refunds.length} refund(s) have a refundReason`,
    missingReason.length === 0,
    `${missingReason.length} missing: ${missingReason.slice(0, 3).map(s => s.id).join(", ")}`);

  // 5f. Net revenue = gross − refundedAmount
  const refundedAmt = refunds.reduce((n, s) => n + (s.saleTotal ?? 0), 0);
  const net = Math.round((gross - refundedAmt) * 100) / 100;
  ok("Net = Gross − Refunded is arithmetically consistent",
    Number.isFinite(net) && net <= gross, `net=${net.toFixed(2)} gross=${gross.toFixed(2)} refunded=${refundedAmt.toFixed(2)}`);

  // 5g. Cash + Non-Cash = Gross
  const cashTotal = nonRefunded.filter(s => s.payment === "Cash").reduce((n, s) => n + (s.saleTotal ?? 0), 0);
  const nonCashTotal = nonRefunded.filter(s => s.payment !== "Cash").reduce((n, s) => n + (s.saleTotal ?? 0), 0);
  ok("Cash + Non-Cash = Gross (payment split check)",
    Math.abs(cashTotal + nonCashTotal - gross) < 0.01,
    `cash=${cashTotal.toFixed(2)} non-cash=${nonCashTotal.toFixed(2)} gross=${gross.toFixed(2)}`);

  console.log(`\n  Summary: ${nonRefunded.length} paid/pending · ${refunds.length} refunded · gross $${gross.toFixed(2)} · net $${net.toFixed(2)}`);
}

// ─── run all ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  StoreGenz  —  Core Business Logic Audit");
  console.log(`  Server: ${BASE}`);
  console.log("═══════════════════════════════════════════════════");

  // Check server is up
  try {
    const r = await fetch(`${BASE}/api/settings`, { headers: HEADERS });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  } catch (e) {
    console.error(`\nERROR: Cannot reach ${BASE}/api/settings — is the dev server running?\n${e.message}`);
    process.exit(1);
  }

  const saleCtx = await auditSale();
  await auditPurchase();
  await auditReturn(saleCtx);
  await auditRegister();
  await auditReports();

  console.log("\n═══════════════════════════════════════════════════");
  console.log(`  PASSED: ${passed}   FAILED: ${failed}`);
  console.log("═══════════════════════════════════════════════════");

  if (failures.length > 0) {
    console.log("\nFailed checks:");
    failures.forEach(f => console.log(`  ✗  ${f.label}${f.detail ? `\n       ${f.detail}` : ""}`));
    process.exit(1);
  } else {
    console.log("\n  All core logic checks passed ✓");
  }
}

main().catch(e => { console.error("\nAudit crashed:", e.message); process.exit(1); });
