"use client";

import {
  ArrowDownRight, ArrowLeftRight, ArrowUpRight, Banknote, Bell, Box, Boxes, BriefcaseBusiness, Building2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  CircleDollarSign, ClipboardList, CreditCard, Download, FileBarChart, LayoutDashboard, LogOut, Menu, Network,
  Package, Plus, Printer, ReceiptText, RotateCcw, Search, Settings, Settings as SettingsIcon, ShieldCheck, ShoppingCart, Store, Tag, Truck, Upload, Users, Wallet, X
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type Product = { name: string; sku: string; category: string; price: number; cost: number; stock: number; image?: string };
const seedProducts: Product[] = [
  { name: "Premium Jasmine Rice 5kg", sku: "SKU-09231", category: "Groceries", price: 12.5, cost: 9.8, stock: 4 },
  { name: "Coca Cola Original 330ml", sku: "SKU-00842", category: "Beverages", price: 0.75, cost: 0.45, stock: 48 },
  { name: "Cambodia Beer Can 330ml", sku: "SKU-00128", category: "Beverages", price: 1.25, cost: 0.8, stock: 12 },
  { name: "Angkor Mineral Water 1.5L", sku: "SKU-00419", category: "Beverages", price: 0.5, cost: 0.28, stock: 96 },
  { name: "Palm Sugar 500g", sku: "SKU-00555", category: "Groceries", price: 3.2, cost: 2.1, stock: 25 },
  { name: "Laundry Detergent 1kg", sku: "SKU-00783", category: "Household", price: 4.75, cost: 3.4, stock: 18 }
];
const nextSku = (catalog: Product[]) => `SKU-${String(Math.floor(10000 + Math.random() * 90000))}`;

type StaffRole = "Administrator" | "Manager" | "Cashier" | (string & {});
type StaffMember = { name: string; role: StaffRole; permissions: string; status: "Active" | "Inactive"; department?: string };
type Session = { name: string; role: StaffRole };
/** Server-enforced capability catalog — mirrors CAPABILITIES in lib/db.ts. */
const CAPABILITY_LIST = ["sell", "inventory.manage", "purchases.manage", "suppliers.manage", "customers.manage", "finance.manage", "register.operate", "departments.manage", "reports.view", "staff.manage", "settings.manage"] as const;
type Capability = (typeof CAPABILITY_LIST)[number];
type RoleDef = { id: string; name: string; description: string; capabilities: string[]; system: boolean; createdBy: string; createdAt: string; updatedAt: string };
const CAPABILITY_LABELS: Record<Capability, string> = {
  "sell": "Sell & refund at the POS",
  "inventory.manage": "Products, categories & stock",
  "purchases.manage": "Purchase orders",
  "suppliers.manage": "Suppliers",
  "customers.manage": "Customers & loyalty",
  "finance.manage": "Expenses & payments",
  "register.operate": "Cash register",
  "departments.manage": "Departments",
  "reports.view": "Reports & activity log",
  "staff.manage": "Staff accounts & roles",
  "settings.manage": "Store settings"
};
const CAPABILITY_GROUPS: { group: string; items: Capability[] }[] = [
  { group: "Sales", items: ["sell"] },
  { group: "Catalog & stock", items: ["inventory.manage"] },
  { group: "Buying", items: ["purchases.manage", "suppliers.manage"] },
  { group: "Customers", items: ["customers.manage"] },
  { group: "Finance", items: ["finance.manage", "register.operate"] },
  { group: "Management", items: ["departments.manage", "reports.view", "staff.manage", "settings.manage"] }
];
type StoreSettings = { name: string; location: string; receiptFooter: string; currency: string; paymentMethods?: MethodSetting[]; taxEnabled?: boolean; taxRatePercent?: number; taxLabel?: string; taxInclusive?: boolean; allowNegativeStock?: boolean; lowStockThreshold?: number; maxDiscountPercent?: number; loyaltyEnabled?: boolean; loyaltyEarnRate?: number; loyaltyTiers?: { name: string; min: number }[]; registerOpeningFloat?: number; registerVarianceAlert?: number };
const DEFAULT_SETTINGS: StoreSettings = { name: "StoreGenz", location: "Phnom Penh", receiptFooter: "", currency: "$" };
/** Client-side capability check; the API re-enforces every rule server-side. Falls back to the legacy role ladder while roles load. */
const CAPS_FALLBACK: Record<string, Capability[]> = {
  Administrator: [...CAPABILITY_LIST],
  Manager: CAPABILITY_LIST.filter(c => c !== "staff.manage" && c !== "settings.manage"),
  Cashier: ["sell"]
};
const can = (cap: Capability, role: StaffRole | undefined, roles?: RoleDef[]) => {
  if (!role) return false;
  const def = roles?.find(r => r.id === role);
  const caps = def ? def.capabilities as Capability[] : CAPS_FALLBACK[role as string];
  return !!caps?.includes(cap);
};
/** Back-compat shims over the capability map. */
const CAN = {
  sell: (r: StaffRole, roles?: RoleDef[]) => can("sell", r, roles),
  manageProducts: (r: StaffRole, roles?: RoleDef[]) => can("inventory.manage", r, roles),
  manageStaff: (r: StaffRole, roles?: RoleDef[]) => can("staff.manage", r, roles)
};
const seedStaff: StaffMember[] = [
  { name: "Sokha P.", role: "Administrator", permissions: "Full access", status: "Active" },
  { name: "Mony S.", role: "Cashier", permissions: "POS access", status: "Active" },
  { name: "Dara K.", role: "Manager", permissions: "POS + inventory", status: "Active" }
];

type SaleLine = { name: string; sku: string; price: number; cost: number; qty: number };
type SaleStatus = "Paid" | "Pending" | "Refunded";
type Sale = { id: string; customer: string; date: string; payment: string; status: SaleStatus; discount?: number; lines: SaleLine[]; refundReason?: string; servedBy?: string; createdAt?: string; amountPaid?: number; changeDue?: number; saleTotal?: number; taxAmount?: number };
/** What the payment form collects for one checkout. */
type SalePayment = { customer: string; payment: string; amountPaid?: number; discount?: number };

const toLine = (p: Product, qty = 1): SaleLine => ({ name: p.name, sku: p.sku, price: p.price, cost: p.cost, qty });
const seedSales: Sale[] = [
  { id: "#INV-1048", customer: "Sokha Trading", date: "Today, 10:42 AM", payment: "Cash", status: "Paid", lines: [toLine(seedProducts[0], 16), toLine(seedProducts[3], 96)] },
  { id: "#INV-1047", customer: "Dara Market", date: "Today, 10:15 AM", payment: "ABA Pay", status: "Paid", lines: [toLine(seedProducts[4], 25), toLine(seedProducts[3], 13)] },
  { id: "#INV-1046", customer: "Walk-in customer", date: "Today, 09:58 AM", payment: "Cash", status: "Paid", lines: [toLine(seedProducts[2], 12), toLine(seedProducts[0], 2), toLine(seedProducts[3], 4)] },
  { id: "#INV-1045", customer: "Srey Mom", date: "Yesterday, 04:28 PM", payment: "Credit", status: "Pending", lines: [toLine(seedProducts[0], 10)] },
  { id: "#INV-1044", customer: "Vichea Mart", date: "Yesterday, 02:10 PM", payment: "Cash", status: "Refunded", refundReason: "Changed their mind", lines: [toLine(seedProducts[0], 1)] }
];
const subtotal = (s: Sale) => s.lines.reduce((sum, l) => sum + l.price * l.qty, 0);
/** Net money for the sale: subtotal minus any discount. Uses the sale-time snapshot when present. */
const saleTotal = (s: Sale) => s.saleTotal ?? Math.round((subtotal(s) - (s.discount ?? 0)) * 100) / 100;
const lineCost = (s: Sale) => s.lines.reduce((sum, l) => sum + (l.cost ?? 0) * l.qty, 0);
const itemCount = (s: Sale) => s.lines.reduce((n, l) => n + l.qty, 0);
const statusClass = (s: SaleStatus) => s === "Refunded" ? "refunded" : s === "Pending" ? "pending" : "paid";

const navGroups = [
  { title: "WORKSPACE", items: [["Dashboard", LayoutDashboard]] },
  { title: "SALES", items: [
    ["POS", ShoppingCart], ["Transactions", ReceiptText], ["Returns & Refunds", RotateCcw]
  ]},
  { title: "CATALOG", items: [["Products", Package], ["Categories", Tag]] },
  { title: "INVENTORY", items: [
    ["Stock", Boxes], ["Purchases", ClipboardList], ["Suppliers", Truck], ["Stock Transfers", ArrowLeftRight]
  ]},
  { title: "CUSTOMERS", items: [["Customers", Users]] },
  { title: "FINANCE", items: [
    ["Payments", CreditCard], ["Expenses", Wallet], ["Cash Register", Banknote]
  ]},
  { title: "REPORTS", items: [["Reports", FileBarChart]] },
  { title: "MANAGEMENT", items: [
    ["Staff", BriefcaseBusiness], ["Roles & Permissions", ShieldCheck], ["Departments", Network], ["Settings", SettingsIcon]
  ]}
] as const;

const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
/** Low-stock threshold from Settings → Products & Inventory; updated when settings hydrate. */
let LOW_STOCK_LIMIT = 10;
/** Receipt tax label from Settings → Taxes (sale snapshots carry the amount). */
let TAX_LABEL = "VAT";
/** Loyalty tiers from Settings → Loyalty; updated when settings hydrate. */
let LOYALTY_TIERS: { name: string; min: number }[] | null = null;
const taxLabelOf = (_s: Sale) => TAX_LABEL || "Tax";
/** Loyalty tier for a point balance, from Settings → Loyalty (highest min wins). */
const loyaltyTier = (points: number, tiers?: { name: string; min: number }[]) => {
  const list = (tiers ?? LOYALTY_TIERS ?? []).length ? (tiers ?? LOYALTY_TIERS)! : [{ name: "Member", min: 0 }, { name: "Silver", min: 100 }, { name: "Gold", min: 500 }];
  return [...list].sort((a, b) => b.min - a.min).find(t => points >= t.min)?.name ?? list[0].name;
};
/* ================= Hub pages: Transactions / Products / Stock / Reports ================= */

type PurchaseLite = { id: string; supplier: string; lines: { sku: string; name: string; qty: number; cost: number }[]; status: "Pending" | "Received" | "Returned"; note: string; createdBy: string; createdAt: string; receivedAt?: string; returnedAt?: string };
type ExpenseLite = { id: string; date: string; category: string; amount: number; note: string; createdBy: string; createdAt: string };
type MovementLite = { sku: string; productName: string; delta: number; reason: string; note: string; by: string; refId: string; createdAt: string };
type TransferLite = { id: string; sku: string; productName: string; qty: number; from: string; to: string; note: string; by: string; createdAt: string };
type CustomerLite = { id: string; name: string; phone: string; email: string; address: string; group: string; loyaltyPoints: number; note: string; createdBy: string; createdAt: string; updatedAt: string };
type CustStatementLite = { id: string; name: string; group: string; phone: string; email: string; loyaltyPoints: number; owed: number; paid: number; balance: number; lastActivity: string };
type MethodSetting = { name: string; enabled: boolean };
type RecurringLite = { id: string; category: string; amount: number; frequency: "weekly" | "monthly"; note: string; nextRun: string; lastRun?: string; active: boolean; createdBy: string; createdAt: string };
type ShiftLite = { id: string; openedBy: string; openedAt: string; openingFloat: number; closedBy?: string; closedAt?: string; closingCount?: number; expectedCash?: number; variance?: number; note?: string; movements: { id: string; direction: "in" | "out"; amount: number; reason: string; by: string; createdAt: string }[] };
type RegisterData = { open: ShiftLite | null; history: ShiftLite[]; movements: { id: string; shiftId: string; direction: "in" | "out"; amount: number; reason: string; by: string; createdAt: string }[]; defaults: { openingFloat: number; varianceAlert: number } };

/** Shared roles state: the live role definitions from /api/roles. */
function useRolesData() {
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const load = useCallback(() => {
    fetch("/api/roles").then(r => r.ok ? r.json() : Promise.reject()).then(d => setRoles(d as RoleDef[])).catch(() => {});
  }, []);
  useEffect(load, [load]);
  return { roles, setRoles, reloadRoles: load };
}
type DepartmentLite = { id: string; name: string; description: string; createdBy: string; createdAt: string };
type AttendanceLite = { id: string; staffName: string; clockIn: string; clockOut?: string };
type ActivityLite = { action: string; detail: string; by: string; createdAt: string };
type StaffTab = "All Staff" | "Add Staff" | "Roles & Permissions" | "Departments" | "Shifts" | "Attendance" | "Staff Performance" | "Activity Log";

/** Shared register state: open shift, history, defaults. */
function useRegister() {
  const [data, setData] = useState<RegisterData | null>(null);
  const load = useCallback(() => {
    fetch("/api/register").then(r => r.ok ? r.json() : Promise.reject()).then(d => setData(d as RegisterData)).catch(() => setData({ open: null, history: [], movements: [], defaults: { openingFloat: 50, varianceAlert: 5 } }));
  }, []);
  useEffect(load, [load]);
  return { data, load };
}

/** Cash Register hub: overview, open, current shift, movements, close, history, settings. */
function RegisterHub({ sales, role }: { sales: Sale[]; role: StaffRole }) {
  const tabs = ["Register Overview", "Open Register", "Current Shift", "Cash In / Cash Out", "Close Register", "Register History", "Register Settings"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>("Register Overview");
  const useRoles = useRolesData();
  const canManage = CAN.manageProducts(role);
  const { data, load } = useRegister();
  const open = data?.open ?? null;
  const history = data?.history ?? [];
  const defaults = data?.defaults ?? { openingFloat: 50, varianceAlert: 5 };
  const pendingTab = open ? null : (tab === "Current Shift" || tab === "Cash In / Cash Out" || tab === "Close Register") ? "Open Register" : null;
  useEffect(() => { if (pendingTab) setTab(pendingTab as typeof tab); }, [pendingTab]);
  const cashSales = sales.filter(s => s.payment === "Cash" && s.status === "Paid");
  const noteOf = (s: ShiftLite | null) => (open && s) ? s.movements : [];
  const expected = open ? open.expectedCash ?? open.openingFloat : 0;
  return <>
    <PageHeading title="Cash Register" sub="Shift-based drawer control with counted variances"/>
    <div className="subnav subnav-wrap">
      {tabs.map(t => <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button>)}
    </div>
    {tab === "Register Overview" && <>
      <div className="stats-grid five">
        <Stat label="Register" value={open ? "Open" : "Closed"} change={open ? `${open.id} · ${open.openedBy}` : "no active shift"} caption="now" icon={Banknote} tone={open ? "green" : "orange"}/>
        <Stat label="Expected drawer" value={open ? money(expected) : "—"} change={open ? `float ${money(open.openingFloat)} + takings` : "open to count"} caption="live" icon={Wallet} tone="blue"/>
        <Stat label="Cash sales (all)" value={money(cashSales.reduce((n, s) => n + saleTotal(s), 0))} change={`${cashSales.length} cash sale${cashSales.length === 1 ? "" : "s"}`} caption="all time" icon={CircleDollarSign} tone="green"/>
        <Stat label="Shifts closed" value={String(history.length)} change={history.length ? `last variance ${money(history[0].variance ?? 0)}` : "none yet"} caption="history" icon={ClipboardList} tone="purple"/>
        <Stat label="Variance alert" value={money(defaults.varianceAlert)} change="threshold set in settings" caption="policy" icon={ShieldCheck} tone="orange"/>
      </div>
      <div className="panel"><div className="toolbar"><strong>How it works</strong></div>
        <p className="form-intro">Open the register with a counted float, take cash sales all day (movement ledger records every in/out), then close with a counted drawer. The expected cash is computed from real transactions — the difference is your variance.</p>
      </div>
    </>}
    {tab === "Open Register" && <OpenRegisterView canManage={canManage} defaults={defaults} open={open} reload={load}/>}
    {tab === "Current Shift" && <CurrentShiftView open={open}/>}
    {tab === "Cash In / Cash Out" && <CashMovementView canManage={canManage} open={open} reload={load}/>}
    {tab === "Close Register" && <CloseRegisterView canManage={canManage} open={open} reload={load}/>}
    {tab === "Register History" && <div className="panel table-panel"><div className="toolbar"><strong>{history.length} closed shift{history.length === 1 ? "" : "s"}</strong></div>
      {history.length === 0 ? <div className="empty">No closed shifts yet — the history of counted variances builds here.</div>
        : <DataTable headers={["SHIFT", "OPENED", "CLOSED", "BY", "FLOAT", "EXPECTED", "COUNTED", "VARIANCE"]} rows={[...history].sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? "")).map(s => { const v = money(s.variance ?? 0); const hot = Math.abs(s.variance ?? 0) >= defaults.varianceAlert; return [s.id, new Date(s.openedAt).toLocaleDateString(), s.closedAt ? new Date(s.closedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—", s.closedBy ?? "—", money(s.openingFloat), money(s.expectedCash ?? 0), money(s.closingCount ?? 0), hot ? v + " ⚠" : v]; })}/>}
    </div>}
    {tab === "Register Settings" && <RegisterSettingsView defaults={defaults} canManage={can("settings.manage", role, useRoles.roles)}/>}
  </>;
}

/** Open Register: counted float form, blocked while a shift is open. */
function OpenRegisterView({ canManage, defaults, open, reload }: { canManage: boolean; defaults: { openingFloat: number; varianceAlert: number }; open: ShiftLite | null; reload: () => void }) {
  const [amount, setAmount] = useState(String(defaults.openingFloat));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (open) return <div className="panel empty-panel"><div className="empty"><strong>Register is already open</strong><p>{open.id} was opened by {open.openedBy} — close it before starting a new shift.</p></div></div>;
  const submit = async () => {
    setBusy(true); setError(null);
    const res = await fetch("/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action: "open", openingFloat: Number(amount), note }) });
    const d = await res.json() as { error?: string };
    if (res.ok) { reload(); } else { setError(d.error ?? "Could not open."); setBusy(false); }
  };
  return <div className="panel purchase-form-panel"><div className="toolbar"><strong>Open a new shift</strong></div>
    {!canManage ? <div className="empty">Manager or administrator access required.</div> : <>
      <div className="form-grid">
        <label>Opening float (counted cash)<input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}/></label>
        <label>Note (optional)<input placeholder="e.g. Monday morning, till 1" value={note} onChange={e => setNote(e.target.value)}/></label>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="modal-actions"><button className="primary-button" disabled={busy || !(Number(amount) >= 0)} onClick={submit}>{busy ? "Opening…" : "Open register"}</button></div>
      <p className="form-intro" style={{ marginTop: 8 }}>Default float {money(defaults.openingFloat)} — change it in Register Settings.</p>
    </>}
  </div>;
}

/** Current Shift: live takings, movements list, expected drawer. */
function CurrentShiftView({ open }: { open: ShiftLite | null }) {
  if (!open) return <div className="panel empty-panel"><div className="empty"><strong>No open shift</strong><p>Open the register to see live drawer math.</p></div></div>;
  return <div className="panel table-panel"><div className="toolbar"><strong>{open.id} · opened by {open.openedBy} · float {money(open.openingFloat)}</strong></div>
    <div className="table-wrap"><table><thead><tr>{["ITEM", "VALUE"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
      <tr><td>Opening float</td><td>{money(open.openingFloat)}</td></tr>
      <tr><td>Expected drawer (live)</td><td><strong>{money(open.expectedCash ?? open.openingFloat)}</strong></td></tr>
      <tr><td>Adjustments so far</td><td>{open.movements.length === 0 ? "none" : `${open.movements.length} movement${open.movements.length === 1 ? "" : "s"}`}</td></tr>
    </tbody></table></div>
  </div>;
}

/** Cash In / Out: manager-only drawer adjustments with reasons. */
function CashMovementView({ canManage, open, reload }: { canManage: boolean; open: ShiftLite | null; reload: () => void }) {
  const [direction, setDirection] = useState("out");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open) return <div className="panel empty-panel"><div className="empty"><strong>No open shift</strong><p>Open the register first.</p></div></div>;
  const submit = async () => {
    setBusy(true); setError(null);
    const res = await fetch("/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action: direction === "in" ? "cashIn" : "cashOut", amount: Number(amount), reason }) });
    const d = await res.json() as { error?: string };
    if (res.ok) { setAmount(""); setReason(""); reload(); } else { setError(d.error ?? "Failed."); setBusy(false); }
  };
  return <div className="panel purchase-form-panel"><div className="toolbar"><strong>Record drawer movement</strong></div>
    {!canManage ? <div className="empty">Manager or administrator access required.</div> : <>
      <div className="form-grid">
        <label>Direction<select value={direction} onChange={e => setDirection(e.target.value)}><option value="out">Cash out (drop, petty cash)</option><option value="in">Cash in (top-up)</option></select></label>
        <label>Amount (USD)<input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}/></label>
        <label style={{ gridColumn: "1 / -1" }}>Reason *<input placeholder="e.g. Bank drop / change top-up" value={reason} onChange={e => setReason(e.target.value)}/></label>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="modal-actions"><button className="primary-button" disabled={busy || !(Number(amount) > 0) || !reason.trim()} onClick={submit}>{busy ? "Recording…" : "Record movement"}</button></div>
      {open.movements.length > 0 && <div className="table-wrap" style={{ marginTop: 12 }}><table><thead><tr>{["ID", "DIR", "AMOUNT", "REASON", "BY", "WHEN"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
        {open.movements.map(m => <tr key={m.id}><td>{m.id}</td><td>{m.direction === "in" ? "In" : "Out"}</td><td>{money(m.amount)}</td><td>{m.reason}</td><td>{m.by}</td><td>{new Date(m.createdAt).toLocaleTimeString()}</td></tr>)}
      </tbody></table></div>}
    </>}
  </div>;
}

/** Close Register: counted drawer vs server-computed expected → variance. */
function CloseRegisterView({ canManage, open, reload }: { canManage: boolean; open: ShiftLite | null; reload: () => void }) {
  const [count, setCount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open) return <div className="panel empty-panel"><div className="empty"><strong>No open shift</strong><p>Nothing to close.</p></div></div>;
  const expected = open.expectedCash ?? open.openingFloat;
  const variance = Number.isFinite(Number(count)) && count !== "" ? Math.round((Number(count) - expected) * 100) / 100 : null;
  const submit = async () => {
    setBusy(true); setError(null);
    const res = await fetch("/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action: "close", closingCount: Number(count), note }) });
    const d = await res.json() as { error?: string };
    if (res.ok) { setCount(""); setNote(""); reload(); } else { setError(d.error ?? "Failed."); setBusy(false); }
  };
  return <div className="panel purchase-form-panel"><div className="toolbar"><strong>Close {open.id} — count the drawer</strong></div>
    {!canManage ? <div className="empty">Manager or administrator access required.</div> : <>
      <div className="form-grid">
        <label>Expected (computed from ledger)<input value={money(expected)} disabled/></label>
        <label>Counted cash in drawer *<input type="number" min="0" step="0.01" value={count} onChange={e => setCount(e.target.value)} autoFocus/></label>
        <label style={{ gridColumn: "1 / -1" }}>Note (optional)<input placeholder="e.g. end of Monday shift" value={note} onChange={e => setNote(e.target.value)}/></label>
      </div>
      {variance !== null && <p className="form-intro">Variance: <strong style={{ color: variance === 0 ? "#3fb27f" : "#e07a5f" }}>{money(variance)}</strong>{variance !== 0 && " — investigate before signing off."}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="modal-actions"><button className="primary-button" disabled={busy || !(Number(count) >= 0)} onClick={submit}>{busy ? "Closing…" : "Close register"}</button></div>
    </>}
  </div>;
}

/** Register Settings: default float + variance alert (admin). */
function RegisterSettingsView({ defaults, canManage }: { defaults: { openingFloat: number; varianceAlert: number }; canManage: boolean }) {
  const [float, setFloat] = useState(String(defaults.openingFloat));
  const [alert, setAlert] = useState(String(defaults.varianceAlert));
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setError(null);
    const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ registerOpeningFloat: Number(float), registerVarianceAlert: Number(alert) }) });
    const d = await res.json() as { error?: string };
    setBusy(false);
    if (res.ok) setNotice("Saved."); else setError(d.error ?? "Could not save.");
  };
  if (!canManage) return <div className="panel empty-panel"><div className="empty"><strong>Administrators only</strong><p>Register policy changes require an administrator.</p></div></div>;
  return <div className="panel purchase-form-panel"><div className="toolbar"><strong>Register defaults</strong></div>
    <div className="form-grid">
      <label>Default opening float (USD)<input type="number" min="0" step="0.01" value={float} onChange={e => setFloat(e.target.value)}/></label>
      <label>Variance alert threshold (USD)<input type="number" min="0" step="0.01" value={alert} onChange={e => setAlert(e.target.value)}/></label>
    </div>
    {notice && <p className="checkout-success success-banner" role="status">{notice}</p>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="modal-actions"><button className="primary-button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save settings"}</button></div>
  </div>;
}

/** Expenses hub: real expense ledger (shared with Reports/Finance), recurring engine, category stats. */
function ExpensesHub({ role }: { role: StaffRole }) {
  const tabs = ["All Expenses", "Add Expense", "Expense Categories", "Recurring Expenses", "Expense Reports"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>("All Expenses");
  const canManage = CAN.manageProducts(role);
  const [formOpen, setFormOpen] = useState(false);
  const [expenses, setExpenses] = useState<ExpenseLite[] | null>(null);
  const [recurrings, setRecurrings] = useState<RecurringLite[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch("/api/expenses").then(r => r.ok ? r.json() : Promise.reject()).then(d => setExpenses(d as ExpenseLite[])).catch(() => setExpenses([]));
    fetch("/api/recurring-expenses").then(r => r.ok ? r.json() : Promise.reject()).then(d => setRecurrings(d as RecurringLite[])).catch(() => setRecurrings([]));
  }, []);
  useEffect(load, [load]);
  const list = expenses ?? [];
  const total = list.reduce((n, e) => n + e.amount, 0);
  const thisMonth = list.filter(e => e.date.slice(0, 7) === new Date().toISOString().slice(0, 7));
  const categories = Array.from(new Set(list.map(e => e.category))).sort();
  const catRows = categories.map(c => {
    const inC = list.filter(e => e.category === c);
    return [c, String(inC.length), money(inC.reduce((n, e) => n + e.amount, 0)), money(inC.filter(e => e.date.slice(0, 7) === new Date().toISOString().slice(0, 7)).reduce((n, e) => n + e.amount, 0))];
  }).sort((a, b) => parseFloat(b[2].replace(/[$,]/g, "")) - parseFloat(a[2].replace(/[$,]/g, "")));
  const monthTotal = thisMonth.reduce((n, e) => n + e.amount, 0);
  // Simple 6-month trend from the real ledger.
  const months: string[][] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const key = d.toISOString().slice(0, 7);
    const amt = list.filter(e => e.date.slice(0, 7) === key).reduce((n, e) => n + e.amount, 0);
    months.push([d.toLocaleDateString("en-US", { month: "short", year: "numeric" }), String(list.filter(e => e.date.slice(0, 7) === key).length), money(amt)]);
  }
  return <>
    <PageHeading title="Expenses" sub="Operating expenses: one-off and recurring" action={canManage ? "Add expense" : undefined} onAction={() => setFormOpen(true)}/>
    <div className="subnav subnav-wrap">
      {tabs.map(t => <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => { setTab(t); setNotice(null); }}>{t}</button>)}
    </div>
    {notice && <p className="checkout-success success-banner" role="status">{notice}</p>}
    {tab === "All Expenses" && <div className="panel table-panel"><div className="toolbar"><strong>{expenses ? `${list.length} expense${list.length === 1 ? "" : "s"} · ${money(total)} all-time · ${money(monthTotal)} this month` : "Loading…"}</strong></div>
      {!expenses ? <div className="empty">Loading…</div> : list.length === 0 ? <div className="empty">No expenses recorded yet — rent, utilities, and supplies will appear here.</div>
        : <DataTable headers={["ID", "DATE", "CATEGORY", "NOTE", "AMOUNT"]} rows={[...list].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60).map(e => [e.id, new Date(e.date).toLocaleDateString(), e.category, e.note || "—", money(e.amount)])}/>}
    </div>}
    {tab === "Add Expense" && (canManage ? <ExpenseFormInline onSaved={msg => { setNotice(msg); load(); setTab("All Expenses"); }}/> : <div className="panel empty-panel"><div className="empty"><strong>Managers only</strong><p>Ask a manager or administrator to record expenses.</p></div></div>)}
    {tab === "Expense Categories" && <div className="panel table-panel"><div className="toolbar"><strong>{expenses ? `${categories.length} categories in use` : "Loading…"}</strong></div>
      {!expenses ? <div className="empty">Loading…</div> : categories.length === 0 ? <div className="empty">No expenses yet.</div>
        : <DataTable headers={["CATEGORY", "COUNT", "TOTAL", "THIS MONTH"]} rows={catRows}/>}
    </div>}
    {tab === "Recurring Expenses" && <RecurringExpensesView recurrings={recurrings} canManage={canManage} reload={load}/>}
    {tab === "Expense Reports" && <>
      <div className="panel table-panel"><div className="toolbar"><strong>Monthly total — last 6 months</strong></div>
        {list.length === 0 ? <div className="empty">No data yet.</div> : <DataTable headers={["MONTH", "EXPENSES", "TOTAL"]} rows={months}/>}
      </div>
      <div className="panel table-panel" style={{ marginTop: 12 }}><div className="toolbar"><strong>By category — all time</strong></div>
        {list.length === 0 ? <div className="empty">No data yet.</div> : <DataTable headers={["CATEGORY", "COUNT", "TOTAL", "THIS MONTH"]} rows={catRows}/>}
      </div>
    </>}
    {formOpen && <ExpenseFormModal onClose={() => setFormOpen(false)} onSaved={msg => { setFormOpen(false); setNotice(msg); load(); }}/>}
  </>;
}

function ExpenseFormInline({ onSaved }: { onSaved: (msg: string) => void }) {
  return <div className="panel purchase-form-panel"><div className="toolbar"><strong>Record expense</strong></div><ExpenseFormBody onSaved={onSaved}/></div>;
}
/** Shared expense form body (used inline and in the modal). */
function ExpenseFormBody({ onSaved }: { onSaved: (msg: string) => void }) {
  const [form, setForm] = useState({ category: "Supplies", amount: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return setError("Amount must be a positive number.");
    setBusy(true); setError(null);
    const res = await fetch("/api/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ category: form.category, amount, note: form.note }) });
    const data = await res.json() as { error?: string; id?: string };
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Could not record the expense.");
    onSaved(`Expense ${data.id} recorded.`);
  };
  return <>
    <div className="form-grid">
      <label>Category<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Amount (USD)<input autoFocus type="number" min="0.01" step="0.01" placeholder="0.00" value={form.amount} onChange={e => { setForm({ ...form, amount: e.target.value }); setError(null); }}/></label>
      <label style={{ gridColumn: "1 / -1" }}>Note (optional)<input placeholder="e.g. September electricity" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}/></label>
    </div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="modal-actions"><button className="primary-button" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Record expense"}</button></div>
  </>;
}

/** Recurring manager: templates, schedules, pause/resume; generation runs on boot. */
function RecurringExpensesView({ recurrings, canManage, reload }: { recurrings: RecurringLite[] | null; canManage: boolean; reload: () => void }) {
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (id: string, action: string) => {
    setError(null);
    const res = await fetch("/api/recurring-expenses", { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ id, action }) });
    const data = await res.json() as { error?: string };
    if (res.ok) reload(); else setError(data.error ?? "Action failed.");
  };
  return <div className="panel table-panel"><div className="toolbar"><strong>{recurrings ? `${(recurrings ?? []).filter(r => r.active).length} active template${(recurrings ?? []).filter(r => r.active).length === 1 ? "" : "s"} — generated automatically on server start` : "Loading…"}</strong>
    {canManage && <button className="primary-button" onClick={() => setFormOpen(true)}><Plus size={15}/> New recurring</button>}</div>
    {error && <p className="offline-banner error-banner" role="alert">{error}<button className="banner-close" aria-label="Dismiss" onClick={() => setError(null)}><X size={14}/></button></p>}
    {!recurrings ? <div className="empty">Loading…</div> : recurrings.length === 0 ? <div className="empty">No recurring templates — set up rent or salaries once and they post themselves.</div>
      : <div className="table-wrap"><table><thead><tr>{["ID", "CATEGORY", "AMOUNT", "FREQUENCY", "NEXT RUN", "STATUS", ""].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
        {recurrings.map(r => <tr key={r.id}><td><strong>{r.id}</strong></td><td>{r.category}{r.note && <span style={{ display: "block", color: "#9ba5ae", fontSize: 10 }}>{r.note}</span>}</td><td>{money(r.amount)}</td><td>{r.frequency}</td><td>{new Date(r.nextRun).toLocaleDateString()}</td><td>{r.active ? <span className="you-chip">active</span> : "paused"}</td>
          <td>{canManage && <div className="row-actions"><button className="text-button" onClick={() => act(r.id, r.active ? "pause" : "resume")}>{r.active ? "Pause" : "Resume"}</button><button className="text-button danger" onClick={() => act(r.id, "delete")}>Delete</button></div>}</td></tr>)}
      </tbody></table></div>}
    {formOpen && <RecurringFormModal onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); reload(); }}/>}
  </div>;
}

/** New recurring template: category, amount, weekly/monthly, first due date. */
function RecurringFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ category: "Rent", amount: "", frequency: "monthly", note: "", nextRun: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setError(null);
    const res = await fetch("/api/recurring-expenses", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ ...form, amount: Number(form.amount), nextRun: form.nextRun ? new Date(form.nextRun).toISOString() : "" }) });
    const data = await res.json() as { id?: string; error?: string };
    if (res.ok) onSaved(); else { setError(data.error ?? "Could not save."); setBusy(false); }
  };
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}>
    <div className="modal-header"><h2>New recurring expense</h2><button aria-label="Close recurring form" onClick={onClose}><X size={18}/></button></div>
    <div className="form-grid">
      <label>Category<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Amount (USD)<input type="number" min="0.01" step="0.01" placeholder="0.00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}/></label>
      <label>Frequency<select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })}><option value="monthly">Monthly</option><option value="weekly">Weekly</option></select></label>
      <label>First due date<input type="date" value={form.nextRun} onChange={e => setForm({ ...form, nextRun: e.target.value })}/></label>
      <label style={{ gridColumn: "1 / -1" }}>Note (optional)<input placeholder="e.g. Landlord — monthly rent" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}/></label>
    </div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="modal-actions"><button className="outline-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy || !(Number(form.amount) > 0)} onClick={submit}>{busy ? "Saving…" : "Create template"}</button></div>
  </div></div>;
}

/** Payments hub: one money-movement ledger across sales, refunds, customer and supplier payments. */
function PaymentsHub({ sales, role }: { sales: Sale[]; role: StaffRole }) {
  const tabs = ["All Payments", "Customer Payments", "Supplier Payments", "Refunds", "Payment Methods", "Payment Settings"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>("All Payments");
  const useRoles = useRolesData();
  const isAdmin = can("settings.manage", role, useRoles.roles);
  const refunded = sales.filter(s => s.status === "Refunded");
  const cashIn = sales.filter(s => s.status === "Paid");
  const pendingCredit = sales.filter(s => s.status === "Pending");
  const { statements: custStatements } = useCustomers();
  const { statements: supStatements } = useSuppliers();
  const [methods, setMethods] = useState<MethodSetting[] | null>(null);
  const loadMethods = useCallback(() => {
    fetch("/api/settings").then(r => r.ok ? r.json() : Promise.reject()).then((d: StoreSettings) => setMethods(d.paymentMethods ?? null)).catch(() => setMethods([]));
  }, []);
  useEffect(loadMethods, [loadMethods]);
  const custPaid = (custStatements ?? []).reduce((n, s) => n + s.paid, 0);
  const supPaid = (supStatements ?? []).reduce((n, s) => n + s.paid, 0);
  const totalIn = cashIn.reduce((n, s) => n + saleTotal(s), 0) + custPaid;
  const totalOut = refunded.reduce((n, s) => n + saleTotal(s), 0) + supPaid;

  const combined: { label: string; party: string; amount: number; dir: "in" | "out"; when: string }[] = [
    ...cashIn.map(s => ({ label: s.id, party: s.customer, amount: saleTotal(s), dir: "in" as const, when: s.createdAt ?? "" })),
    ...refunded.map(s => ({ label: s.id, party: s.customer, amount: saleTotal(s), dir: "out" as const, when: s.createdAt ?? "" })),
    ...(custStatements ?? []).filter(s => s.paid > 0).map(s => ({ label: "Customer payment", party: s.name, amount: s.paid, dir: "in" as const, when: s.lastActivity })),
    ...(supStatements ?? []).filter(s => s.paid > 0).map(s => ({ label: "Supplier payment", party: s.name, amount: s.paid, dir: "out" as const, when: s.lastActivity })),
  ].sort((a, b) => b.when.localeCompare(a.when));

  return <>
    <PageHeading title="Payments" sub="Every payment in and out: sales, refunds, customer and supplier money"/>
    <div className="subnav subnav-wrap">
      {tabs.map(t => <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button>)}
    </div>
    {tab === "All Payments" && <div className="panel table-panel"><div className="toolbar"><strong>{`${combined.length} payment events · ${money(totalIn)} in · ${money(totalOut)} out`}</strong></div>
      {combined.length === 0 ? <div className="empty">No payments yet — record a sale, refund, or customer/supplier payment.</div>
        : <div className="table-wrap"><table><thead><tr>{["REFERENCE", "PARTY", "DIRECTION", "AMOUNT", "WHEN"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
          {combined.slice(0, 40).map((p, i) => <tr key={i}><td><strong>{p.label}</strong></td><td>{p.party}</td><td>{p.dir === "in" ? "In" : "Out"}</td><td style={{ color: p.dir === "in" ? "#3fb27f" : "#e07a5f" }}>{p.dir === "in" ? "+" : "−"}{money(p.amount)}</td><td>{p.when ? new Date(p.when).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—"}</td></tr>)}
        </tbody></table></div>}
    </div>}
    {tab === "Customer Payments" && <CustomerPaymentsView canManage={CAN.manageProducts(role)}/>}
    {tab === "Supplier Payments" && <SupplierPaymentsView canManage={CAN.manageProducts(role)}/>}
    {tab === "Refunds" && <HubTable headers={["INVOICE", "CUSTOMER", "WHEN", "AMOUNT"]} empty="No refunds yet" rows={refunded.map(s => [s.id, s.customer, s.createdAt ? new Date(s.createdAt).toLocaleDateString() : (s.date || "—"), money(saleTotal(s))])}/>}
    {tab === "Payment Methods" && <PaymentMethodsEditor methods={methods} reload={loadMethods} canEdit={isAdmin}/>}
    {tab === "Payment Settings" && <div className="panel"><div className="toolbar"><strong>Payment policy</strong></div>
      <div className="table-wrap"><table><thead><tr>{["POLICY", "VALUE"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
        <tr><td>Credit sales</td><td>Recorded as <strong>Pending</strong> until collected in Customers → Customer Payments</td></tr>
        <tr><td>Cash handling</td><td>Change due computed at checkout; cash drawer reconciled in Transactions → Cash Drawer</td></tr>
        <tr><td>Method changes</td><td>Administrator only — the POS reads the enabled list live</td></tr>
        <tr><td>Currency</td><td>Set in Settings (store profile)</td></tr>
      </tbody></table></div>
      {pendingCredit.length > 0 && <p className="form-intro" style={{ margin: "10px 0 0" }}>{pendingCredit.length} credit sale{pendingCredit.length === 1 ? "" : "s"} awaiting collection ({money(pendingCredit.reduce((n, s) => n + saleTotal(s), 0))}).</p>}
    </div>}
  </>;
}

/** Enabled/disabled payment methods (admin-editable) — the POS reads this live. */
function PaymentMethodsEditor({ methods, reload, canEdit }: { methods: MethodSetting[] | null; reload: () => void; canEdit: boolean }) {
  const [draft, setDraft] = useState<MethodSetting[]>([]);
  const [newName, setNewName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(methods ?? []); }, [methods]);
  const dirty = methods !== null && JSON.stringify(draft) !== JSON.stringify(methods);
  const save = async () => {
    setBusy(true); setError(null);
    const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ paymentMethods: draft }) });
    const data = await res.json() as { error?: string };
    setBusy(false);
    if (res.ok) { setNotice("Payment methods saved — the POS accepts the enabled list now."); reload(); }
    else setError(data.error ?? "Could not save payment methods.");
  };
  if (!canEdit) return <div className="panel empty-panel"><div className="empty"><strong>Administrators only</strong><p>Changing accepted payment methods requires an administrator.</p></div></div>;
  return <div className="panel table-panel"><div className="toolbar"><strong>Accepted payment methods</strong>{dirty && <button className="primary-button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save changes"}</button>}</div>
    {methods === null ? <div className="empty">Loading…</div>
      : methods.length === 0 ? <div className="empty">Could not load payment methods.</div>
      : <>
      <div className="table-wrap"><table><thead><tr>{["METHOD", "ACCEPTED", ""].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
        {draft.map((m, i) => <tr key={m.name}><td><strong>{m.name}</strong>{m.name === "Cash" && <span className="you-chip" style={{ marginLeft: 6 }}>always on</span>}</td>
          <td><input type="checkbox" aria-label={`Accept ${m.name}`} checked={m.enabled} disabled={m.name === "Cash"} onChange={e => setDraft(d => d.map((x, j) => j === i ? { ...x, enabled: e.target.checked } : x))}/></td>
          <td>{m.name !== "Cash" && <button className="text-button danger" aria-label={`Remove ${m.name}`} onClick={() => setDraft(d => d.filter((_, j) => j !== i))}><X size={14}/></button>}</td></tr>)}
      </tbody></table></div>
      <div className="po-line" style={{ marginTop: 10 }}>
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New method name (e.g. Wing, TrueMoney)" onKeyDown={e => { if (e.key === "Enter" && newName.trim()) { setDraft(d => [...d, { name: newName.trim(), enabled: true }]); setNewName(""); } }}/>
        <button className="outline-button" disabled={!newName.trim() || draft.some(d => d.name.toLowerCase() === newName.trim().toLowerCase())} onClick={() => { setDraft(d => [...d, { name: newName.trim(), enabled: true }]); setNewName(""); }}><Plus size={14}/> Add method</button>
      </div>
      {notice && <p className="checkout-success success-banner" role="status">{notice}</p>}
      {error && <p className="offline-banner error-banner" role="alert">{error}<button className="banner-close" aria-label="Dismiss" onClick={() => setError(null)}><X size={14}/></button></p>}
      <p className="form-intro" style={{ margin: "10px 0 0" }}>Cash must stay enabled. Disabled methods disappear from the POS charge dialog immediately.</p>
    </>}
  </div>;
}

/** Shared customer data: directory + computed statements (credit owed vs payments). */
function useCustomers() {
  const [customers, setCustomers] = useState<CustomerLite[] | null>(null);
  const [statements, setStatements] = useState<CustStatementLite[] | null>(null);
  const [orphans, setOrphans] = useState<string[]>([]);
  const load = useCallback(() => {
    fetch("/api/customers").then(r => r.ok ? r.json() : Promise.reject()).then(d => setCustomers(d as CustomerLite[])).catch(() => setCustomers([]));
    fetch("/api/customer-payments").then(r => r.ok ? r.json() : Promise.reject()).then((d: { statements: CustStatementLite[]; orphans: string[] }) => { setStatements(d.statements); setOrphans(d.orphans); }).catch(() => setStatements([]));
  }, []);
  useEffect(load, [load]);
  return { customers, statements, orphans, load };
}

/** Customers hub: directory, add form, groups, payments, statements, loyalty points. */
function CustomersHub({ role }: { role: StaffRole }) {
  const tabs = ["All Customers", "Add Customer", "Customer Groups", "Customer Payments", "Customer Statements", "Loyalty / Points"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>("All Customers");
  const canManage = CAN.manageProducts(role);
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { customers, statements, orphans, load } = useCustomers();
  const groups = Array.from(new Set((customers ?? []).map(c => c.group))).sort();
  const totalOwed = (statements ?? []).reduce((n, s) => n + Math.max(0, s.balance), 0);
  const totalPoints = (customers ?? []).reduce((n, c) => n + c.loyaltyPoints, 0);
  const balanceOf = (id: string) => (statements ?? []).find(s => s.id === id);
  return <>
    <PageHeading title="Customers" sub="Customer directory, credit, payments, and loyalty" action={canManage ? "Add customer" : undefined} onAction={() => setFormOpen(true)}/>
    <div className="subnav subnav-wrap">
      {tabs.map(t => <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => { setTab(t); setNotice(null); }}>{t}</button>)}
    </div>
    {notice && <p className="checkout-success success-banner" role="status">{notice}</p>}
    {tab === "All Customers" && <div className="panel table-panel"><div className="toolbar"><strong>{customers ? `${customers.length} customer${customers.length === 1 ? "" : "s"}${statements ? ` · ${totalPoints} loyalty points` : ""}` : "Loading…"}</strong></div>
      {!customers ? <div className="empty">Loading…</div> : customers.length === 0 ? <div className="empty">No customers yet — add one, or they appear automatically from sales history.</div>
        : <DataTable headers={["CUSTOMER", "GROUP", "PHONE", "POINTS", "BALANCE"]} rows={customers.map(c => {
          const st = balanceOf(c.id);
          return [c.name, c.group, c.phone || "—", String(c.loyaltyPoints), st && st.balance > 0 ? money(st.balance) : "Settled"];
        })}/>}
    </div>}
    {tab === "Add Customer" && (canManage ? <CustomerFormInline onSaved={msg => { setNotice(msg); load(); setTab("All Customers"); }}/> : <div className="panel empty-panel"><div className="empty"><strong>Managers only</strong><p>Ask a manager or administrator to add customers.</p></div></div>)}
    {tab === "Customer Groups" && <div className="panel table-panel"><div className="toolbar"><strong>{customers ? `${groups.length} group${groups.length === 1 ? "" : "s"}` : "Loading…"}</strong></div>
      {!customers ? <div className="empty">Loading…</div> : groups.length === 0 ? <div className="empty">No groups yet.</div>
        : <DataTable headers={["GROUP", "CUSTOMERS", "OUTSTANDING", "POINTS"]} rows={groups.map(g => {
          const inG = (statements ?? []).filter(s => s.group === g);
          return [g, String(inG.length), money(inG.reduce((n, s) => n + Math.max(0, s.balance), 0)), String(inG.reduce((n, s) => n + s.loyaltyPoints, 0))];
        })}/>}
    </div>}
    {tab === "Customer Payments" && <CustomerPaymentsView canManage={canManage}/>}
    {tab === "Customer Statements" && <div className="panel table-panel"><div className="toolbar"><strong>Per-customer statement: credit owed vs payments received</strong></div>
      {!statements ? <div className="empty">Loading…</div> : statements.length === 0 ? <div className="empty">No customers yet.</div>
        : <div className="table-wrap"><table><thead><tr>{["CUSTOMER", "CREDIT OWED", "PAID", "BALANCE", "LAST ACTIVITY"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
          {statements.map(s => <tr key={s.id}><td><strong>{s.name}</strong></td><td>{money(s.owed)}</td><td>{money(s.paid)}</td><td>{s.balance > 0 ? money(s.balance) : "Settled"}</td><td>{new Date(s.lastActivity).toLocaleDateString()}</td></tr>)}
        </tbody></table></div>}
    </div>}
    {tab === "Loyalty / Points" && <div className="panel table-panel"><div className="toolbar"><strong>{customers ? `${totalPoints} points across ${customers.length} customers · 1 point per $1 of paid sales` : "Loading…"}</strong></div>
      {!customers ? <div className="empty">Loading…</div> : customers.length === 0 ? <div className="empty">No customers yet.</div>
        : <DataTable headers={["CUSTOMER", "GROUP", "POINTS", "TIER"]} rows={[...customers].sort((a, b) => b.loyaltyPoints - a.loyaltyPoints).map(c => [c.name, c.group, String(c.loyaltyPoints), loyaltyTier(c.loyaltyPoints)])}/>}
    </div>}
    {tab === "Customer Payments" && orphans.length > 0 && <p className="form-intro">Sales exist for customers not yet in the directory: {orphans.join(", ")} — add them to track credit and payments.</p>}
    {formOpen && <CustomerFormModal onClose={() => setFormOpen(false)} onSaved={msg => { setFormOpen(false); setNotice(msg); load(); }}/>}
  </>;
}

/** Customer Payments tab: credit balances per customer, manager-gated payment form. */
function CustomerPaymentsView({ canManage }: { canManage: boolean }) {
  const { statements, load } = useCustomers();
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = statements ?? [];
  const totalOwed = list.reduce((n, s) => n + Math.max(0, s.balance), 0);
  return <>
    <div className="panel table-panel"><div className="toolbar"><strong>{statements ? `${list.length} customer${list.length === 1 ? "" : "s"} · ${money(totalOwed)} outstanding credit` : "Loading…"}</strong>
      {canManage && <button className="primary-button" onClick={() => setFormOpen(true)}><Plus size={15}/> Record payment</button>}</div>
      {!statements ? <div className="empty">Loading…</div> : list.length === 0 ? <div className="empty">No customers yet.</div>
        : <DataTable headers={["CUSTOMER", "CREDIT OWED", "PAYMENTS RECEIVED", "BALANCE", "LAST ACTIVITY"]} rows={list.map(s => [s.name, money(s.owed), money(s.paid), s.balance > 0 ? money(s.balance) : "Settled", new Date(s.lastActivity).toLocaleDateString()])}/>}
    </div>
    {notice && <p className="checkout-success success-banner" role="status">{notice}</p>}
    {error && <p className="offline-banner error-banner" role="alert">{error}<button className="banner-close" aria-label="Dismiss" onClick={() => setError(null)}><X size={14}/></button></p>}
    {formOpen && <CustomerPaymentFormModal onClose={() => setFormOpen(false)} onSaved={msg => { setFormOpen(false); setNotice(msg); load(); }}/>}
  </>;
}

/** Record a customer payment (manager+): customer, amount, method. */
function CustomerPaymentFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: (msg: string) => void }) {
  const { customers } = useCustomers();
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setError(null);
    const res = await fetch("/api/customer-payments", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ customerId, amount: Number(amount), method, note }) });
    const data = await res.json() as { id?: string; error?: string };
    if (res.ok) onSaved(`Payment ${data.id} recorded.`); else { setError(data.error ?? "Could not record payment."); setBusy(false); }
  };
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}>
    <div className="modal-header"><h2>Record customer payment</h2><button aria-label="Close payment form" onClick={onClose}><X size={18}/></button></div>
    {!customers ? <p className="form-intro">Loading customers…</p> : customers.length === 0 ? <p className="form-intro">No customers in the directory yet — add one first.</p> : <>
      <label className="field"><span>Customer</span>
        <select value={customerId} onChange={e => setCustomerId(e.target.value)}>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="field"><span>Amount ($)</span><input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus/></label>
      <label className="field"><span>Method</span><select value={method} onChange={e => setMethod(e.target.value)}>{PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}</select></label>
      <label className="field"><span>Note</span><input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional reference (invoice #)…"/></label>
      {error && <p className="offline-banner error-banner" role="alert">{error}<button className="banner-close" aria-label="Dismiss" onClick={() => setError(null)}><X size={14}/></button></p>}
      <div className="modal-actions"><button className="outline-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy || !customerId || !amount} onClick={submit}>{busy ? "Saving…" : "Record payment"}</button></div>
    </>}
  </div></div>;
}

/** Add-customer form, inline panel (Add Customer tab) or modal (+ button). */
function CustomerForm({ onDone, inline }: { onDone: (name: string) => Promise<boolean>; inline?: boolean }) {
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  const [address, setAddress] = useState(""); const [group, setGroup] = useState("Default"); const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setError(null);
    const res = await fetch("/api/customers", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ name, phone, email, address, group, note }) });
    const data = await res.json() as { error?: string };
    if (res.ok) { if (await onDone(name)) { setName(""); setPhone(""); setEmail(""); setAddress(""); setGroup("Default"); setNote(""); } setBusy(false); }
    else { setError(data.error ?? "Could not create customer."); setBusy(false); }
  };
  const fields = <>
    <label className="field"><span>Name *</span><input value={name} onChange={e => setName(e.target.value)} placeholder="Customer name" autoFocus/></label>
    <label className="field"><span>Phone</span><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Optional"/></label>
    <label className="field"><span>Email</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Optional"/></label>
    <label className="field"><span>Address</span><input value={address} onChange={e => setAddress(e.target.value)} placeholder="Optional"/></label>
    <label className="field"><span>Group</span><input value={group} onChange={e => setGroup(e.target.value)} placeholder="Default"/></label>
    <label className="field"><span>Note</span><input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional"/></label>
    {error && <p className="offline-banner error-banner" role="alert">{error}<button className="banner-close" aria-label="Dismiss" onClick={() => setError(null)}><X size={14}/></button></p>}
    <div className="modal-actions"><button className="primary-button" disabled={busy || !name.trim()} onClick={submit}>{busy ? "Saving…" : "Save customer"}</button></div>
  </>;
  return inline ? <div className="panel purchase-form-panel"><div className="toolbar"><strong>New customer</strong></div>{fields}</div>
    : <div className="modal-backdrop" onClick={() => {}}><div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-header"><h2>Add customer</h2></div>{fields}</div></div>;
}
function CustomerFormInline({ onSaved }: { onSaved: (msg: string) => void }) {
  return <CustomerForm inline onDone={async name => { onSaved(`Customer "${name}" added.`); return true; }}/>;
}
function CustomerFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: (msg: string) => void }) {
  return <CustomerForm onDone={async name => { onSaved(`Customer "${name}" added.`); onClose(); return false; }}/>;
}

/** Stock transfers: real movements between locations, paired ledger entries, stock net-zero. */
function StockTransfersView({ catalog, canManage }: { catalog: Product[]; canManage: boolean }) {
  const [transfers, setTransfers] = useState<TransferLite[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch("/api/transfers").then(r => r.ok ? r.json() : Promise.reject()).then(d => setTransfers(d as TransferLite[])).catch(() => setTransfers([]));
  }, []);
  useEffect(load, [load]);
  const totalMoved = (transfers ?? []).reduce((n, t) => n + t.qty, 0);
  return <>
    <div className="panel table-panel"><div className="toolbar"><strong>{transfers ? `${transfers.length} transfer${transfers.length === 1 ? "" : "s"} · ${totalMoved} unit${totalMoved === 1 ? "" : "s"} moved` : "Loading…"}</strong>
      {canManage && <button className="primary-button" onClick={() => setFormOpen(true)}><Plus size={15}/> New transfer</button>}</div>
      {!transfers ? <div className="empty">Loading…</div> : transfers.length === 0 ? <div className="empty">No transfers yet — managers record them to move stock between locations (e.g. Warehouse → Storefront).</div>
        : <DataTable headers={["ID", "PRODUCT", "QTY", "FROM", "TO", "BY", "WHEN"]} rows={transfers.map(t => [t.id, t.productName + (t.note ? ` · ${t.note}` : ""), String(t.qty), t.from, t.to, t.by, new Date(t.createdAt).toLocaleDateString()])}/>}
    </div>
    {notice && <p className="checkout-success success-banner" role="status">{notice}</p>}
    {error && <p className="offline-banner error-banner" role="alert">{error}<button className="banner-close" aria-label="Dismiss" onClick={() => setError(null)}><X size={14}/></button></p>}
    {formOpen && <TransferFormModal catalog={catalog} onClose={() => setFormOpen(false)} onSaved={msg => { setFormOpen(false); setNotice(msg); load(); }}/>}
  </>;
}

/** New transfer form: product, qty (validated against stock), from/to locations. */
function TransferFormModal({ catalog, onClose, onSaved }: { catalog: Product[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const [sku, setSku] = useState(catalog[0]?.sku ?? "");
  const [qty, setQty] = useState("1");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = catalog.find(p => p.sku === sku);
  const submit = async () => {
    setBusy(true); setError(null);
    const res = await fetch("/api/transfers", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ sku, qty: Number(qty), from, to, note }) });
    const data = await res.json() as { id?: string; error?: string };
    if (res.ok) onSaved(`Transfer ${data.id} recorded — ${qty} × ${selected?.name} moved.`);
    else { setError(data.error ?? "Could not record transfer."); setBusy(false); }
  };
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}>
    <div className="modal-header"><h2>New stock transfer</h2><button aria-label="Close transfer form" onClick={onClose}><X size={18}/></button></div>
    {catalog.length === 0 ? <p className="form-intro">No products in the catalog yet.</p> : <>
      <label className="field"><span>Product</span>
        <select value={sku} onChange={e => { setSku(e.target.value); setQty("1"); }}>{catalog.map(p => <option key={p.sku} value={p.sku}>{p.name}</option>)}</select></label>
      <p className="form-intro">In stock: <strong>{selected?.stock ?? 0}</strong> unit{(selected?.stock ?? 0) === 1 ? "" : "s"} — transfers move units between locations; the total stays the same.</p>
      <label className="field"><span>Quantity</span><input type="number" min="1" max={selected?.stock ?? undefined} value={qty} onChange={e => setQty(e.target.value)} autoFocus/></label>
      <label className="field"><span>From *</span><input value={from} onChange={e => setFrom(e.target.value)} placeholder="e.g. Warehouse"/></label>
      <label className="field"><span>To *</span><input value={to} onChange={e => setTo(e.target.value)} placeholder="e.g. Storefront — Siem Reap"/></label>
      <label className="field"><span>Note</span><input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional reason or reference"/></label>
      {error && <p className="offline-banner error-banner" role="alert">{error}<button className="banner-close" aria-label="Dismiss" onClick={() => setError(null)}><X size={14}/></button></p>}
      <div className="modal-actions"><button className="outline-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy || !sku || !from.trim() || !to.trim() || !(Number(qty) >= 1)} onClick={submit}>{busy ? "Recording…" : "Record transfer"}</button></div>
    </>}
  </div></div>;
}

/** Purchases hub: PO management, receiving, history, returns, supplier payments, suppliers. */
function PurchasesHub({ catalog, canManage }: { catalog: Product[]; canManage: boolean }) {
  const tabs = ["Purchase Orders", "Receive Stock", "Purchase History", "Purchase Returns", "Supplier Payments", "Suppliers"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>("Purchase Orders");
  const [purchases, setPurchases] = useState<PurchaseLite[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receiveId, setReceiveId] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch("/api/purchases").then(r => r.ok ? r.json() : Promise.reject()).then(d => setPurchases(d as PurchaseLite[])).catch(() => { setPurchases([]); setError("Could not load purchase orders."); });
  }, []);
  useEffect(load, [load]);
  const poTotal = (p: PurchaseLite) => p.lines.reduce((n, l) => n + l.qty * l.cost, 0);
  const transition = async (id: string, action: "receive" | "return") => {
    setError(null);
    const res = await fetch("/api/purchases/" + encodeURIComponent(id), { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action }) });
    const data = await res.json() as { error?: string };
    if (res.ok) { setNotice(action === "receive" ? `${id} received — stock updated.` : `${id} returned to the supplier.`); load(); setReceiveId(null); }
    else setError(data.error ?? "Action failed.");
  };
  const pending = (purchases ?? []).filter(p => p.status === "Pending");
  const received = (purchases ?? []).filter(p => p.status === "Received");
  const returned = (purchases ?? []).filter(p => p.status === "Returned");
  // Suppliers derived from real PO history: name, order count, lifetime value, last activity.
  const suppliers = Array.from(new Set((purchases ?? []).map(p => p.supplier))).sort().map(name => {
    const pos = (purchases ?? []).filter(p => p.supplier === name);
    const last = pos.map(p => p.createdAt).sort().at(-1) as string;
    return { name, orders: pos.length, value: pos.filter(p => p.status !== "Returned").reduce((n, p) => n + poTotal(p), 0), pending: pos.filter(p => p.status === "Pending").length, last };
  });
  const current = tab === "Purchase Orders" ? pending : tab === "Purchase History" ? (purchases ?? []) : tab === "Purchase Returns" ? returned : tab === "Receive Stock" ? pending : [];
  return <>
    <PageHeading title="Purchases" sub="Purchase orders, receiving, returns, and suppliers" action={canManage && tab === "Purchase Orders" ? "New purchase" : undefined} onAction={() => setFormOpen(true)}/>
    <div className="subnav subnav-wrap">
      {tabs.map(t => <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => { setTab(t); setNotice(null); setError(null); }}>{t}</button>)}
    </div>
    {notice && <p className="checkout-success success-banner" role="status">{notice}</p>}
    {error && <p className="offline-banner error-banner" role="alert">{error}<button className="banner-close" aria-label="Dismiss" onClick={() => setError(null)}><X size={14}/></button></p>}
    {(tab === "Purchase Orders" || tab === "Receive Stock") && <div className="panel table-panel"><div className="toolbar"><strong>{purchases ? `${pending.length} pending order${pending.length === 1 ? "" : "s"}` : "Loading…"}</strong>{tab === "Purchase Orders" && canManage && <button className="primary-button" onClick={() => setFormOpen(true)}><Plus size={15}/> New purchase</button>}</div>
      {!purchases ? <div className="empty">Loading…</div> : pending.length === 0 ? <div className="empty">No pending purchase orders — create one to bring stock in.</div>
        : <div className="table-wrap"><table><thead><tr>{["PO", "SUPPLIER", "ITEMS", "TOTAL COST", "CREATED", "BY", ""].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
          {pending.map(p => <tr key={p.id}>
            <td><strong>{p.id}</strong></td><td>{p.supplier}{p.note && <span style={{ display: "block", color: "#9ba5ae", fontSize: 10 }}>{p.note}</span>}</td><td>{p.lines.length}</td><td>{money(poTotal(p))}</td><td>{new Date(p.createdAt).toLocaleDateString()}</td><td>{p.createdBy}</td>
            <td><div className="row-actions"><button className="text-button" onClick={() => setReceiveId(p.id)}>Receive</button></div></td>
          </tr>)}</tbody></table></div>}
    </div>}
    {tab === "Receive Stock" && <div className="panel table-panel"><div className="toolbar"><strong>Recently received</strong></div>
      {!purchases ? <div className="empty">Loading…</div> : received.length === 0 ? <div className="empty">Nothing received yet — receive a purchase order from the Purchase Orders tab.</div>
      : <DataTable headers={["PO", "SUPPLIER", "ITEMS", "VALUE", "RECEIVED"]} rows={received.slice(0, 8).map(p => [p.id, p.supplier, String(p.lines.length), money(poTotal(p)), p.receivedAt ? new Date(p.receivedAt).toLocaleDateString() : "—"])}/>}
    </div>}
    {tab === "Purchase History" && <div className="panel table-panel"><div className="toolbar"><strong>{purchases ? `${purchases.length} orders all-time · ${money((purchases ?? []).filter(p => p.status !== "Returned").reduce((n, p) => n + poTotal(p), 0))} lifetime` : "Loading…"}</strong></div>
      {!purchases ? <div className="empty">Loading…</div> : purchases.length === 0 ? <div className="empty">No purchase orders yet.</div>
        : <DataTable headers={["PO", "SUPPLIER", "ITEMS", "TOTAL COST", "STATUS", "CREATED", "RECEIVED"]} rows={[...purchases].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(p => [p.id, p.supplier, String(p.lines.length), money(poTotal(p)), p.status, new Date(p.createdAt).toLocaleDateString(), p.receivedAt ? new Date(p.receivedAt).toLocaleDateString() : "—"])}/>}
    </div>}
    {tab === "Purchase Returns" && <div className="panel table-panel"><div className="toolbar"><strong>{purchases ? `${returned.length} returned order${returned.length === 1 ? "" : "s"}` : "Loading…"}</strong></div>
      {!purchases ? <div className="empty">Loading…</div> : returned.length === 0 ? <div className="empty">No purchase returns — returning a received order puts the stock back out.</div>
        : <div className="table-wrap"><table><thead><tr>{["PO", "SUPPLIER", "ITEMS", "VALUE", "RETURNED", ""].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
          {returned.map(p => <tr key={p.id}><td><strong>{p.id}</strong></td><td>{p.supplier}</td><td>{p.lines.length}</td><td>{money(poTotal(p))}</td><td>{p.returnedAt ? new Date(p.returnedAt).toLocaleDateString() : "—"}</td>
            <td>{canManage && <div className="row-actions"><button className="text-button danger" onClick={() => { setError(null); setReceiveId(p.id); }} title="Details">View</button></div>}</td></tr>)}
        </tbody></table></div>}
    </div>}
    {tab === "Supplier Payments" && <SupplierPaymentsView canManage={canManage}/>}
    {tab === "Suppliers" && <div className="panel table-panel"><div className="toolbar"><strong>{purchases ? `${suppliers.length} supplier${suppliers.length === 1 ? "" : "s"} from order history` : "Loading…"}</strong></div>
      {!purchases ? <div className="empty">Loading…</div> : suppliers.length === 0 ? <div className="empty">No suppliers yet — they appear here once purchase orders exist.</div>
        : <DataTable headers={["SUPPLIER", "ORDERS", "LIFETIME VALUE", "PENDING", "LAST ORDER"]} rows={suppliers.map(s => [s.name, String(s.orders), money(s.value), String(s.pending), new Date(s.last).toLocaleDateString()])}/>}
    </div>}
    {formOpen && <PurchaseFormModal catalog={catalog} onClose={() => setFormOpen(false)} onSaved={msg => { setFormOpen(false); setNotice(msg); load(); }}/>}
    {receiveId && <ReceiveModal po={(purchases ?? []).find(p => p.id === receiveId) ?? null} canManage={canManage} onClose={() => setReceiveId(null)} onConfirm={id => transition(id, "receive")}/>}
  </>;
}

const PAYMENT_METHODS = ["Cash", "Bank transfer", "ABA", "ACLEDA", "Card", "Cheque", "Other"];
type SupplierLite = { id: string; name: string; phone: string; email: string; address: string; group: string; note: string; createdBy: string; createdAt: string; updatedAt: string };
type StatementLite = { id: string; name: string; group: string; phone: string; email: string; ordered: number; paid: number; balance: number; lastActivity: string };
type PaymentLite = { id: string; supplierId: string; supplierName: string; date: string; amount: number; method: string; note: string; createdBy: string; createdAt: string };

/** Shared supplier data: directory + computed statements (ordered vs paid). */
function useSuppliers() {
  const [suppliers, setSuppliers] = useState<SupplierLite[] | null>(null);
  const [statements, setStatements] = useState<StatementLite[] | null>(null);
  const [orphans, setOrphans] = useState<string[]>([]);
  const load = useCallback(() => {
    fetch("/api/suppliers").then(r => r.ok ? r.json() : Promise.reject()).then(d => setSuppliers(d as SupplierLite[])).catch(() => setSuppliers([]));
    fetch("/api/supplier-payments").then(r => r.ok ? r.json() : Promise.reject()).then((d: { statements: StatementLite[]; orphans: string[] }) => { setStatements(d.statements); setOrphans(d.orphans); }).catch(() => setStatements([]));
  }, []);
  useEffect(load, [load]);
  return { suppliers, statements, orphans, load };
}

/** Supplier Payments tab: balances per supplier, ledger, manager-gated payment form. */
function SupplierPaymentsView({ canManage, openPaymentFor }: { canManage: boolean; openPaymentFor?: string | null }) {
  const { statements, orphans, load } = useSuppliers();
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = statements ?? [];
  const totalOwed = list.reduce((n, s) => n + Math.max(0, s.balance), 0);
  return <>
    <div className="panel table-panel"><div className="toolbar"><strong>{statements ? `${list.length} supplier${list.length === 1 ? "" : "s"} · ${money(totalOwed)} outstanding` : "Loading…"}</strong>
      {canManage && <button className="primary-button" onClick={() => setFormOpen(true)}><Plus size={15}/> Record payment</button>}</div>
      {!statements ? <div className="empty">Loading…</div>
        : orphans.length > 0 && <p className="form-intro">Purchase orders exist for suppliers not yet in the directory: {orphans.join(", ")} — add them under the Suppliers tab to track balances.</p>}
      {statements && list.length === 0 ? <div className="empty">No suppliers yet — add one under the Suppliers tab, or they appear automatically from purchase orders.</div>
        : statements && <DataTable headers={["SUPPLIER", "ORDERED", "PAID", "BALANCE", "LAST ACTIVITY"]} rows={list.map(s => [s.name, money(s.ordered), money(s.paid), s.balance > 0 ? money(s.balance) : "Settled", new Date(s.lastActivity).toLocaleDateString()])}/>}
    </div>
    {notice && <p className="checkout-success success-banner" role="status">{notice}</p>}
    {error && <p className="offline-banner error-banner" role="alert">{error}<button className="banner-close" aria-label="Dismiss" onClick={() => setError(null)}><X size={14}/></button></p>}
    {formOpen && <PaymentFormModal onClose={() => setFormOpen(false)} onSaved={msg => { setFormOpen(false); setNotice(msg); load(); }} preselect={openPaymentFor ?? null}/>}
  </>;
}

/** Record a supplier payment (manager+): supplier, amount, method. */
function PaymentFormModal({ onClose, onSaved, preselect }: { onClose: () => void; onSaved: (msg: string) => void; preselect: string | null }) {
  const { suppliers } = useSuppliers();
  const [supplierId, setSupplierId] = useState(preselect ?? "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setError(null);
    const res = await fetch("/api/supplier-payments", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ supplierId, amount: Number(amount), method, note }) });
    const data = await res.json() as { id?: string; error?: string };
    if (res.ok) onSaved(`Payment ${data.id} recorded.`); else { setError(data.error ?? "Could not record payment."); setBusy(false); }
  };
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}>
    <div className="modal-header"><h2>Record supplier payment</h2><button aria-label="Close payment form" onClick={onClose}><X size={18}/></button></div>
    {!suppliers ? <p className="form-intro">Loading suppliers…</p> : suppliers.length === 0 ? <p className="form-intro">No suppliers in the directory yet — add one first.</p> : <>
      <label className="field"><span>Supplier</span>
        <select value={supplierId} onChange={e => setSupplierId(e.target.value)}>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="field"><span>Amount ($)</span><input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus/></label>
      <label className="field"><span>Method</span><select value={method} onChange={e => setMethod(e.target.value)}>{PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}</select></label>
      <label className="field"><span>Note</span><input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional reference (PO, invoice #)…"/></label>
      {error && <p className="offline-banner error-banner" role="alert">{error}<button className="banner-close" aria-label="Dismiss" onClick={() => setError(null)}><X size={14}/></button></p>}
      <div className="modal-actions"><button className="outline-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy || !supplierId || !amount} onClick={submit}>{busy ? "Saving…" : "Record payment"}</button></div>
    </>}
  </div></div>;
}

/** Suppliers hub: directory, add form, groups, payments, per-supplier statements. */
function SuppliersHub({ role }: { role: StaffRole }) {
  const tabs = ["All Suppliers", "Add Supplier", "Supplier Groups", "Supplier Payments", "Supplier Statements"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>("All Suppliers");
  const canManage = CAN.manageProducts(role);
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { suppliers, statements, load } = useSuppliers();
  const groups = Array.from(new Set((suppliers ?? []).map(s => s.group))).sort();
  return <>
    <PageHeading title="Suppliers" sub="Vendor directory, payments, and statements" action={canManage ? "Add supplier" : undefined} onAction={() => setFormOpen(true)}/>
    <div className="subnav subnav-wrap">
      {tabs.map(t => <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => { setTab(t); setNotice(null); }}>{t}</button>)}
    </div>
    {notice && <p className="checkout-success success-banner" role="status">{notice}</p>}
    {tab === "All Suppliers" && <div className="panel table-panel"><div className="toolbar"><strong>{suppliers ? `${suppliers.length} supplier${suppliers.length === 1 ? "" : "s"}` : "Loading…"}</strong></div>
      {!suppliers ? <div className="empty">Loading…</div> : suppliers.length === 0 ? <div className="empty">No suppliers yet — add one, or they appear automatically from purchase orders.</div>
        : <DataTable headers={["SUPPLIER", "GROUP", "PHONE", "EMAIL", "BALANCE"]} rows={(statements ?? []).length === 0 ? suppliers.map(s => [s.name, s.group, s.phone || "—", s.email || "—", "—"]) : (statements ?? []).map(st => {
          const s = suppliers.find(x => x.id === st.id);
          return [st.name, st.group, s?.phone || "—", s?.email || "—", st.balance > 0 ? money(st.balance) : "Settled"];
        })}/>}
    </div>}
    {tab === "Add Supplier" && (canManage ? <SupplierFormInline onSaved={msg => { setNotice(msg); load(); setTab("All Suppliers"); }}/> : <div className="panel"><div className="empty">Manager or admin access required to add suppliers.</div></div>)}
    {tab === "Supplier Groups" && <div className="panel table-panel"><div className="toolbar"><strong>{suppliers ? `${groups.length} group${groups.length === 1 ? "" : "s"}` : "Loading…"}</strong></div>
      {!suppliers ? <div className="empty">Loading…</div> : groups.length === 0 ? <div className="empty">No groups yet.</div>
        : <DataTable headers={["GROUP", "SUPPLIERS", "OUTSTANDING"]} rows={groups.map(g => {
          const inG = (statements ?? []).filter(st => st.group === g);
          return [g, String(inG.length), money(inG.reduce((n, s) => n + Math.max(0, s.balance), 0))];
        })}/>}
    </div>}
    {tab === "Supplier Payments" && <SupplierPaymentsView canManage={canManage}/>}
    {tab === "Supplier Statements" && <div className="panel table-panel"><div className="toolbar"><strong>Per-supplier statement: ordered vs paid</strong></div>
      {!statements ? <div className="empty">Loading…</div> : statements.length === 0 ? <div className="empty">No suppliers yet.</div>
        : <div className="table-wrap"><table><thead><tr>{["SUPPLIER", "ORDERED", "PAID", "BALANCE", "LAST ACTIVITY"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
          {statements.map(st => <tr key={st.id}><td><strong>{st.name}</strong></td><td>{money(st.ordered)}</td><td>{money(st.paid)}</td><td>{st.balance > 0 ? money(st.balance) : "Settled"}</td><td>{new Date(st.lastActivity).toLocaleDateString()}</td></tr>)}
        </tbody></table></div>}
    </div>}
    {formOpen && <SupplierFormModal onClose={() => setFormOpen(false)} onSaved={msg => { setFormOpen(false); setNotice(msg); load(); }}/>}
  </>;
}

/** Add-supplier form, inline panel (Add Supplier tab) or modal (+ button). */
function SupplierForm({ onDone, inline }: { onDone: (name: string) => Promise<boolean>; inline?: boolean }) {
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  const [address, setAddress] = useState(""); const [group, setGroup] = useState("Default"); const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setError(null);
    const res = await fetch("/api/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ name, phone, email, address, group, note }) });
    const data = await res.json() as { error?: string };
    if (res.ok) { if (await onDone(name)) { setName(""); setPhone(""); setEmail(""); setAddress(""); setGroup("Default"); setNote(""); } setBusy(false); }
    else { setError(data.error ?? "Could not create supplier."); setBusy(false); }
  };
  const fields = <>
    <label className="field"><span>Name *</span><input value={name} onChange={e => setName(e.target.value)} placeholder="Supplier name" autoFocus/></label>
    <label className="field"><span>Phone</span><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Optional"/></label>
    <label className="field"><span>Email</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Optional"/></label>
    <label className="field"><span>Address</span><input value={address} onChange={e => setAddress(e.target.value)} placeholder="Optional"/></label>
    <label className="field"><span>Group</span><input value={group} onChange={e => setGroup(e.target.value)} placeholder="Default"/></label>
    <label className="field"><span>Note</span><input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional"/></label>
    {error && <p className="offline-banner error-banner" role="alert">{error}<button className="banner-close" aria-label="Dismiss" onClick={() => setError(null)}><X size={14}/></button></p>}
    <div className="modal-actions"><button className="primary-button" disabled={busy || !name.trim()} onClick={submit}>{busy ? "Saving…" : "Save supplier"}</button></div>
  </>;
  return inline ? <div className="panel purchase-form-panel"><div className="toolbar"><strong>New supplier</strong></div>{fields}</div>
    : <div className="modal-backdrop" onClick={() => {}}><div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-header"><h2>Add supplier</h2></div>{fields}</div></div>;
}
function SupplierFormInline({ onSaved }: { onSaved: (msg: string) => void }) {
  return <SupplierForm inline onDone={async name => { onSaved(`Supplier "${name}" added.`); return true; }}/>;
}
function SupplierFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: (msg: string) => void }) {
  return <SupplierForm onDone={async name => { onSaved(`Supplier "${name}" added.`); onClose(); return false; }}/>;
}

/** Receive confirmation: shows exactly what will land in stock before committing. */
function ReceiveModal({ po, canManage, onClose, onConfirm }: { po: PurchaseLite | null; canManage: boolean; onClose: () => void; onConfirm: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}>
    <div className="modal-header"><h2>{po && po.status !== "Pending" ? po.id : `Receive ${po?.id ?? ""}`}</h2><button aria-label="Close receive dialog" onClick={onClose}><X size={18}/></button></div>
    {!po ? <p className="refund-summary">Purchase order not found.</p> : <>
      <p className="refund-summary"><strong>{po.supplier}</strong> · {po.lines.length} line{po.lines.length === 1 ? "" : "s"} · total <strong>{money(po.lines.reduce((n, l) => n + l.qty * l.cost, 0))}</strong></p>
      <div className="table-wrap" style={{ margin: "12px 0 0" }}><table><thead><tr>{["PRODUCT", "QTY", "UNIT COST", "STOCK IN"].map(h => <th key={h} style={{ padding: "8px 10px" }}>{h}</th>)}</tr></thead><tbody>
        {po.lines.map(l => <tr key={l.sku}><td>{l.name}</td><td>{l.qty}</td><td>{money(l.cost)}</td><td><strong>+{l.qty}</strong></td></tr>)}
      </tbody></table></div>
      <p className="form-intro" style={{ marginTop: 10 }}>{po.status === "Pending" ? "Receiving adds these quantities to stock, updates each product's cost to the PO price, and records the movement in the ledger." : `This order is ${po.status.toLowerCase()} — no further receiving actions are available.`}</p>
      <div className="modal-actions"><button className="outline-button" onClick={onClose}>Close</button>{po.status === "Pending" && <button className="primary-button" disabled={busy || !canManage} onClick={() => { setBusy(true); onConfirm(po.id); }}>{busy ? "Receiving…" : "Confirm receive"}</button>}</div>
    </>}
  </div></div>;
}
const EXPENSE_CATEGORIES = ["Rent", "Utilities", "Supplies", "Salaries", "Marketing", "Maintenance", "Transport", "Other"];

/** New purchase order: supplier + product lines; receiving it stocks the ledger. */
function PurchaseFormModal({ catalog, onClose, onSaved }: { catalog: Product[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<{ sku: string; qty: string; cost: string }[]>([{ sku: catalog[0]?.sku ?? "", qty: "1", cost: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setLine = (i: number, patch: Partial<{ sku: string; qty: string; cost: string }>) => setLines(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l));
  const submit = async () => {
    if (!supplier.trim()) return setError("Supplier name is required.");
    setBusy(true); setError(null);
    const res = await fetch("/api/purchases", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ supplier: supplier.trim(), note, lines: lines.map(l => ({ sku: l.sku, qty: Number(l.qty), cost: l.cost === "" ? undefined : Number(l.cost) })) }) });
    const data = await res.json() as { error?: string; id?: string };
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Could not create the purchase order.");
    onSaved(`Purchase order ${data.id} created — receive it to add the stock.`);
  };
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" style={{ width: "min(560px, 100%)" }} onClick={e => e.stopPropagation()}>
    <div className="modal-header"><h2>New purchase order</h2><button aria-label="Close purchase form" onClick={onClose}><X size={18}/></button></div>
    <div className="form-grid">
      <label>Supplier<input autoFocus placeholder="e.g. Fresh Foods Co." value={supplier} onChange={e => { setSupplier(e.target.value); setError(null); }}/></label>
      <label>Note (optional)<input placeholder="e.g. Weekly delivery" value={note} onChange={e => setNote(e.target.value)}/></label>
    </div>
    <p className="form-intro" style={{ margin: "12px 0 6px", fontWeight: 700, color: "#566575", fontSize: 11 }}>Lines</p>
    {lines.map((l, i) => {
      const p = catalog.find(x => x.sku === l.sku);
      return <div className="po-line" key={i}>
        <select value={l.sku} onChange={e => setLine(i, { sku: e.target.value, cost: p ? String(p.cost) : "" })}>{catalog.map(x => <option key={x.sku} value={x.sku}>{x.name}</option>)}</select>
        <input type="number" min="1" placeholder="Qty" value={l.qty} onChange={e => setLine(i, { qty: e.target.value })}/>
        <input type="number" min="0" step="0.01" placeholder="Unit cost" value={l.cost} onChange={e => setLine(i, { cost: e.target.value })}/>
        {lines.length > 1 && <button className="text-button danger" aria-label="Remove line" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}><X size={14}/></button>}
      </div>;
    })}
    <button className="outline-button" style={{ marginTop: 8 }} onClick={() => setLines(ls => [...ls, { sku: catalog[0]?.sku ?? "", qty: "1", cost: "" }])}><Plus size={14}/> Add line</button>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="modal-actions"><button className="outline-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy} onClick={submit}>{busy ? "Creating…" : "Create order"}</button></div>
  </div></div>;
}

/** Record expense: category, amount, optional note. */
function ExpenseFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: (msg: string) => void }) {
  const [form, setForm] = useState({ category: "Supplies", amount: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return setError("Amount must be a positive number.");
    setBusy(true); setError(null);
    const res = await fetch("/api/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ category: form.category, amount, note: form.note }) });
    const data = await res.json() as { error?: string; id?: string };
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Could not record the expense.");
    onSaved(`Expense ${data.id} recorded.`);
  };
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}>
    <div className="modal-header"><h2>Record expense</h2><button aria-label="Close expense form" onClick={onClose}><X size={18}/></button></div>
    <div className="form-grid">
      <label>Category<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Amount (USD)<input autoFocus type="number" min="0.01" step="0.01" placeholder="0.00" value={form.amount} onChange={e => { setForm({ ...form, amount: e.target.value }); setError(null); }}/></label>
      <label style={{ gridColumn: "1 / -1" }}>Note (optional)<input placeholder="e.g. September electricity" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}/></label>
    </div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="modal-actions"><button className="outline-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Record expense"}</button></div>
  </div></div>;
}

/** An "honest placeholder" panel for modules that aren't built yet — says so plainly. */
function SoonPanel({ title, what }: { title: string; what: string }) {
  return <div className="panel empty-panel"><div className="empty"><strong>{title}</strong><p>{what}</p><span className="you-chip">Module not built yet — no invented data shown</span></div></div>;
}

/** Thin data rows for hub views fed straight from state (no server paging needed). */
function HubTable({ headers, rows, empty }: { headers: string[]; rows: string[][]; empty: string }) {
  if (rows.length === 0) return <div className="panel empty-panel"><div className="empty"><strong>{empty}</strong><p>Nothing to show yet.</p></div></div>;
  return <div className="panel table-panel"><DataTable headers={headers} rows={rows}/></div>;
}

/** Transactions hub: the 11-view transaction ledger. */
function TransactionsHub({ sales, onRefund, storeName, storeLocation, receiptFooter, currency, role, orderSearch, canManage, catalog }: {
  sales: Sale[]; onRefund: (id: string, reason: string, done?: (ok: boolean) => void) => void;
  storeName: string; storeLocation: string; receiptFooter: string; currency: string; role: StaffRole; orderSearch?: string;
  canManage: boolean; catalog: Product[];
}) {
  const tabs = ["All Transactions", "Sales", "Purchases", "Sales Returns", "Purchase Returns", "Payments", "Refunds", "Expenses", "Stock Adjustments", "Stock Transfers", "Cash Drawer"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>("All Transactions");
  const [viewing, setViewing] = useState<Sale | null>(null);
  const [refunding, setRefunding] = useState<Sale | null>(null);
  const [refundNote, setRefundNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(orderSearch ?? "");
  // Server-backed data for the purchase/expense/adjustment views; loaded lazily per hub mount.
  const [purchases, setPurchases] = useState<PurchaseLite[] | null>(null);
  const [expenses, setExpenses] = useState<ExpenseLite[] | null>(null);
  const [movements, setMovements] = useState<MovementLite[] | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [poFormOpen, setPoFormOpen] = useState(false);
  const [expFormOpen, setExpFormOpen] = useState(false);
  const loadLedger = useCallback(() => {
    fetch("/api/purchases").then(r => { if (!r.ok) throw 0; return r.json(); }).then(d => setPurchases(d as PurchaseLite[])).catch(() => { setPurchases([]); setLedgerError("Could not load purchases."); });
    fetch("/api/expenses").then(r => { if (!r.ok) throw 0; return r.json(); }).then(d => setExpenses(d as ExpenseLite[])).catch(() => { setExpenses([]); setLedgerError("Could not load expenses."); });
    fetch("/api/movements?limit=300").then(r => { if (!r.ok) throw 0; return r.json(); }).then(d => setMovements(d as MovementLite[])).catch(() => setMovements([]));
  }, []);
  useEffect(loadLedger, [loadLedger]);
  const reloadLedger = () => { setPurchases(null); setExpenses(null); loadLedger(); };
  const startRefund = (s: Sale) => { setViewing(null); setRefundNote(""); setRefunding(s); };
  const confirmRefund = () => { if (!refunding || busy) return; setBusy(true); onRefund(refunding.id, refundNote, ok => { setBusy(false); setRefunding(null); }); };
  const q = query.toLowerCase().trim();
  const notRefunded = sales.filter(s => s.status !== "Refunded");
  const refunded = sales.filter(s => s.status === "Refunded");
  const pending = sales.filter(s => s.status === "Pending");
  const refundTotal = refunded.reduce((n, s) => n + saleTotal(s), 0);
  const cashSales = notRefunded.filter(s => s.payment === "Cash");
  const nonCash = notRefunded.filter(s => s.payment !== "Cash");
  // Sales with a stock-affecting manual adjustment ledger entry are reconciled from /api/movements below.
  const byTab: Record<string, { headers: string[]; rows: string[][]; empty: string }> = {
    "All Transactions": {
      headers: ["INVOICE", "CUSTOMER", "DATE", "TYPE", "AMOUNT", "STATUS"],
      rows: [...sales].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, 40).map(s => [s.id, s.customer, s.date, "Sale", money(saleTotal(s)), s.status]),
      empty: "No transactions yet",
    },
    "Sales": {
      headers: ["INVOICE", "CUSTOMER", "DATE", "PAYMENT", "AMOUNT", "STATUS"],
      rows: notRefunded.slice(0, 40).map(s => [s.id, s.customer, s.date, s.payment, money(saleTotal(s)), s.status]),
      empty: "No sales yet",
    },
    "Sales Returns": { headers: ["INVOICE", "CUSTOMER", "DATE", "AMOUNT", "REASON", "STATUS"], rows: refunded.map(s => [s.id, s.customer, s.date, money(saleTotal(s)), s.refundReason || "—", "Refunded"]), empty: "No sales returns yet" },
    "Payments": { headers: ["INVOICE", "CUSTOMER", "METHOD", "DATE", "AMOUNT", "STATUS"], rows: notRefunded.map(s => [s.id, s.customer, s.payment, s.date, money(saleTotal(s)), s.status]), empty: "No payments yet" },
    "Refunds": { headers: ["INVOICE", "CUSTOMER", "DATE", "AMOUNT", "REASON", "STATUS"], rows: refunded.map(s => [s.id, s.customer, s.date, money(saleTotal(s)), s.refundReason || "—", "Refunded"]), empty: "No refunds yet" },
  };
  const current = byTab[tab];
  const rows = current ? current.rows.filter(r => r.join(" ").toLowerCase().includes(q)) : [];
  return <>
    <PageHeading title="Transactions" sub="The complete transaction ledger across every module"/>
    <div className="subnav subnav-wrap">
      {tabs.map(t => <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => { setTab(t); setQuery(""); }}>{t}</button>)}
    </div>
    {current && <div className="panel table-panel"><div className="toolbar"><strong>{q ? `${rows.length} of ${current.rows.length} transactions` : `${current.rows.length} ${tab.toLowerCase()}`}</strong><div className="filter"><Search size={15}/><input placeholder="Search this view" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button className="filter-clear" aria-label="Clear search" onClick={()=>setQuery("")}><X size={13}/></button>}</div></div>
      {rows.length === 0 ? <div className="empty">{q ? "Nothing matches your search." : current.empty}</div> : <DataTable headers={current.headers} rows={rows}/>}
    </div>}
    {tab === "Purchases" && <div className="panel table-panel"><div className="toolbar"><strong>{purchases ? `${purchases.filter(p => p.status !== "Returned").length} purchase orders` : "Loading…"}</strong><button className="primary-button" disabled={!canManage} title={canManage ? undefined : "Managers only"} onClick={() => setPoFormOpen(true)}><Plus size={15}/> New purchase</button></div>
      {!purchases ? <div className="empty">Loading…</div> : purchases.filter(p => p.status !== "Returned").length === 0 ? <div className="empty">No purchase orders yet — create one to receive stock from a supplier.</div>
        : <div className="table-wrap"><table><thead><tr>{["PO", "SUPPLIER", "ITEMS", "TOTAL COST", "STATUS", "CREATED", ""].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
          {purchases.filter(p => p.status !== "Returned").map(p => <tr key={p.id}>
            <td><strong>{p.id}</strong></td><td>{p.supplier}</td><td>{p.lines.length}</td><td>{money(p.lines.reduce((n, l) => n + l.qty * l.cost, 0))}</td>
            <td><span className={`status ${p.status === "Received" ? "paid" : "pending"}`}>{p.status}</span></td><td>{new Date(p.createdAt).toLocaleDateString()}</td>
            <td><div className="row-actions">{canManage && p.status === "Pending" ? <button className="text-button" onClick={() => { fetch("/api/purchases/" + encodeURIComponent(p.id), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "receive" }), credentials: "same-origin" }).then(r => r.json().then(d => ({ ok: r.ok, d }))).then(({ ok, d }) => { if (ok) reloadLedger(); else setLedgerError(d.error ?? "Receive failed."); }); }}>Receive</button> : p.status === "Received" ? <span className="you-chip">received {p.receivedAt ? new Date(p.receivedAt).toLocaleDateString() : ""}</span> : null}</div></td>
          </tr>)}</tbody></table></div>}
    </div>}
    {tab === "Purchase Returns" && <div className="panel table-panel"><div className="toolbar"><strong>{purchases ? `${purchases.filter(p => p.status === "Returned").length} returned orders` : "Loading…"}</strong></div>
      {!purchases ? <div className="empty">Loading…</div> : purchases.filter(p => p.status === "Returned").length === 0 ? <div className="empty">No purchase returns — returned supplier deliveries will appear here.</div>
        : <DataTable headers={["PO", "SUPPLIER", "ITEMS", "VALUE", "RETURNED"]} rows={purchases.filter(p => p.status === "Returned").map(p => [p.id, p.supplier, String(p.lines.length), money(p.lines.reduce((n, l) => n + l.qty * l.cost, 0)), p.returnedAt ? new Date(p.returnedAt).toLocaleDateString() : "—"])}/>}
    </div>}
    {tab === "Expenses" && <div className="panel table-panel"><div className="toolbar"><strong>{expenses ? `${expenses.length} expenses` : "Loading…"}</strong><button className="primary-button" disabled={!canManage} title={canManage ? undefined : "Managers only"} onClick={() => setExpFormOpen(true)}><Plus size={15}/> Record expense</button></div>
      {!expenses ? <div className="empty">Loading…</div> : expenses.length === 0 ? <div className="empty">No expenses recorded yet.</div>
        : <DataTable headers={["ID", "DATE", "CATEGORY", "NOTE", "AMOUNT", "BY"]} rows={expenses.map(e => [e.id, new Date(e.date).toLocaleDateString(), e.category, e.note || "—", money(-e.amount), e.createdBy])}/>}
    </div>}
    {tab === "Stock Adjustments" && <div className="panel table-panel"><div className="toolbar"><strong>{movements ? `${movements.filter(m => m.reason === "adjustment").length} manual adjustments` : "Loading…"}</strong></div>
      {!movements ? <div className="empty">Loading…</div> : movements.filter(m => m.reason === "adjustment").length === 0 ? <div className="empty">No manual adjustments recorded — stock corrections land here from the Stock page.</div>
        : <DataTable headers={["PRODUCT", "SKU", "CHANGE", "NOTE", "BY", "WHEN"]} rows={movements.filter(m => m.reason === "adjustment").map(m => [m.productName, m.sku, `${m.delta > 0 ? "+" : ""}${m.delta}`, m.note || "—", m.by, new Date(m.createdAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })])}/>}
    </div>}
    {tab === "Stock Transfers" && <StockTransfersView catalog={catalog} canManage={canManage}/>}
    {tab === "Cash Drawer" && <div className="panel table-panel"><div className="toolbar"><strong>Cash drawer — today</strong></div>
      <DataTable headers={["ITEM", "AMOUNT", "DETAIL"]} rows={[
        ["Cash sales", money(cashSales.reduce((n, s) => n + saleTotal(s), 0)), `${cashSales.length} cash sale${cashSales.length === 1 ? "" : "s"}`],
        ["Non-cash takings", money(nonCash.reduce((n, s) => n + saleTotal(s), 0)), "ABA Pay + Credit"],
        ["Refunds (all methods)", money(-refundTotal), `${refunded.length} refund${refunded.length === 1 ? "" : "s"}`],
        ["Expected cash in drawer", money(cashSales.reduce((n, s) => n + saleTotal(s), 0) - refundTotal), "cash sales minus refunds"],
      ]}/></div>}
    {ledgerError && <p className="offline-banner error-banner" role="alert">{ledgerError}<button className="banner-close" aria-label="Dismiss" onClick={() => setLedgerError(null)}><X size={14}/></button></p>}
    {poFormOpen && <PurchaseFormModal catalog={catalog} onClose={() => setPoFormOpen(false)} onSaved={msg => { setPoFormOpen(false); setLedgerError(null); reloadLedger(); }}/>}
    {expFormOpen && <ExpenseFormModal onClose={() => setExpFormOpen(false)} onSaved={msg => { setExpFormOpen(false); setLedgerError(null); reloadLedger(); }}/>}
    {viewing && <ReceiptModal sale={viewing} onClose={()=>setViewing(null)} onRefund={startRefund} storeName={storeName} storeLocation={storeLocation} receiptFooter={receiptFooter} currency={currency}/>}
    {refunding && <div className="modal-backdrop" onClick={()=>setRefunding(null)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-header"><h2>Refund {refunding.id}</h2><button aria-label="Close refund dialog" onClick={()=>setRefunding(null)}><X size={18}/></button></div><p className="refund-summary">Refunding <strong>{money(saleTotal(refunding))}</strong> ({itemCount(refunding)} items) from <strong>{refunding.customer}</strong> back via {refunding.payment}.</p><label>Reason<textarea autoFocus placeholder="e.g. Damaged goods, customer changed their mind" value={refundNote} onChange={e=>setRefundNote(e.target.value)}/></label><div className="modal-actions"><button className="outline-button" onClick={()=>setRefunding(null)}>Cancel</button><button className="primary-button" disabled={busy} onClick={confirmRefund}>{busy ? "Refunding…" : `Confirm refund ${money(saleTotal(refunding))}`}</button></div></div></div>}
  </>;
}

/** Products hub: catalog management with add/edit/import/export. */
function ProductsHub({ catalog, sales, query, onQuery, onUpsert, onDelete, onAdjust, canManage, initialAdd, initialTab }: {
  catalog: Product[]; sales: Sale[]; query: string; onQuery: (q: string) => void;
  onUpsert: (p: Product, done?: (ok: boolean) => void) => void; onDelete: (sku: string, done?: (ok: boolean) => void) => void;
  onAdjust: (sku: string, delta: number) => void; canManage: boolean; initialAdd?: boolean; initialTab?: "All Products" | "Categories";
}) {
  const tabs = ["All Products", "Add Product", "Categories", "Brands", "Units", "Variants", "Barcode", "Price Lists", "Import / Export"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>(initialTab ?? "All Products");
  const [formOpen, setFormOpen] = useState(initialAdd === true && canManage);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const q = query.toLowerCase().trim();
  const rows = catalog.filter(p => `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(q));
  const soldBySku = new Map<string, number>();
  for (const s of sales) if (s.status !== "Refunded") for (const l of s.lines) soldBySku.set(l.sku, (soldBySku.get(l.sku) ?? 0) + l.qty);
  const exportCSV = () => {
    const head = "Name,SKU,Category,Price,Cost,Stock,Sold\n";
    const body = catalog.map(p => [csvCell(p.name), csvCell(p.sku), csvCell(p.category), p.price.toFixed(2), p.cost.toFixed(2), String(p.stock), String(soldBySku.get(p.sku) ?? 0)].join(",")).join("\n");
    download(`products-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8", head + body);
  };
  const importCSV = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return setBanner(null) as void;
      const sep = lines[0].includes(";") ? ";" : ",";
      const idx = (h: string) => lines[0].toLowerCase().split(sep).findIndex(c => c.trim().replace(/^"|"$/g, "") === h);
      const iName = idx("name"), iSku = idx("sku"), iCat = idx("category"), iPrice = idx("price"), iCost = idx("cost"), iStock = idx("stock");
      if (iName < 0 || iSku < 0) return setBanner("Import failed — the CSV needs at least Name and SKU columns.");
      const cell = (r: string[], i: number) => (r[i] ?? "").trim().replace(/^"|"$/g, "");
      let ok = 0, failed = 0;
      const next = () => {
        if (ok + failed === lines.length - 1) setBanner(`Import finished — ${ok} product${ok === 1 ? "" : "s"} imported${failed ? `, ${failed} skipped (bad rows)` : ""}.`);
      };
      lines.slice(1).forEach(raw => {
        const r = raw.split(sep);
        const name = cell(r, iName), sku = cell(r, iSku).toUpperCase();
        const price = parseFloat(cell(r, iPrice)), cost = cell(r, iCost) === "" ? 0 : parseFloat(cell(r, iCost));
        const stock = cell(r, iStock) === "" ? 0 : parseInt(cell(r, iStock), 10);
        if (!name || !sku || !Number.isFinite(price) || price <= 0 || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(stock) || stock < 0) { failed++; next(); return; }
        const p: Product = { name, sku, category: cell(r, iCat) || "Uncategorized", price, cost, stock };
        onUpsert(p, ok2 => { ok2 ? ok++ : failed++; next(); });
      });
    };
    reader.readAsText(file);
  };
  return <>
    <PageHeading title="Products" sub="Manage your catalog, pricing, and categories" action={canManage && tab === "All Products" ? "Add product" : undefined} onAction={() => { setBanner(null); setFormOpen(true); }}/>
    <div className="subnav subnav-wrap">
      {tabs.map(t => <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => { setTab(t); setBanner(null); }}>{t}</button>)}
    </div>
    {banner && <p className="checkout-success success-banner" role="status">{banner}</p>}
    {tab === "All Products" && <Products catalog={catalog} query={query} onQuery={onQuery} onUpsert={onUpsert} onDelete={onDelete} onAdjust={onAdjust} canManage={canManage} embed/>}
    {tab === "Add Product" && (canManage
      ? <Products catalog={catalog} query="" onQuery={() => {}} onUpsert={onUpsert} onDelete={onDelete} onAdjust={onAdjust} canManage embed initialAdd/>
      : <div className="panel empty-panel"><div className="empty"><strong>Managers only</strong><p>Ask a manager or administrator to add products.</p></div></div>)}
    {tab === "Categories" && <CategoriesView catalog={catalog} canManage={canManage}/>}
    {tab === "Brands" && <SoonPanel title="Brands" what="Brand management will live here — attach a brand to each product and filter the catalog by it."/>}
    {tab === "Units" && <SoonPanel title="Units" what="Units of measure (pcs, kg, box) will be defined here and used on purchase orders and stock counts."/>}
    {tab === "Variants" && <SoonPanel title="Variants" what="Product variants (size, color) will be managed here — one parent product, many sellable variants."/>}
    {tab === "Barcode" && <SoonPanel title="Barcode" what="Barcode assignment and label printing will be configured here for scanner-ready checkouts."/>}
    {tab === "Price Lists" && <SoonPanel title="Price lists" what="Customer-specific or wholesale price lists will be managed here."/>}
    {tab === "Import / Export" && <div className="panel"><div className="panel-header"><h2>Import / export catalog</h2></div>
      <p className="form-intro">Export the full catalog to CSV (opens in Excel), or import products from a CSV with columns <code>Name,SKU,Category,Price,Cost,Stock</code>. Existing SKUs are updated, new ones are created.</p>
      <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
        <button className="outline-button" onClick={exportCSV}><Download size={14}/> Export CSV</button>
        <label className="outline-button image-label" style={{ display: "inline-flex" }}><Upload size={14}/> Import CSV<input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={e => { importCSV(e.target.files?.[0]); e.target.value = ""; }}/></label>
      </div>
    </div>}
    {formOpen && <ProductFormModal catalog={catalog} initial={editing} onClose={() => { setFormOpen(false); setEditing(null); }} onSave={(p, done) => { onUpsert(p, ok => { if (ok) setBanner(`${p.name} saved.`); done(ok); }); }}/>}
    {deleting && <div className="modal-backdrop" onClick={() => setDeleting(null)}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-header"><h2>Delete product</h2><button aria-label="Close delete dialog" onClick={() => setDeleting(null)}><X size={18}/></button></div><p className="refund-summary">Delete <strong>{deleting.name}</strong> ({deleting.sku}) from the catalog? This cannot be undone.</p><div className="modal-actions"><button className="outline-button" onClick={() => setDeleting(null)}>Cancel</button><button className="primary-button danger-button" onClick={() => { onDelete(deleting.sku, ok => { if (ok) setBanner(`${deleting.name} deleted.`); }); setDeleting(null); }}>Delete product</button></div></div></div>}
  </>;
}

/** Stock hub: 7 views over the live catalog and the movement ledger. */
function StockHub({ catalog, canManage, onAdjust, initialTab }: { catalog: Product[]; canManage: boolean; onAdjust: (sku: string, delta: number) => void; initialTab?: (typeof tabs)[number] }) {
  const tabs = ["Stock Overview", "Stock Movement", "Stock Adjustment", "Stock Transfer", "Stock Count", "Low Stock", "Out of Stock"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>(initialTab ?? "Stock Overview");
  const [movements, setMovements] = useState<{ sku: string; productName: string; delta: number; reason: string; note: string; by: string; refId: string; createdAt: string }[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/movements?limit=200").then(r => r.ok ? r.json() : Promise.reject()).then(d => { if (alive) setMovements(d as typeof movements); }).catch(() => { if (alive) setMovements([]); });
    return () => { alive = false; };
  }, []);
  const low = catalog.filter(p => p.stock > 0 && p.stock < LOW_STOCK_LIMIT);
  const out = catalog.filter(p => p.stock === 0);
  const stockStatus = (stock: number) => stock === 0 ? ["Out of stock", "refunded"] as const : stock < 10 ? ["Low stock", "pending"] as const : ["Healthy", "paid"] as const;
  const mv = (reason: string) => (movements ?? []).filter(m => m.reason === reason);
  const adjustRows = mv("adjustment");
  const transferRows = [...mv("transfer-in"), ...mv("transfer-out")];
  const countRows = catalog.map(p => {
    const counted = movements?.filter(m => m.sku === p.sku).reduce((n, m) => n + m.delta, 0) ?? 0;
    return [p.name, p.sku, String(p.stock), String(counted), counted === p.stock ? "OK" : "Variance"]; 
  });
  return <>
    <PageHeading title="Stock" sub="Monitor and adjust stock levels across your store"/>
    <div className="subnav subnav-wrap">
      {tabs.map(t => <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button>)}
    </div>
    {tab === "Stock Overview" && <StockPage catalog={catalog} canManage={canManage} onAdjust={onAdjust} embed/>}
    {tab === "Stock Movement" && <div className="panel table-panel"><div className="toolbar"><strong>{movements ? `${movements.length} movements` : "Loading ledger…"}</strong></div>
      {!movements ? <div className="empty">Loading…</div> : movements.length === 0 ? <div className="empty">No movements recorded yet — sales, refunds, and adjustments will appear here.</div>
        : <div className="table-wrap"><table><thead><tr>{["PRODUCT", "SKU", "CHANGE", "REASON", "REFERENCE", "BY", "WHEN"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
          {movements.map((m, i) => <tr key={i}><td><strong>{m.productName}</strong></td><td>{m.sku}</td><td><strong className={m.delta < 0 ? "" : ""}>{m.delta > 0 ? `+${m.delta}` : m.delta}</strong></td><td>{m.reason}</td><td>{m.refId || "—"}</td><td>{m.by}</td><td>{new Date(m.createdAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</td></tr>
        )}</tbody></table></div>}
    </div>}
    {tab === "Stock Adjustment" && (canManage ? <StockAdjustment catalog={catalog} onAdjust={onAdjust} onDone={() => {}}/> : <div className="panel empty-panel"><div className="empty"><strong>Managers only</strong><p>Ask a manager or administrator to record stock adjustments.</p></div></div>)}
    {tab === "Stock Transfer" && <StockTransfersView catalog={catalog} canManage={canManage}/>}
    {tab === "Low Stock" && <HubTable headers={["PRODUCT", "SKU", "STOCK", "STATUS"]} empty="No low-stock products" rows={low.map(p => [p.name, p.sku, `${p.stock} units`, "Low stock"])}/>}
    {tab === "Out of Stock" && <HubTable headers={["PRODUCT", "SKU", "STOCK", "STATUS"]} empty="Nothing is out of stock" rows={out.map(p => [p.name, p.sku, "0 units", "Out of stock"])}/>}
    {tab === "Stock Count" && <div className="panel table-panel"><div className="toolbar"><strong>Expected vs recorded</strong></div>
      {movements === null ? <div className="empty">Loading…</div> : <DataTable headers={["PRODUCT", "SKU", "CURRENT STOCK", "LEDGER NET", "MATCH"]} rows={countRows}/>}
    </div>}
  </>;
}

/** Reports hub: report groups with real computed views where data exists. */
function ReportsHub({ sales, catalog, role }: { sales: Sale[]; catalog: Product[]; role: StaffRole }) {
  const [expenses, setExpenses] = useState<ExpenseLite[]>([]);
  useEffect(() => { let alive = true; fetch("/api/expenses").then(r => r.ok ? r.json() : Promise.reject()).then(d => { if (alive) setExpenses(d as ExpenseLite[]); }).catch(() => {}); return () => { alive = false; }; }, []);
  const { statements: supplierStatements } = useSuppliers();
  const { statements: customerStatements } = useCustomers();
  const groups: { group: string; views: string[] }[] = [
    { group: "Sales", views: ["Sales Overview", "Sales Transactions", "Sales by Product", "Sales by Category", "Sales by Customer", "Sales by Cashier"] },
    { group: "Purchases", views: ["Purchase Summary", "Purchase by Product", "Purchase by Supplier", "Purchase Returns"] },
    { group: "Inventory", views: ["Stock Summary", "Stock Movement", "Low Stock", "Out of Stock", "Stock Valuation", "Stock Adjustments"] },
    { group: "Customers", views: ["Customer Summary", "Customer Sales", "Customer Balance", "Loyalty Points"] },
    { group: "Suppliers", views: ["Supplier Summary", "Supplier Balance", "Supplier Payments"] },
    { group: "Finance", views: ["Profit & Loss", "Payments", "Expenses", "Refunds", "Cash Flow"] },
    { group: "Cash Register", views: ["Register Summary", "Shift Report", "Cash In / Out", "Cash Difference"] },
    { group: "Staff", views: ["Staff Performance", "Cashier Sales", "Activity Log"] },
  ];
  const flat = groups.flatMap(g => g.views);
  const [tab, setTab] = useState("Sales Overview");
  const showMoney = canViewMoney(role);
  const counted = sales.filter(s => s.status !== "Refunded");
  const refunded = sales.filter(s => s.status === "Refunded");
  const revenue = counted.reduce((n, s) => n + saleTotal(s), 0);
  const cost = counted.reduce((n, s) => n + lineCost(s), 0);
  const refundAmt = refunded.reduce((n, s) => n + saleTotal(s), 0);
  const groupBy = (key: "customer" | "servedBy" | "category") => {
    const m = new Map<string, { orders: number; sales: number }>();
    for (const s of counted) for (const l of s.lines) {
      const k = key === "category" ? (catalog.find(p => p.sku === l.sku)?.category ?? "Uncategorized") : key === "customer" ? s.customer : (s.servedBy ?? "Unattributed");
      const row = m.get(k) ?? { orders: 0, sales: 0 };
      row.orders += 1; row.sales += l.price * l.qty;
      m.set(k, row);
    }
    return Array.from(m.entries()).map(([name, v]) => [name, String(v.orders), money(v.sales)] as string[]).sort((a, b) => parseFloat(b[2].replace(/[$,]/g, "")) - parseFloat(a[2].replace(/[$,]/g, "")));
  };
  const inventoryValue = catalog.reduce((n, p) => n + p.price * p.stock, 0);
  const inventoryCost = catalog.reduce((n, p) => n + p.cost * p.stock, 0);
  const view = () => {
    switch (tab) {
      case "Sales Overview": return <HubTable headers={["METRIC", "VALUE"]} empty="No data" rows={[
        ["Orders", String(counted.length)], ["Revenue", money(revenue)], ["Items sold", String(counted.reduce((n, s) => n + itemCount(s), 0))], ["Refunds", `${money(refundAmt)} (${refunded.length})`], ["Net revenue", money(revenue - refundAmt)],
      ]}/>;
      case "Sales Transactions": return <HubTable headers={["INVOICE", "CUSTOMER", "DATE", "AMOUNT", "STATUS"]} empty="No sales yet" rows={[...sales].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, 40).map(s => [s.id, s.customer, s.date, money(saleTotal(s)), s.status])}/>; 
      case "Sales by Product": { const m = new Map<string, number>(); for (const s of counted) for (const l of s.lines) m.set(l.name, (m.get(l.name) ?? 0) + l.price * l.qty); return <HubTable headers={["PRODUCT", "REVENUE"]} empty="No sales yet" rows={Array.from(m.entries()).map(([n, v]) => [n, money(v)]).sort((a, b) => parseFloat(b[1].replace(/[$,]/g, "")) - parseFloat(a[1].replace(/[$,]/g, "")))}/>; }
      case "Sales by Category": return <HubTable headers={["CATEGORY", "ORDERS", "SALES"]} empty="No sales yet" rows={groupBy("category")}/>; 
      case "Sales by Customer": return <HubTable headers={["CUSTOMER", "ORDERS", "SALES"]} empty="No sales yet" rows={groupBy("customer")}/>; 
      case "Sales by Cashier": return <HubTable headers={["CASHIER", "ORDERS", "SALES"]} empty="No sales yet" rows={groupBy("servedBy")}/>; 
      case "Stock Summary": return <HubTable headers={["PRODUCT", "SKU", "STOCK", "STATUS"]} empty="Catalog is empty" rows={catalog.map(p => [p.name, p.sku, `${p.stock} units`, p.stock === 0 ? "Out of stock" : p.stock < LOW_STOCK_LIMIT ? "Low stock" : "Healthy"])}/> 
      case "Stock Valuation": return <HubTable headers={["METRIC", "VALUE"]} empty="Catalog is empty" rows={[["Retail value", money(inventoryValue)], ["Cost value", money(inventoryCost)], ...(showMoney ? [["Potential margin", money(inventoryValue - inventoryCost)] as string[]] : [])]}/>; 
      case "Low Stock": return <HubTable headers={["PRODUCT", "SKU", "STOCK"]} empty="No low stock" rows={catalog.filter(p => p.stock > 0 && p.stock < LOW_STOCK_LIMIT).map(p => [p.name, p.sku, `${p.stock} units`])}/>; 
      case "Out of Stock": return <HubTable headers={["PRODUCT", "SKU", "STOCK"]} empty="Nothing out of stock" rows={catalog.filter(p => p.stock === 0).map(p => [p.name, p.sku, "0 units"])}/>; 
      case "Profit & Loss": { const expenseTotal = expenses.reduce((n, e) => n + e.amount, 0); return <HubTable headers={["LINE", "AMOUNT"]} empty="No data" rows={showMoney ? [["Revenue", money(revenue)], ["Cost of goods sold", money(-cost)], ["Gross profit", money(revenue - cost)], ["Refunds", money(-refundAmt)], ["Operating expenses", money(-expenseTotal)], ["Net", money(revenue - cost - refundAmt - expenseTotal)]] : [["Sign in as a manager", "—"]]} />; } 
      case "Refunds": return <HubTable headers={["INVOICE", "CUSTOMER", "DATE", "AMOUNT", "REASON"]} empty="No refunds yet" rows={refunded.map(s => [s.id, s.customer, s.date, money(saleTotal(s)), s.refundReason || "—"])}/>; 
      case "Expenses": return <HubTable headers={["ID", "DATE", "CATEGORY", "AMOUNT"]} empty="No expenses recorded yet" rows={[...expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40).map(e => [e.id, new Date(e.date).toLocaleDateString(), e.category, money(-e.amount)])}/>;  
      case "Customer Summary": case "Customer Sales": case "Customer Balance": return <HubTable headers={["CUSTOMER", "ORDERS", "SALES"]} empty="No customers yet" rows={groupBy("customer")}/>;
      case "Supplier Summary": return <HubTable headers={["SUPPLIER", "ORDERED", "PAID", "BALANCE"]} empty="No suppliers yet" rows={(supplierStatements ?? []).map(st => [st.name, money(st.ordered), money(st.paid), st.balance > 0 ? money(st.balance) : "Settled"])}/>;
      case "Supplier Balance": return <HubTable headers={["SUPPLIER", "BALANCE", "LAST ACTIVITY"]} empty="No suppliers yet" rows={(supplierStatements ?? []).filter(st => st.balance > 0).map(st => [st.name, money(st.balance), new Date(st.lastActivity).toLocaleDateString()])}/>;
      case "Supplier Payments": return <HubTable headers={["SUPPLIER", "ORDERED", "PAID", "BALANCE", "LAST ACTIVITY"]} empty="No suppliers yet" rows={(supplierStatements ?? []).map(st => [st.name, money(st.ordered), money(st.paid), st.balance > 0 ? money(st.balance) : "Settled", new Date(st.lastActivity).toLocaleDateString()])}/>; 
      case "Loyalty Points": return <HubTable headers={["CUSTOMER", "POINTS", "TIER"]} empty="No customers yet" rows={[...(customerStatements ?? [])].sort((a, b) => b.loyaltyPoints - a.loyaltyPoints).map(c => [c.name, String(c.loyaltyPoints), loyaltyTier(c.loyaltyPoints)])}/>; 
      case "Register Summary": case "Shift Report": { const cash = counted.filter(s => s.payment === "Cash").reduce((n, s) => n + saleTotal(s), 0); return <HubTable headers={["ITEM", "AMOUNT"]} empty="No data" rows={[["Cash sales", money(cash)], ["Card / ABA sales", money(revenue - cash)], ["Refunds", money(refundAmt)], ["Expected drawer cash", money(cash - refundAmt)]]}/>; } 
      case "Staff Performance": case "Cashier Sales": return <HubTable headers={["CASHIER", "ORDERS", "SALES"]} empty="No sales yet" rows={groupBy("servedBy")}/>; 
      default: return <SoonPanel title={tab} what="This report needs a module that isn't built yet (purchases, suppliers, expenses, or the activity log) — no invented numbers are shown."/>; 
    }
  };
  return <>
    <PageHeading title="Reports" sub="Every report across sales, inventory, customers, finance, and staff"/>
    <div className="subnav subnav-wrap">
      {flat.map(t => <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button>)}
    </div>
    {view()}
  </>;
}

/** Categories manager: list with counts, create/edit/delete via the categories API. */
function CategoriesView({ catalog, canManage }: { catalog: Product[]; canManage: boolean }) {
  type Cat = { id: string; name: string; parentId: string | null; description: string; status: "Active" | "Inactive"; sortOrder: number; createdBy: string; createdAt: string; updatedAt: string; productCount?: number };
  const [cats, setCats] = useState<Cat[] | null>(null);
  const [editing, setEditing] = useState<Cat | null>(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => { fetch("/api/categories").then(r => r.ok ? r.json() : Promise.reject()).then(d => setCats(d as Cat[])).catch(() => setCats([])); }, []);
  useEffect(load, [load]);
  const usedNames = new Set(catalog.map(p => p.category));
  return <div className="panel table-panel"><div className="toolbar"><strong>{cats ? `${cats.length} categories` : "Loading…"}</strong>{canManage && <button className="primary-button" onClick={() => setAdding(true)}><Plus size={15}/> Add category</button>}</div>
    {!cats ? <div className="empty">Loading…</div> : cats.length === 0 ? <div className="empty">No categories yet.</div>
      : <div className="table-wrap"><table><thead><tr>{["NAME", "PARENT", "PRODUCTS", "SORT", "STATUS", "CREATED", ""].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
        {cats.map(c => <tr key={c.id}><td><strong>{c.name}</strong>{c.description && <span style={{ display: "block", color: "#9ba5ae", fontSize: 10 }}>{c.description}</span>}</td><td>{cats.find(x => x.id === c.parentId)?.name ?? "—"}</td><td>{c.productCount ?? usedNames.has(c.name) ? (c.productCount ?? catalog.filter(p => p.category === c.name).length) : 0}</td><td>{c.sortOrder}</td><td><span className={`status ${c.status === "Active" ? "paid" : "refunded"}`}>{c.status}</span></td><td>{new Date(c.createdAt).toLocaleDateString()}</td><td><div className="row-actions">{canManage ? <button className="text-button" onClick={() => setEditing(c)}>Edit</button> : <span className="you-chip">view only</span>}</div></td></tr>
      )}</tbody></table></div>}
    {(adding || editing) && <CategoryFormModal initial={editing} onClose={() => { setAdding(false); setEditing(null); }} onSaved={() => { load(); setAdding(false); setEditing(null); }}/>}
  </div>;
}

function CategoryFormModal({ initial, onClose, onSaved }: { initial: { id?: string; name: string; parentId: string | null; description: string; status: "Active" | "Inactive"; sortOrder: number } | null; onClose: () => void; onSaved: () => void }) {
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({ name: initial?.name ?? "", parentId: initial?.parentId ?? "", description: initial?.description ?? "", status: initial?.status ?? "Active", sortOrder: String(initial?.sortOrder ?? 0) });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/categories").then(r => r.json()).then(d => setCats((d as { id: string; name: string }[]).filter(c => c.id !== initial?.id))).catch(() => {}); }, [initial?.id]);
  const submit = async () => {
    if (!form.name.trim()) return setError("Name is required.");
    setBusy(true); setError(null);
    const body = { name: form.name.trim(), parentId: form.parentId || null, description: form.description.trim(), status: form.status, sortOrder: Number(form.sortOrder) || 0 };
    const res = await fetch(initial?.id ? `/api/categories/${encodeURIComponent(initial.id)}` : "/api/categories", { method: initial?.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
    setBusy(false);
    if (!res.ok) { setError((await res.json() as { error?: string }).error ?? "Could not save."); return; }
    onSaved();
  };
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-header"><h2>{initial?.id ? "Edit category" : "Add category"}</h2><button aria-label="Close category form" onClick={onClose}><X size={18}/></button></div>
    <div className="form-grid">
      <label>Name<input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label>
      <label>Parent category<select value={form.parentId} onChange={e => setForm({ ...form, parentId: e.target.value })}><option value="">— Top level —</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as "Active" | "Inactive" })}><option>Active</option><option>Inactive</option></select></label>
      <label>Sort order<input type="number" value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: e.target.value })}/></label>
      <label style={{ gridColumn: "1 / -1" }}>Description<input placeholder="Optional" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}/></label>
    </div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="modal-actions"><button className="outline-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Save category"}</button></div>
  </div></div>;
}

const pageInfo: Record<string, { title: string; subtitle: string; action?: string }> = {
  "POS": { title: "Point of sale", subtitle: "Ring up sales, take payment, and print receipts" },
  "Transactions": { title: "Transactions", subtitle: "Every sale, with receipts and refunds" },
  "Returns & Refunds": { title: "Returns & refunds", subtitle: "Process returns and review refund history" },
  "Products": { title: "Products", subtitle: "Manage your catalog, pricing, and categories" },
  "Categories": { title: "Categories", subtitle: "Group products and track catalog value" },
  "Stock": { title: "Stock", subtitle: "Monitor and adjust stock levels across your store" },
  "Purchases": { title: "Purchases", subtitle: "Track purchase orders and supplier deliveries" },
  "Suppliers": { title: "Suppliers", subtitle: "Manage your supplier network and contacts" },
  "Stock Transfers": { title: "Stock transfers", subtitle: "Move stock between locations" },
  "Customers": { title: "Customers", subtitle: "Build relationships and manage customer accounts" },
  "Payments": { title: "Payments", subtitle: "Money in — payments received and awaiting payment" },
  "Expenses": { title: "Expenses", subtitle: "Money out — record rent, utilities, and supplies" },
  "Cash Register": { title: "Cash register", subtitle: "Income, refunds, and cash flow at a glance" },
  "Reports": { title: "Reports", subtitle: "Understand your store performance" },
  "Staff": { title: "Staff", subtitle: "Manage team members and permissions", action: "Add staff" },
  "Roles & Permissions": { title: "Roles & permissions", subtitle: "Who can do what across the workspace" },
  "Settings": { title: "Settings", subtitle: "Configure your StoreGenz workspace" }
};

export default function Home() {
  const [active, setActive] = useState("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Icon-rail collapse; persisted so the choice survives reloads.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(window.localStorage.getItem("pos.sidebar") === "min"); } catch {} }, []);
  const toggleCollapsed = () => setCollapsed(c => { const v = !c; try { window.localStorage.setItem("pos.sidebar", v ? "min" : "full"); } catch {} return v; });
  const [query, setQuery] = useState("");
  // Start from seed data so the UI renders instantly; real state hydrates from MongoDB below.
  const [sales, setSales] = useState<Sale[]>(seedSales);
  const [catalog, setCatalog] = useState<Product[]>(seedProducts);
  const [staff, setStaff] = useState<StaffMember[]>(seedStaff);
  const { roles, setRoles, reloadRoles } = useRolesData();
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [dbOnline, setDbOnline] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [signedInAt, setSignedInAt] = useState<Date | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [orderSearch, setOrderSearch] = useState("");

  const mountedRef = useRef(true);
  // React 18 StrictMode (dev) runs setup → cleanup → setup: the flag must be re-armed
  // on every setup or hydration responses are discarded for the component's whole life.
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Single source of truth for (re)loading collections from MongoDB. The generation
  // counter makes the latest refresh win, so a slow initial hydration can never
  // clobber newer state after a successful mutation.
  const refreshGen = useRef(0);
  const refreshAll = async () => {
    const gen = ++refreshGen.current;
    try {
      // all=1: full arrays — the dashboard/reports aggregates filter the complete
      // history client-side; the big Transactions table pages server-side instead.
      const [pRes, sRes, sfRes, seRes, rRes] = await Promise.all([fetch("/api/products?all=1"), fetch("/api/sales?all=1"), fetch("/api/staff"), fetch("/api/settings", { credentials: "same-origin" }), fetch("/api/roles")]);
      if (!pRes.ok || !sRes.ok) throw new Error("API unavailable");
      const [p, s, sf, se, rl] = await Promise.all([pRes.json(), sRes.json(), sfRes.ok ? sfRes.json() : null, seRes.ok ? seRes.json() : null, rRes.ok ? rRes.json() : null]);
      if (!mountedRef.current || gen !== refreshGen.current) return;
      setCatalog(p as Product[]);
      setSales(s as Sale[]);
      if (sf) setStaff(sf as StaffMember[]);
      if (se) setSettings((prev: StoreSettings) => ({ ...prev, ...(se as StoreSettings) }));
      if (rl) setRoles(rl as RoleDef[]);
      LOW_STOCK_LIMIT = (se as StoreSettings | null)?.lowStockThreshold ?? 10;
      TAX_LABEL = (se as StoreSettings | null)?.taxLabel ?? "VAT";
      LOYALTY_TIERS = (se as StoreSettings | null)?.loyaltyTiers ?? null;
      setDbOnline(true);
    } catch {
      if (mountedRef.current && gen === refreshGen.current) setDbOnline(false);
    }
  };

  useEffect(() => { refreshAll(); }, []);

  // Restore a cookie session on load so a refresh doesn't sign the user out.
  useEffect(() => {
    fetch("/api/auth/session", { credentials: "same-origin" })
      .then(res => (res.ok ? res.json() : null))
      // Cookie-restored session: whoami returns the server-side sign-in time.
      .then((data: (Session & { signedInAt?: string }) | null) => {
        if (!mountedRef.current || !data) return;
        setSession({ name: data.name, role: data.role });
        if (data.signedInAt) setSignedInAt(new Date(data.signedInAt));
      })
      .catch(() => {});
  }, []);

  const navigate = useCallback((label: string) => { setActive(label); setSidebarOpen(false); setQuery(""); }, []);
  // Shortcuts: Ctrl/Cmd+K focuses global search, Ctrl/Cmd+N opens the register.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") { e.preventDefault(); navigate("POS"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);
  const info = pageInfo[active];
  // A global search starting with #INV hands the term to Transactions; anything else
  // lands on Products with the filter prefilled (the shared query prop drives it).
  const me = staff.find(m => m.name === session?.name);

  // Mutating requests authenticate via the HttpOnly session cookie; the API enforces
  // the role rules server-side.
  const authFetch = (path: string, init: RequestInit = {}) => fetch(path, { ...init, credentials: "same-origin" });

  const updateSettings = (s: StoreSettings, done?: (ok: boolean) => void) => {
    const prev = settings;
    applyOrRollback(
      () => setSettings(s),
      () => authFetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) }),
      () => setSettings(prev),
      "Settings not saved",
      () => done?.(true),
      () => done?.(false)
    );
  };

  // --- Mutations: optimistic local update, then persistence; rollback + notice on failure ---
  const applyOrRollback = async (local: () => void, request: () => Promise<Response>, rollback: () => void, failMsg: string, onOk?: () => void, onFail?: () => void) => {
    local();
    try {
      const res = await request();
      if (!res.ok) {
        rollback();
        setNotice(`${failMsg} — ${((await res.json().catch(() => ({}))) as { error?: string }).error ?? "request failed"}`);
        onFail?.();
      } else {
        // Reconcile with the database so server-side state (ids, aggregates) wins.
        onOk?.();
      }
    } catch {
      rollback();
      setNotice(`${failMsg} — database unreachable, change was rolled back.`);
      onFail?.();
    }
  };

  const recordSale = (lines: SaleLine[], payment: SalePayment, done?: (ok: boolean, sale?: Sale) => void) => {
    const prev = sales;
    const gross = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
    const discount = Math.min(payment.discount ?? 0, gross);
    const net = Math.round((gross - discount) * 100) / 100;
    const local: Sale = { id: `#INV-${parseInt(prev[0].id.slice(5), 10) + 1}`, customer: payment.customer, date: "Just now", payment: payment.payment, status: "Paid", discount, lines, saleTotal: net, ...(payment.amountPaid !== undefined ? { amountPaid: payment.amountPaid, changeDue: Math.max(0, Math.round((payment.amountPaid - net) * 100) / 100) } : {}) };
    let created: Sale | undefined;
    applyOrRollback(
      () => setSales([local, ...prev]),
      async () => {
        const res = await authFetch("/api/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines, customer: payment.customer, payment: payment.payment, ...(discount > 0 ? { discount } : {}), ...(payment.amountPaid !== undefined ? { amountPaid: payment.amountPaid } : {}) }) });
        if (res.ok) created = await res.json() as Sale;
        return res;
      },
      () => setSales(prev),
      "Sale not recorded",
      () => { refreshAll(); done?.(true, created); },
      () => done?.(false)
    );
  };

  const refundSale = (id: string, reason: string, done?: (ok: boolean) => void) => {
    const prev = sales;
    applyOrRollback(
      () => setSales(prev.map(s => s.id === id ? { ...s, status: "Refunded" as const, refundReason: reason.trim() || "No reason provided" } : s)),
      () => authFetch(`/api/sales/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) }),
      () => setSales(prev),
      "Refund not recorded",
      () => { refreshAll(); done?.(true); },
      () => done?.(false)
    );
  };

  const upsertProduct = (p: Product, done?: (ok: boolean) => void) => {
    const prev = catalog;
    const isNew = !prev.some(x => x.sku === p.sku);
    applyOrRollback(
      () => setCatalog(isNew ? [p, ...prev] : prev.map(x => x.sku === p.sku ? p : x)),
      () => isNew
        ? authFetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) })
        : authFetch(`/api/products/${encodeURIComponent(p.sku)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: p.name, category: p.category, price: p.price, cost: p.cost, stock: p.stock }) }),
      () => setCatalog(prev),
      isNew ? "Product not added" : "Product not updated",
      () => { refreshAll(); done?.(true); },
      () => done?.(false)
    );
  };

  const deleteProduct = (sku: string, done?: (ok: boolean) => void) => {
    const prev = catalog;
    applyOrRollback(
      () => setCatalog(prev.filter(p => p.sku !== sku)),
      () => authFetch(`/api/products/${encodeURIComponent(sku)}`, { method: "DELETE" }),
      () => setCatalog(prev),
      "Product not deleted",
      () => { refreshAll(); done?.(true); },
      () => done?.(false)
    );
  };

  const adjustStock = (sku: string, delta: number) => {
    const prev = catalog;
    applyOrRollback(
      () => setCatalog(prev.map(p => p.sku === sku ? { ...p, stock: Math.max(0, p.stock + delta) } : p)),
      () => authFetch(`/api/products/${encodeURIComponent(sku)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stockDelta: delta }) }),
      () => setCatalog(prev),
      "Stock not adjusted",
      refreshAll
    );
  };

  const addStaff = (m: StaffMember, pin: string, done?: (ok: boolean) => void) => {
    const prev = staff;
    applyOrRollback(
      () => setStaff([...prev, m]),
      () => authFetch("/api/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...m, pin }) }),
      () => setStaff(prev),
      "Staff member not added",
      () => { refreshAll(); done?.(true); },
      () => done?.(false)
    );
  };

  const updateStaff = (name: string, patch: Partial<StaffMember> & { pin?: string }, done?: (ok: boolean) => void) => {
    const prev = staff;
    applyOrRollback(
      () => setStaff(prev.map(s => s.name === name ? { ...s, ...patch } as StaffMember : s)),
      () => authFetch(`/api/staff/${encodeURIComponent(name)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }),
      () => setStaff(prev),
      "Staff member not updated",
      () => { refreshAll(); done?.(true); },
      () => done?.(false)
    );
  };

  const deleteStaff = (name: string, done?: (ok: boolean) => void) => {
    const prev = staff;
    applyOrRollback(
      () => setStaff(prev.filter(s => s.name !== name)),
      () => authFetch(`/api/staff/${encodeURIComponent(name)}`, { method: "DELETE" }),
      () => setStaff(prev),
      "Staff member not deleted",
      () => { refreshAll(); done?.(true); },
      () => done?.(false)
    );
  };

  // Not signed in yet → the login gate is the whole app.
  if (!session) {    return <LoginScreen onLogin={(name, role) => { setSignedInAt(new Date()); setSession({ name, role }); }} settings={settings}/>; 
  }

  return <main className="app-shell">
    {sidebarOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""} ${collapsed ? "collapsed" : ""}`}>
      <div className="brand"><div className="brand-mark">{settings.name.charAt(0).toUpperCase()}</div><div><strong>{settings.name}</strong><span>POS SYSTEM</span></div><button className="mobile-close" onClick={() => setSidebarOpen(false)}><X size={19}/></button><button className="collapse-toggle" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand" : "Collapse"} onClick={toggleCollapsed}>{collapsed ? <ChevronRight size={15}/> : <ChevronLeft size={15}/>}</button></div>
      <div className="store-wrap">
        <button className="store-switcher" aria-label="Switch store" title={collapsed ? `${settings.name} — ${settings.location}` : undefined} onClick={() => setStoreOpen(o => !o)}><div className="store-icon"><Store size={17}/></div><div><span>🏪 {settings.name}</span><small>{settings.location} store</small></div><ChevronDown size={15}/></button>
        {storeOpen && <><button className="menu-backdrop" aria-label="Close store menu" onClick={() => setStoreOpen(false)}/><div className={`store-menu ${collapsed ? "as-popout" : ""}`}>
          <p className="store-menu-label">Switch store</p>
          <button className="on" disabled><Store size={14}/> {settings.name} — {settings.location} <span>✓ current</span></button>
          <p className="store-menu-note">Other locations appear here once added.</p>
          {can("settings.manage", session.role, roles) && <button onClick={() => { setStoreOpen(false); navigate("Settings"); }}><Plus size={14}/> Add store</button>}
        </div></>}
      </div>
      <nav className="nav-list">{navGroups.map(group => <div key={group.title}><p className="nav-label">{group.title}</p>{group.items.map(([label, Icon]) => <button key={label} onClick={() => navigate(label)} className={`nav-item ${active === label ? "nav-active" : ""}`}><Icon size={18}/><span>{label}</span></button>)}</div>)}</nav>
      <div className="sidebar-footer"><div className="help-card"><div className="help-icon">?</div><div><strong>Need help?</strong><span>View documentation</span></div></div><div className="profile-wrap"><div className="profile" role="button" tabIndex={0} aria-label={`View profile for ${session.name}`} title={collapsed ? `${session.name} — ${session.role}` : undefined} onClick={() => setProfileOpen(o => !o)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setProfileOpen(o => !o); } }}><div className="avatar">{session.name.slice(0, 2).toUpperCase()}</div><div><strong>{session.name}</strong><span>{session.role}</span></div><ChevronUp size={14} className={`profile-chevron ${profileOpen ? "open" : ""}`}/></div>{profileOpen && <><button className="menu-backdrop" aria-label="Close profile" onClick={() => setProfileOpen(false)}/><div className={`profile-popover ${collapsed ? "as-popout" : ""}`} role="dialog" aria-label="Signed-in profile"><div className="profile-popover-head"><div className="avatar">{session.name.slice(0, 2).toUpperCase()}</div><div><strong>{session.name}</strong><span>{session.role}</span></div></div><dl className="profile-facts"><div><dt>Permissions</dt><dd>{me?.permissions ?? "—"}</dd></div><div><dt>Status</dt><dd>{me?.status ?? "Active"}</dd></div><div><dt>Signed in</dt><dd>{signedInAt ? signedInAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—"}</dd></div></dl></div></>}</div><button className="logout-button" aria-label="Sign out" title={`Sign out ${session.name}`} onClick={() => { setSession(null); setProfileOpen(false); fetch("/api/auth/session", { method: "DELETE", credentials: "same-origin" }).catch(() => {}); navigate("Dashboard"); }}><LogOut size={15}/></button></div>
    </aside>
    <section className="content">
      <header className="topbar"><button className="mobile-menu" onClick={() => setSidebarOpen(true)}><Menu size={22}/></button><div className="breadcrumb"><span>Workspace</span><b>/</b><strong>{active}</strong></div><div className="topbar-actions"><div className="search"><Search size={17}/><input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && query.trim()) { e.preventDefault(); const t = query.trim(); if (/^#?inv/i.test(t)) { setOrderSearch(t.replace(/^#/, "")); navigate("Transactions"); } else { navigate("Products"); setQuery(t); } } }} placeholder="Search products, orders..."/><kbd className="search-kbd">Ctrl K</kbd></div><button className="icon-button notification"><Bell size={19}/><i/></button><button className="language">EN <ChevronDown size={14}/></button></div></header>
      <div className={`page-content ${active === "Dashboard" ? "dash" : ""}`}>{dbOnline === false && <p className="offline-banner" role="alert">⚠ Database offline — showing seeded data; changes cannot be saved.</p>}{notice && <p className="offline-banner error-banner" role="alert">{notice}<button className="banner-close" aria-label="Dismiss error" onClick={() => setNotice(null)}><X size={14}/></button></p>}{active === "Dashboard" ? <Dashboard navigate={navigate} sales={sales} catalog={catalog} role={session.role} userName={session.name}/> : active === "POS" || active === "Returns & Refunds" ? <Sales key={active} catalog={catalog} sales={sales} initialTab={active === "POS" ? "pos" : "returns"} initialHistoryQuery={orderSearch} onRecord={recordSale} onRefund={refundSale} storeName={settings.name} storeLocation={settings.location} receiptFooter={settings.receiptFooter} currency={settings.currency} role={session.role} methods={(settings.paymentMethods ?? []).filter(m => m.enabled).map(m => m.name)} settings={settings}/> : active === "Transactions" ? <TransactionsHub sales={sales} onRefund={refundSale} storeName={settings.name} storeLocation={settings.location} receiptFooter={settings.receiptFooter} currency={settings.currency} role={session.role} orderSearch={orderSearch} canManage={CAN.manageProducts(session.role, roles)} catalog={catalog}/> : active === "Products" || active === "Categories" ? <ProductsHub key={active} catalog={catalog} sales={sales} query={query} onQuery={setQuery} initialTab={active === "Categories" ? "Categories" : "All Products"} onUpsert={(p,done)=>upsertProduct(p,done)} onDelete={(sku,done)=>deleteProduct(sku,done)} onAdjust={adjustStock} canManage={CAN.manageProducts(session.role, roles)}/> : active === "Stock" || active === "Stock Transfers" ? <StockHub key={active} catalog={catalog} canManage={CAN.manageProducts(session.role, roles)} onAdjust={adjustStock} initialTab={active === "Stock Transfers" ? "Stock Transfer" : undefined}/> : active === "Purchases" ? <PurchasesHub catalog={catalog} canManage={CAN.manageProducts(session.role, roles)}/> : active === "Suppliers" ? <SuppliersHub role={session.role}/> : active === "Customers" ? <CustomersHub role={session.role}/> : active === "Payments" ? <PaymentsHub sales={sales} role={session.role}/> : active === "Expenses" ? <ExpensesHub role={session.role}/> : active === "Cash Register" ? <RegisterHub sales={sales} role={session.role}/> : active === "Reports" ? <ReportsHub sales={sales} catalog={catalog} role={session.role}/> : active === "Settings" ? <SettingsHub key={active} settings={settings} sales={sales} role={session.role} roles={roles} canManage={can("settings.manage", session.role, roles)} onSave={updateSettings} onChanged={() => { void refreshAll(); }} navigate={navigate}/> : active === "Staff" || active === "Roles & Permissions" || active === "Departments" ? <StaffHub key={active} staff={staff} sales={sales} role={session.role} currentUser={session.name} query={query} onQuery={setQuery} roles={roles} reloadRoles={reloadRoles} onAdd={(m,pin,done)=>addStaff(m,pin,done)} onUpdate={(n,p,done)=>updateStaff(n,p,done)} onDelete={(n,done)=>deleteStaff(n,done)} initialTab={active === "Roles & Permissions" ? "Roles & Permissions" : active === "Departments" ? "Departments" : undefined}/> : <GenericPage active={active} info={info} query={query} catalog={catalog}/>}</div>
    </section>
  </main>;
}

/** Money visibility (profit, discounts) follows the finance capability. */
const canViewMoney = (r: StaffRole | undefined, roles?: RoleDef[]) => can("finance.manage", r, roles);

/** Escapes a CSV cell: quotes doubled, formula-leading characters neutralized. */
const csvCell = (v: string) => (/^[=+\-@]/.test(v) ? `'` : "") + `"${v.replace(/"/g, '""')}"`;

const download = (filename: string, mime: string, data: string) => {
  const url = URL.createObjectURL(new Blob(["\ufeff" + data], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
};

const exportCSV = (rows: Record<string, string>[], filename: string) => {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  download(filename, "text/csv;charset=utf-8", [headers.join(","), ...rows.map(r => headers.map(h => csvCell(r[h] ?? "")).join(","))].join("\r\n"));
};

const exportExcel = (rows: Record<string, string>[], sheetTitle: string) => {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="${esc(sheetTitle).slice(0, 31)}"><Table>
<Row>${headers.map(h => `<Cell><Data ss:Type="String">${esc(h)}</Data></Cell>`).join("")}</Row>
${rows.map(r => `<Row>${headers.map(h => `<Cell><Data ss:Type="String">${esc(r[h] ?? "")}</Data></Cell>`).join("")}</Row>`).join("\n")}
</Table></Worksheet></Workbook>`;
  download(`${sheetTitle.toLowerCase().replace(/\s+/g, "-")}.xls`, "application/vnd.ms-excel", xml);
};

function Dashboard({ navigate, sales, catalog, role, userName }: { navigate: (s: string) => void; sales: Sale[]; catalog: Product[]; role: StaffRole; userName: string }) {
  // ---- Filters -------------------------------------------------------------
  const [range, setRange] = useState<ReportRange>("today");
  const [rangeOpen, setRangeOpen] = useState(false);
  const [cashier, setCashier] = useState("All cashiers");
  const [cashierOpen, setCashierOpen] = useState(false);
  const [category, setCategory] = useState("All categories");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [payment, setPayment] = useState("All payments");
  const [paymentOpen, setPaymentOpen] = useState(false);
  // Custom date range (inclusive on both ends). `customTo` defaults to today.
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  // Trend-chart metric: revenue always, orders, and gross profit (managers+ only).
  const [metric, setMetric] = useState<"revenue" | "orders" | "profit">("revenue");
  const trendValue = (d: { revenue: number; orders: number; profit: number }) => metric === "revenue" ? d.revenue : metric === "orders" ? d.orders : d.profit;
  const metricLabel = metric === "revenue" ? "Revenue" : metric === "orders" ? "Orders" : "Gross profit";

  const DAY = 86_400_000;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  // Inclusive [start, end) window. "month" = the current calendar month.
  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1).getTime();
  const customFromTs = customFrom ? new Date(customFrom + "T00:00:00").getTime() : NaN;
  const customToTs = customTo ? new Date(customTo + "T00:00:00").getTime() : todayStart.getTime();
  const customValid = Number.isFinite(customFromTs) && Number.isFinite(customToTs) && customFromTs <= customToTs;
  const dayCount = range === "today" ? 1 : range === "month" ? Math.max(1, Math.round((todayStart.getTime() - monthStart) / DAY) + 1) : range === "custom" ? (customValid ? Math.round((customToTs - customFromTs) / DAY) + 1 : 1) : range === "all" ? Infinity : range as number;
  const monthly = range === "all" || (range === "custom" && customValid && dayCount > 45);
  const rangeStart = range === "all" ? 0 : range === "month" ? monthStart : range === "custom" ? (customValid ? customFromTs : 0) : todayStart.getTime() - (range === "today" ? 0 : (range as 7 | 30) - 1) * DAY;
  const rangeEnd = range === "custom" && customValid ? customToTs + DAY : Infinity;
  const rangeLabel = range === "today" ? "Today" : range === "all" ? "All time" : range === "month" ? "This month" : range === "custom" ? (customValid ? `${customFrom} → ${customTo || "today"}` : "Custom range") : `Last ${range} days`;
  const categories = Array.from(new Set(catalog.map(p => p.category))).sort();
  const payments = Array.from(new Set(sales.map(s => s.payment))).sort();
  const cashiers = Array.from(new Set(sales.map(s => s.servedBy).filter((x): x is string => !!x))).sort();

  // Category filtering is applied per line — a mixed-category sale contributes its
  // matching lines to KPIs, charts, and tables alike.
  const inRange = (s: Sale) => range === "all" || (s.createdAt ? new Date(s.createdAt).getTime() >= rangeStart && new Date(s.createdAt).getTime() < rangeEnd : false);
  const passes = (s: Sale) => {
    if (!inRange(s)) return false;
    if (cashier !== "All cashiers" && s.servedBy !== cashier) return false;
    if (payment !== "All payments" && s.payment !== payment) return false;
    if (category === "All categories") return true;
    return s.lines.some(l => catalog.find(p => p.sku === l.sku)?.category === category);
  };
  const visible = sales.filter(s => passes(s));
  const keptLines = (s: Sale) => category === "All categories" ? s.lines : s.lines.filter(l => catalog.find(p => p.sku === l.sku)?.category === category);

  // ---- Aggregates (refunds never count as revenue; Pending is not yet income) ----
  const counted = visible.filter(s => s.status !== "Refunded");
  const refunds = visible.filter(s => s.status === "Refunded");
  const gross = counted.reduce((sum, s) => sum + saleTotal(s), 0);
  const refundedAmount = refunds.reduce((sum, s) => sum + saleTotal(s), 0);
  const net = gross - refundedAmount;
  const units = counted.reduce((n, s) => n + itemCount(s), 0);

  // ---- Payment-method mix (share of net sales incl. pending; falls back to legacy docs) ----
  const byMethod = new Map<string, number>();
  for (const s of visible) {
    const amount = s.status === "Refunded" ? 0 : saleTotal(s);
    if (amount <= 0) continue;
    byMethod.set(s.payment, (byMethod.get(s.payment) ?? 0) + amount);
  }
  const methodTotal = Array.from(byMethod.values()).reduce((a, b) => a + b, 0);
  const methodRows = Array.from(byMethod.entries())
    .map(([m, v]) => ({ method: m, value: v, pct: methodTotal > 0 ? Math.round((v / methodTotal) * 1000) / 10 : 0 }))
    .sort((a, b) => b.value - a.value);

  // ---- Sales trend: daily buckets, monthly for all time / long custom spans ----
  const dated = counted.filter(s => s.createdAt);
  const undated = counted.length - dated.length;
  const bucketKey = (t: number) => { const d = new Date(t); return monthly ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : d.toDateString(); };
  const buckets = new Map<string, { label: string; revenue: number; orders: number; profit: number; sort: number }>();
  for (const s of dated) {
    const t = new Date(s.createdAt as string).getTime();
    const key = bucketKey(t);
    const row = buckets.get(key) ?? { label: "", revenue: 0, orders: 0, profit: 0, sort: t };
    row.revenue += saleTotal(s); row.orders += 1;
    buckets.set(key, row);
  }
  // Honest zero bars: fill every day of day-based ranges, every month of monthly views.
  if (range === 7 || range === 30) {
    for (let i = 0; i < range; i++) {
      const d = new Date(todayStart.getTime() - ((range as 7 | 30) - 1 - i) * DAY);
      const key = d.toDateString();
      if (!buckets.has(key)) buckets.set(key, { label: "", revenue: 0, orders: 0, profit: 0, sort: d.getTime() });
    }
  } else if (range === "month") {
    const dim = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 0).getDate();
    for (let i = 1; i <= dim; i++) {
      const d = new Date(todayStart.getFullYear(), todayStart.getMonth(), i);
      if (!buckets.has(d.toDateString())) buckets.set(d.toDateString(), { label: "", revenue: 0, orders: 0, profit: 0, sort: d.getTime() });
    }
  } else if (range === "custom" && customValid && !monthly && dayCount <= 62) {
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(customFromTs + i * DAY);
      if (!buckets.has(d.toDateString())) buckets.set(d.toDateString(), { label: "", revenue: 0, orders:0, profit: 0, sort: d.getTime() });
    }
  }
  if (range === 7 || range === 30) {
    for (let i = 0; i < range; i++) {
      const d = new Date(todayStart.getTime() - ((range as 7 | 30) - 1 - i) * DAY);
      const key = d.toDateString();
      if (!buckets.has(key)) buckets.set(key, { label: "", revenue: 0, orders: 0, profit: 0, sort: d.getTime() });
    }
  }
  const trend = Array.from(buckets.values()).sort((a, b) => a.sort - b.sort);
  // Per-bucket gross profit: each sale's profit lands in its timestamp's bucket.
  const profitByBucket = new Map<string, number>();
  for (const s of dated) {
    const key = bucketKey(new Date(s.createdAt as string).getTime());
    const saleCost = lineCost(s) * (category === "All categories" ? 1 : keptLines(s).length / Math.max(s.lines.length, 1));
    profitByBucket.set(key, (profitByBucket.get(key) ?? 0) + (saleTotal(s) - saleCost));
  }
  for (const b of trend) {
    b.profit = Math.round((profitByBucket.get(bucketKey(b.sort)) ?? 0) * 100) / 100;
  }
  for (const b of trend) {
    const d = new Date(b.sort);
    b.label = monthly
      ? d.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
      : range === 30 || range === "month" || (range === "custom" && !monthly) ? String(d.getDate()) : range === 7 ? d.toLocaleDateString("en-US", { weekday: "short" }) : d.toLocaleTimeString("en-US", { hour: "numeric" });
  }
  const labelEvery = trend.length > 16 ? 5 : 1;
  // Chart scale follows the selected metric (revenue/orders/profit).
  const maxRevenue = Math.max(...trend.map(d => trendValue(d)), 1);

  // ---- Top products & staff performance ----
  const byProduct = new Map<string, { name: string; qty: number; revenue: number; cost: number }>();
  for (const s of counted) for (const l of keptLines(s)) {
    const row = byProduct.get(l.sku) ?? { name: l.name, qty: 0, revenue: 0, cost: 0 };
    row.qty += l.qty; row.revenue += l.price * l.qty; row.cost += l.cost * l.qty;
    byProduct.set(l.sku, row);
  }
  const topProducts = Array.from(byProduct.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 4).map(r => ({ ...r, profit: Math.round((r.revenue - r.cost) * 100) / 100 }));
  const byStaff = new Map<string, { orders: number; sales: number; discounts: number; refunds: number; profit: number }>();
  for (const s of visible) {
    const who = s.servedBy ?? "Unattributed";
    const row = byStaff.get(who) ?? { orders: 0, sales: 0, discounts: 0, refunds: 0, profit: 0 };
    if (s.status === "Refunded") {
      row.refunds += saleTotal(s);
    } else {
      row.orders += 1;
      row.sales += saleTotal(s);
      row.discounts += s.discount ?? 0;
      const cost = lineCost(s) * (category === "All categories" ? 1 : keptLines(s).length / Math.max(s.lines.length, 1));
      row.profit += saleTotal(s) - cost;
    }
    byStaff.set(who, row);
  }
  const staffRows = Array.from(byStaff.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.sales - a.sales).slice(0, 5);

  // ---- Export data (current filter state) ----
  const exportRows = visible.map(s => ({
    Invoice: s.id, Date: s.date, Customer: s.customer, Cashier: s.servedBy ?? "",
    Payment: s.payment, Status: s.status, Discount: (s.discount ?? 0).toFixed(2),
    Items: String(itemCount(s)), Total: saleTotal(s).toFixed(2)
  }));
  const hasCostData = catalog.some(p => p.cost > 0);

  const cost = counted.reduce((sum, s) => sum + lineCost(s) * (category === "All categories" ? 1 : keptLines(s).length / Math.max(s.lines.length, 1)), 0);
  const grossProfit = gross - cost;
  const margin = gross > 0 ? Math.round((grossProfit / gross) * 1000) / 10 : 0;
  const showProfit = canViewMoney(role);

  return <>
    <div className="page-heading">
      <div>
        <p className="eyebrow">TODAY · {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}</p>
        <h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {userName} <span>👋</span></h1>
        <p className="subtitle">Here&apos;s today&apos;s store performance.</p>
      </div>
      <button className="primary-button" onClick={() => navigate("POS")} title="Ctrl+N"><Plus size={18}/> New sale</button>
    </div>

    <div className="dash-toolbar">
      <div className="select-wrap"><button className="select-button" onClick={()=>setRangeOpen(o=>!o)}>{rangeLabel} <ChevronDown size={14}/></button>{rangeOpen && <><button className="menu-backdrop" aria-label="Close range menu" onClick={()=>setRangeOpen(false)}/><div className="select-menu">{(["today",7,30,"month","custom","all"] as ReportRange[]).map(r=><button key={String(r)} className={range===r?"on":""} onClick={()=>{setRange(r); if(r!=="custom") setRangeOpen(false);}}>{r === "today" ? "Today" : r === "all" ? "All time" : r === "month" ? "This month" : r === "custom" ? "Custom date…" : `Last ${r} days`}</button>)}{range==="custom" && <div className="custom-dates" onClick={e=>e.stopPropagation()}><label>From<input type="date" value={customFrom} max={customTo || undefined} onChange={e=>setCustomFrom(e.target.value)}/></label><label>To<input type="date" value={customTo} min={customFrom || undefined} onChange={e=>setCustomTo(e.target.value)}/></label><button className="outline-button" onClick={()=>setRangeOpen(false)}>Apply</button></div>}</div></>}</div>
      <div className="select-wrap"><button className="select-button" onClick={()=>setCashierOpen(o=>!o)}>{cashier} <ChevronDown size={14}/></button>{cashierOpen && <><button className="menu-backdrop" aria-label="Close cashier menu" onClick={()=>setCashierOpen(false)}/><div className="select-menu">{["All cashiers",...cashiers].map(c=><button key={c} className={cashier===c?"on":""} onClick={()=>{setCashier(c);setCashierOpen(false);}}>{c}</button>)}</div></>}</div>
      <div className="select-wrap"><button className="select-button" onClick={()=>setCategoryOpen(o=>!o)}>{category} <ChevronDown size={14}/></button>{categoryOpen && <><button className="menu-backdrop" aria-label="Close category menu" onClick={()=>setCategoryOpen(false)}/><div className="select-menu">{["All categories",...categories].map(c=><button key={c} className={category===c?"on":""} onClick={()=>{setCategory(c);setCategoryOpen(false);}}>{c}</button>)}</div></>}</div>
      <div className="select-wrap"><button className="select-button" onClick={()=>setPaymentOpen(o=>!o)}>{payment} <ChevronDown size={14}/></button>{paymentOpen && <><button className="menu-backdrop" aria-label="Close payment menu" onClick={()=>setPaymentOpen(false)}/><div className="select-menu">{["All payments",...payments].map(m=><button key={m} className={payment===m?"on":""} onClick={()=>{setPayment(m);setPaymentOpen(false);}}>{m}</button>)}</div></>}</div>
      <div className="dash-export">
        <button className="outline-button" onClick={()=>exportCSV(exportRows, `sales-${rangeLabel.toLowerCase().replace(/\s+/g,"-")}.csv`)}><Download size={14}/> CSV</button>
        <button className="outline-button" onClick={()=>exportExcel(exportRows, "Sales overview")}><Download size={14}/> Excel</button>
        <button className="outline-button print-hide" onClick={()=>window.print()}><Printer size={14}/> PDF</button>
      </div>
    </div>

    <section className="stats-grid five">
      <Stat label="Sales" value={money(gross)} change={`avg ${money(counted.length ? Math.round(gross / counted.length * 100) / 100 : 0)}`} caption={rangeLabel.toLowerCase()} icon={CircleDollarSign} tone="green"/>
      <Stat label="Orders" value={String(counted.length)} change={`${units} items sold`} caption={rangeLabel.toLowerCase()} icon={ShoppingCart} tone="blue"/>
      <Stat label="Refunds" value={money(refundedAmount)} change={`${refunds.length} refund${refunds.length===1?"":"s"}`} caption={rangeLabel.toLowerCase()} icon={ArrowDownRight} tone="orange" negative={refunds.length>0}/>
      <Stat label="Net sales" value={money(net)} change="gross minus refunds" caption={rangeLabel.toLowerCase()} icon={ArrowUpRight} tone="green" negative={net<0}/>
      {showProfit && <Stat label="Gross profit" value={money(Math.round(grossProfit * 100) / 100)} change={hasCostData ? `${margin}% margin` : "no costs set"} caption={rangeLabel.toLowerCase()} icon={Wallet} tone="purple" negative={grossProfit<0}/>}
    </section>

    <section className="dashboard-grid">
      <div className="panel">
        <PanelHeader title="Sales trend" sub={`${metricLabel} per ${monthly ? "month" : "day"} — ${rangeLabel}, refunds excluded`}/>
        <div className="metric-tabs" role="tablist" aria-label="Chart metric">
          <button role="tab" aria-selected={metric==="revenue"} className={metric==="revenue"?"on":""} onClick={()=>setMetric("revenue")}>Revenue</button>
          <button role="tab" aria-selected={metric==="orders"} className={metric==="orders"?"on":""} onClick={()=>setMetric("orders")}>Orders</button>
          {showProfit && <button role="tab" aria-selected={metric==="profit"} className={metric==="profit"?"on":""} onClick={()=>setMetric("profit")}>Profit</button>}
        </div>
        <div className="chart"><div className="y-axis"><span>{metric === "orders" ? String(maxRevenue) : money(maxRevenue)}</span><span>{metric === "orders" ? String(Math.round(maxRevenue*0.75)) : money(maxRevenue*0.75)}</span><span>{metric === "orders" ? String(Math.round(maxRevenue*0.5)) : money(maxRevenue*0.5)}</span><span>{metric === "orders" ? String(Math.round(maxRevenue*0.25)) : money(maxRevenue*0.25)}</span><span>{metric === "orders" ? "0" : money(0)}</span></div>
          <div className="chart-area"><div className="grid-lines">{[1,2,3,4].map(x=><i key={x}/>)}
            <div className="bars">{trend.map((d,i)=><div className="bar-group" key={i}><div className={`bar ${metric==="orders"?"orders-bar":"revenue-bar"}`} style={{height:`${(trendValue(d)/maxRevenue)*100}%`}}/><span>{i % labelEvery === 0 ? d.label : ""}</span></div>)}</div>
          </div></div></div>
        {undated > 0 && <p className="form-intro">{undated} sale{undated===1?"":"s"} without timestamps can&apos;t be placed on the trend chart.</p>}
      </div>
      <div className="panel">
        <PanelHeader title="Payment methods" sub={`Share of ${rangeLabel.toLowerCase()} sales`}/>
        {methodRows.length===0 ? <div className="empty">No sales in this range.</div> : <div className="method-list">{methodRows.map(m=>
          <div className="method-row" key={m.method}><span>{m.method}</span><div className="method-bar"><i style={{width:`${m.pct}%`}}/></div><strong>{money(m.value)}</strong><em>{m.pct}%</em></div>)}</div>}
      </div>
    </section>

    <section className="dashboard-grid">
      <div className="panel table-panel">
        <PanelHeader title="Recent transactions" sub="Latest sales activity across the store" action="View all" onAction={()=>navigate("Transactions")}/>
        {sales.length===0 ? <div className="empty">No sales yet.</div> : <DataTable headers={["INVOICE","CUSTOMER","CASHIER","AMOUNT","PAYMENT","TIME","STATUS"]} rows={sales.slice(0,4).map(s=>[s.id,s.customer,s.servedBy??"—",money(saleTotal(s)),s.payment,s.date,s.status])}/>}
      </div>
      <div className="panel">
        <PanelHeader title="Low stock" sub="Products that need attention" action="View inventory" onAction={()=>navigate("Stock")}/>
        {catalog.filter(p=>p.stock<LOW_STOCK_LIMIT).length===0 ? <div className="empty">All products are well stocked.</div> : <div className="stock-list">{catalog.filter(p=>p.stock<LOW_STOCK_LIMIT).sort((a,b)=>a.stock-b.stock).slice(0,4).map(p=>
          <div className="stock-item" key={p.sku}><div className="product-placeholder"><Package size={18}/></div><div className="stock-name"><strong>{p.name}</strong><span>{p.sku}</span></div><div className="stock-count"><strong className={p.stock===0?"critical":""}>{p.stock} units</strong><span className={`status ${p.stock===0?"refunded":"pending"}`}>{p.stock===0?"OUT OF STOCK":"LOW STOCK"}</span></div></div>)}</div>}
        <button className="outline-button" onClick={()=>navigate("Stock")}>View inventory <ArrowUpRight size={15}/></button>
      </div>
    </section>

    <section className="dashboard-grid">
      <div className="panel table-panel">
        <PanelHeader title="Top products" sub="Best sellers in the current view" action="View all" onAction={()=>navigate("Reports")}/>
        {topProducts.length===0 ? <div className="empty">No sales in this range.</div> : <DataTable headers={showProfit ? ["PRODUCT","QTY SOLD","SALES","PROFIT"] : ["PRODUCT","QTY SOLD","SALES"]} rows={topProducts.map(r=>showProfit ? [r.name,String(r.qty),money(r.revenue),money(r.profit)] : [r.name,String(r.qty),money(r.revenue)])}/>}
      </div>
      <div className="panel table-panel">
        <PanelHeader title="Staff performance" sub={canViewMoney(role) ? "Sales by team member" : "Sales by team member (totals only)"}/>
        {staffRows.length===0 ? <div className="empty">No sales in this range.</div> : <DataTable headers={canViewMoney(role) ? ["STAFF","ORDERS","SALES","DISCOUNTS","REFUNDS","PROFIT"] : ["STAFF","ORDERS","SALES"]} rows={staffRows.map(r=>canViewMoney(role)
          ? [r.name,String(r.orders),money(r.sales),r.discounts>0?`-${money(r.discounts).slice(1)}`:"—",r.refunds>0?money(r.refunds):"—",money(Math.round(r.profit*100)/100)]
          : [r.name,String(r.orders),money(r.sales)])}/>}
      </div>
    </section>
  </>;
}

type ProductsTab = "products" | "categories" | "stock";

const PAGE_SIZE = 10;

function Products({ catalog, query, onQuery, onUpsert, onDelete, onAdjust, canManage, initialTab, embed, initialAdd }: { catalog: Product[]; query: string; onQuery: (q: string) => void; onUpsert: (p: Product, done?: (ok: boolean) => void) => void; onDelete: (sku: string, done?: (ok: boolean) => void) => void; onAdjust: (sku: string, delta: number) => void; canManage: boolean; initialTab?: ProductsTab; embed?: boolean; initialAdd?: boolean }) {
  const [tab, setTab] = useState<ProductsTab>(initialTab ?? "products");
  const [catOpen, setCatOpen] = useState(false);
  const [category, setCategory] = useState("All categories");
  const [editing, setEditing] = useState<Product | null>(null);
  const [adding, setAdding] = useState(initialAdd === true && canManage);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [stockDone, setStockDone] = useState<string | null>(null);
  // Server-paged table content. `version` bumps after every successful mutation so the
  // effect below refetches the current page (adds/edits/deletes appear without the user
  // having to touch the search box).
  const [version, setVersion] = useState(0);
  // Server-driven paging for the Products table (falls back to local filtering offline).
  const [page, setPage] = useState(1);
  const [serverItems, setServerItems] = useState<Product[] | null>(null);
  const [serverMeta, setServerMeta] = useState({ total: 0, pages: 1 });
  const [serverError, setServerError] = useState<string | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);

  const categories = Array.from(new Set(catalog.map(p => p.category))).sort();
  const switchTab = (t: ProductsTab) => { setTab(t); setBanner(null); setStockDone(null); };
  const saveProduct = (p: Product, done?: (ok: boolean) => void) => {
    const isNew = !catalog.some(x => x.sku === p.sku);
    const prev = catalog;
    onUpsert(p, ok => {
      if (ok) setBanner(isNew ? `${p.name} added to catalog.` : `${p.name} updated.`);
      done?.(ok);
    });
    setVersion(v => v + 1);
  };

  // Fetch one server page whenever search/category/page changes (debounced, aborted).
  useEffect(() => {
    if (tab !== "products") return;
    const controller = new AbortController();
    setLoadingPage(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query, category: category === "All categories" ? "" : category, page: String(page), limit: String(PAGE_SIZE) });
        const res = await fetch(`/api/products?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { items: Product[]; total: number; pages: number };
        setServerItems(data.items);
        setServerMeta({ total: data.total, pages: data.pages });
        setServerError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setServerError("Live search unavailable — filtering the loaded catalog instead.");
      } finally {
        setLoadingPage(false);
      }
    }, 250);
    return () => { clearTimeout(t); controller.abort(); };
  }, [tab, query, category, page, version]);

  const q = query.toLowerCase();
  const localMatches = catalog.filter(p => `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(q) && (category === "All categories" || p.category === category));
  const rows = serverItems ?? localMatches;
  const goPage = (p: number) => { setPage(Math.min(Math.max(1, p), serverMeta.pages)); };

  return <>{!embed && <PageHeading title={pageInfo[initialTab === "categories" ? "Categories" : "Products"].title} sub={pageInfo[initialTab === "categories" ? "Categories" : "Products"].subtitle} action={initialTab === "categories" ? undefined : (canManage ? "Add product" : undefined)} onAction={()=>{setBanner(null);setAdding(true);}}/>}
  {initialTab !== "categories" && <div className="subnav">
    <button className={`tab ${tab==="products"?"active":""}`} onClick={()=>switchTab("products")}>Products</button>
    <button className={`tab ${tab==="categories"?"active":""}`} onClick={()=>switchTab("categories")}>Categories</button>
    <button className={`tab ${tab==="stock"?"active":""}`} onClick={()=>switchTab("stock")}>Stock adjustment</button>
  </div>}
  {banner && <p className="checkout-success success-banner" role="status">{banner}</p>}
  {serverError && <p className="offline-banner" role="alert">{serverError}</p>}
  {tab==="products" && <div className="panel table-panel"><div className="toolbar"><strong>{serverItems ? `${serverMeta.total} products` : `${localMatches.length} products`}</strong><div className="filter"><Search size={15}/><input placeholder="Filter products" value={query} onChange={e=>{onQuery(e.target.value);setPage(1);}}/></div><div className="select-wrap"><button className="select-button" onClick={()=>setCatOpen(o=>!o)}>{category} <ChevronDown size={14}/></button>{catOpen && <><button className="menu-backdrop" aria-label="Close category menu" onClick={()=>setCatOpen(false)}/><div className="select-menu"><button className={category==="All categories"?"on":""} onClick={()=>{setCategory("All categories");setPage(1);setCatOpen(false);}}>All categories</button>{categories.map(c=><button key={c} className={category===c?"on":""} onClick={()=>{setCategory(c);setPage(1);setCatOpen(false);}}>{c}</button>)}</div></>}</div></div>
    {rows.length===0 ? <div className="empty">{loadingPage ? "Loading…" : "No products match your filters."}</div> :
    <div className="table-wrap"><table><thead><tr>{["","PRODUCT","SKU","CATEGORY","PRICE","STOCK","STATUS",""].map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{rows.map(p=><tr key={p.sku} className={loadingPage?"row-loading":""}>
      <td><div className="cell-media">{p.image?<img src={p.image} alt=""/>:<div className="product-placeholder"><Package size={16}/></div>}</div></td><td><strong>{p.name}</strong></td><td>{p.sku}</td><td>{p.category}</td><td>{money(p.price)}</td><td>{p.stock} units</td>
      <td><span className={`status ${p.stock===0?"refunded":p.stock<LOW_STOCK_LIMIT?"pending":"paid"}`}>{p.stock===0?"Out of stock":p.stock<LOW_STOCK_LIMIT?"Low stock":"In stock"}</span></td>
      <td><div className="row-actions">{canManage ? [<button key="e" className="text-button" onClick={()=>{setBanner(null);setEditing(p);}}>Edit</button>, <button key="d" className="text-button danger" onClick={()=>{setBanner(null);setDeleting(p);}}>Delete</button>] : <span className="you-chip">view only</span>}</div></td>
    </tr>)}</tbody></table></div>}
    {serverItems && serverMeta.pages > 1 && (<div className="pager"><button className="outline-button" disabled={page<=1} onClick={()=>goPage(page-1)}>‹ Prev</button><span>Page {page} of {serverMeta.pages} · {serverMeta.total} products</span><button className="outline-button" disabled={page>=serverMeta.pages} onClick={()=>goPage(page+1)}>Next ›</button></div>)}</div>}
  {tab==="categories" && <div className="panel table-panel"><div className="toolbar"><strong>{categories.length} categories</strong></div><DataTable headers={["CATEGORY","PRODUCTS","UNITS IN STOCK","VALUE","STATUS"]} rows={categories.map(c=>{const ps=catalog.filter(p=>p.category===c);return [c,String(ps.length),String(ps.reduce((n,p)=>n+p.stock,0)),money(ps.reduce((n,p)=>n+p.price*p.stock,0)),"Active"];})}/></div>}
  {tab==="stock" && (canManage ? <StockAdjustment catalog={catalog} onAdjust={onAdjust} onDone={msg=>{setStockDone(msg);setVersion(v => v + 1);}}/> : <div className="panel empty-panel"><div className="empty"><strong>Managers only</strong><p>Ask a manager or administrator to record stock adjustments.</p></div></div>)}
  {stockDone && <p className="checkout-success success-banner stock-banner" role="status">{stockDone}</p>}
  {(adding||editing) && <ProductFormModal catalog={catalog} initial={editing} onClose={()=>{setAdding(false);setEditing(null);}} onSave={(p,done)=>saveProduct(p,done)}/>}
  {deleting && <div className="modal-backdrop" onClick={()=>setDeleting(null)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-header"><h2>Delete product</h2><button aria-label="Close delete dialog" onClick={()=>setDeleting(null)}><X size={18}/></button></div><p className="refund-summary">Delete <strong>{deleting.name}</strong> ({deleting.sku}) from the catalog? This cannot be undone.</p><div className="modal-actions"><button className="outline-button" onClick={()=>setDeleting(null)}>Cancel</button><button className="primary-button danger-button" onClick={()=>{onDelete(deleting.sku,ok=>{if(ok){setBanner(`${deleting.name} deleted.`);setVersion(v => v + 1);}});setDeleting(null);}}>Delete product</button></div></div></div>}</>;
}

function StockAdjustment({ catalog, onAdjust, onDone }: { catalog: Product[]; onAdjust: (sku: string, delta: number) => void; onDone: (msg: string) => void }) {
  const [sku, setSku] = useState(catalog[0]?.sku ?? "");
  const [type, setType] = useState<"restock"|"remove">("restock");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const product = catalog.find(p => p.sku === sku);
  const submit = () => {
    const n = parseInt(qty, 10);
    if (!product) return setError("Choose a product to adjust.");
    if (!Number.isFinite(n) || n <= 0) return setError("Quantity must be a positive whole number.");
    if (type === "remove" && n > product.stock) return setError(`Cannot remove ${n} units — only ${product.stock} in stock.`);
    onAdjust(sku, type === "restock" ? n : -n);
    onDone(`${type === "restock" ? "Added" : "Removed"} ${n} units of ${product.name} — now at ${type === "restock" ? product.stock + n : product.stock - n} units${note.trim() ? ` (${note.trim()})` : ""}.`);
    setQty("1"); setNote(""); setError(null);
  };
  return <div className="panel stock-form"><div className="toolbar"><h2>Adjust stock</h2></div><p className="form-intro">Record stock corrections from deliveries, damage, or manual counts.</p><div className="form-grid"><label>Product<select value={sku} onChange={e=>{setSku(e.target.value);setError(null);}}>{catalog.map(p=><option key={p.sku} value={p.sku}>{p.name} — {p.stock} in stock</option>)}</select></label><label>Adjustment type<select value={type} onChange={e=>{setType(e.target.value as "restock"|"remove");setError(null);}}><option value="restock">Add stock (delivery / found)</option><option value="remove">Remove stock (damage / loss)</option></select></label><label>Quantity<input type="number" min="1" value={qty} onChange={e=>{setQty(e.target.value);setError(null);}}/></label><label>Note (optional)<input placeholder="e.g. Weekly stock count" value={note} onChange={e=>setNote(e.target.value)}/></label></div>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button className="primary-button" onClick={submit}>Apply adjustment</button></div></div>;
}

function ProductFormModal({ catalog, initial, onClose, onSave }: { catalog: Product[]; initial: Product | null; onClose: () => void; onSave: (p: Product, done: (ok: boolean) => void) => void }) {
  const [form, setForm] = useState({ name: initial?.name ?? "", sku: initial?.sku ?? nextSku(catalog), category: initial?.category ?? "", price: initial !== null ? String(initial.price) : "", cost: initial !== null ? String(initial.cost ?? 0) : "", stock: initial !== null ? String(initial.stock) : "", image: initial?.image ?? "" });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => { setForm({ ...form, [k]: e.target.value }); setError(null); };
  // Downscale the chosen file to a small JPEG data URL so documents stay light (API caps at 60KB).
  const pickImage = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Please choose an image file.");
    if (file.size > 5 * 1024 * 1024) return setError("Image is too large (max 5MB).");
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 256;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return setError("Could not process the image.");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL("image/jpeg", 0.82);
        if (data.length > 60_000) return setError("Image is still too large after processing — try a smaller one.");
        setForm(f => ({ ...f, image: data }));
        setError(null);
      };
      img.onerror = () => setError("Could not read that image.");
      img.src = String(reader.result);
    };
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsDataURL(file);
  };
  const submit = () => {
    const name = form.name.trim(), category = form.category.trim(), sku = form.sku.trim().toUpperCase();
    const price = parseFloat(form.price), stock = parseInt(form.stock, 10), cost = form.cost.trim() === "" ? 0 : parseFloat(form.cost);
    if (!name) return setError("Product name is required.");
    if (!category) return setError("Category is required.");
    if (!Number.isFinite(price) || price <= 0) return setError("Price must be a positive number.");
    if (!Number.isFinite(cost) || cost < 0) return setError("Cost must be zero or more.");
    if (!Number.isInteger(stock) || stock < 0) return setError("Stock must be zero or more.");
    if (!sku) return setError("SKU is required.");
    if (catalog.some(p => p.sku === sku && p.sku !== initial?.sku)) return setError(`SKU ${sku} is already used by another product.`);
    onSave({ name, sku, category, price, cost, stock, ...(form.image ? { image: form.image } : {}) }, ok => { if (ok) onClose(); else setError("Could not save this product — see the message at the top of the page."); });
  };
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-header"><h2>{initial ? "Edit product" : "Add product"}</h2><button aria-label="Close product form" onClick={onClose}><X size={18}/></button></div><div className="form-grid"><label>Name<input autoFocus placeholder="e.g. Iced Green Tea 500ml" value={form.name} onChange={set("name")}/></label><label>SKU<input placeholder="Auto-generated" value={form.sku} onChange={set("sku")}/></label><label>Category<input placeholder="e.g. Beverages" list="category-options" value={form.category} onChange={set("category")}/><datalist id="category-options">{Array.from(new Set(catalog.map(p=>p.category))).map(c=><option key={c} value={c}/>)}</datalist></label><label>Price (USD)<input type="number" min="0.01" step="0.01" placeholder="0.00" value={form.price} onChange={set("price")}/></label><label>Cost (USD)<input type="number" min="0" step="0.01" placeholder="0.00" value={form.cost} onChange={set("cost")}/></label><label>Stock (units)<input type="number" min="0" placeholder="0" value={form.stock} onChange={set("stock")}/></label><div className="image-picker" style={{ gridColumn: "1 / -1" }}>{form.image?<img src={form.image} alt="Product preview"/>:<div className="image-placeholder"><Package size={22}/></div>}<div className="image-actions"><label className="outline-button image-label">Choose image<input type="file" accept="image/*" style={{ display: "none" }} onChange={e=>{pickImage(e.target.files?.[0]); e.target.value = "";}}/></label>{form.image&&<button type="button" className="outline-button" onClick={()=>{setForm(f=>({...f,image:""}));setError(null);}}>Remove</button>}</div></div></div>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button className="outline-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={submit}>{initial ? "Save changes" : "Add product"}</button></div></div></div>;
}

/** Stock page: live stock table with low-stock highlighting plus the adjustment form. */
function StockPage({ catalog, canManage, onAdjust, embed }: { catalog: Product[]; canManage: boolean; onAdjust: (sku: string, delta: number) => void; embed?: boolean }) {
  const [done, setDone] = useState<string | null>(null);
  const stockStatus = (stock: number) => stock === 0 ? ["Out of stock", "refunded"] as const : stock < 10 ? ["Low stock", "pending"] as const : ["Healthy", "paid"] as const;
  return <>
    {!embed && <PageHeading title={pageInfo["Stock"].title} sub={pageInfo["Stock"].subtitle}/>}
    {done && <p className="checkout-success success-banner" role="status">{done}</p>}
    <div className="stock-grid">
      <div className="panel table-panel">
        <div className="toolbar"><strong>{catalog.length} products</strong></div>
        <div className="table-wrap"><table><thead><tr>{["PRODUCT","SKU","CATEGORY","STOCK","VALUE","STATUS"].map((h,i)=><th key={i}>{h}</th>)}</tr></thead>
        <tbody>{catalog.map(p=>{const [label,tone]=stockStatus(p.stock);return <tr key={p.sku}>
          <td><strong>{p.name}</strong></td><td>{p.sku}</td><td>{p.category}</td><td>{p.stock} units</td><td>{money(p.price*p.stock)}</td>
          <td><span className={`status ${tone}`}>{label}</span></td>
        </tr>;})}</tbody></table></div>
      </div>
      {canManage ? <StockAdjustment catalog={catalog} onAdjust={onAdjust} onDone={setDone}/> : <div className="panel empty-panel"><div className="empty"><strong>Managers only</strong><p>Ask a manager or administrator to record stock adjustments.</p></div></div>}
    </div>
  </>;
}

type SalesTab = "pos" | "history" | "returns" | "held" | "today" | "possettings";
/** A suspended checkout as returned by /api/held-sales. */
type HeldSaleLite = { id: string; lines: SaleLine[]; itemCount: number; heldBy: string; heldAt: string; note?: string };

function Sales({ catalog, sales, onRecord, onRefund, storeName, storeLocation, receiptFooter, currency, role, initialTab, initialHistoryQuery, embed, methods, settings }: { catalog: Product[]; sales: Sale[]; onRecord: (lines: SaleLine[], payment: SalePayment, done?: (ok: boolean, sale?: Sale) => void) => void; onRefund: (id: string, reason: string, done?: (ok: boolean) => void) => void; storeName: string; storeLocation: string; receiptFooter: string; currency: string; role: StaffRole; initialTab: SalesTab; initialHistoryQuery?: string; embed?: boolean; methods?: string[]; settings?: StoreSettings }) {
  const [tab, setTab] = useState<SalesTab>(initialTab);
  const [cardsView, setCardsView] = useState(false);
  const [historyQuery, setHistoryQuery] = useState(initialHistoryQuery ?? "");
  // Server-paged history (falls back to local filtering offline). `version` bumps
  // after a refund so the current page refetches with fresh status.
  const [version, setVersion] = useState(0);
  const [page, setPage] = useState(1);
  const [serverSales, setServerSales] = useState<Sale[] | null>(null);
  const [serverMeta, setServerMeta] = useState({ total: 0, pages: 1 });
  const [serverError, setServerError] = useState<string | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);
  const [cart, setCart] = useState<SaleLine[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [busy, setBusy] = useState(false);
  // Ref mirrors `busy` synchronously: two clicks in the same tick must not both pass the guard.
  const busyRef = useRef(false);
  const [justCheckedOut, setJustCheckedOut] = useState<Sale | null>(null);
  const [viewing, setViewing] = useState<Sale | null>(null);
  const [refunding, setRefunding] = useState<Sale | null>(null);
  const [refundNote, setRefundNote] = useState("");
  const [refundDone, setRefundDone] = useState<string | null>(null);
  const total = cart.reduce((sum,l)=>sum+l.price*l.qty,0);
  const visibleProducts = catalog.filter(p => `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(productQuery.toLowerCase()));
  const refundable = sales.filter(s => s.status !== "Refunded");
  // Server page when online; local filter as offline fallback.
  const historyMatches = serverSales ?? sales.filter(s => `${s.id} ${s.customer}`.toLowerCase().includes(historyQuery.toLowerCase()));

  // Fetch one server page whenever search/page changes (debounced, aborted), and
  // after refunds (version bump) so statuses refresh without a manual reload.
  useEffect(() => {
    if (tab !== "history") return;
    const controller = new AbortController();
    setLoadingPage(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: historyQuery, page: String(page), limit: "25" });
        const res = await fetch(`/api/sales?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { sales: Sale[]; total: number; pages: number };
        setServerSales(data.sales);
        setServerMeta({ total: data.total, pages: data.pages });
        setServerError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") { setServerSales(null); setServerError("Could not load sales — showing local data."); }
      } finally { setLoadingPage(false); }
    }, 250);
    return () => { controller.abort(); clearTimeout(t); };
  }, [tab, historyQuery, page, version]);
  const refunds = sales.filter(s => s.status === "Refunded");
  const switchTab = (t: SalesTab) => { setTab(t); setRefundDone(null); };
  const startRefund = (s: Sale) => { setViewing(null); setRefundNote(""); setRefundDone(null); setRefunding(s); };
  const confirmRefund = () => { if (!refunding || busyRef.current) return; busyRef.current = true; const target = refunding; setBusy(true); onRefund(target.id, refundNote, ok => { busyRef.current = false; setBusy(false); if (ok) { setRefundDone(target.id); setVersion(v => v + 1); } setRefunding(null); }); };
  const [paying, setPaying] = useState(false);
  const openPayment = () => { if (busyRef.current || cart.length === 0) return; setJustCheckedOut(null); setPaying(true); };
  const doCheckout = (p: SalePayment) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    onRecord(cart, p, (ok, sale) => {
      busyRef.current = false; setBusy(false);
      setPaying(false);
      if (ok) { setCart([]); setJustCheckedOut(sale ?? null); }
    });
  };

  // ── Held / suspended sales: park a cart mid-checkout and resume it later.
  // Stock was never deducted on hold, so resuming needs no inventory recheck —
  // the sale endpoint still enforces stock policy at final checkout.
  const [heldList, setHeldList] = useState<HeldSaleLite[]>([]);
  const [heldFlash, setHeldFlash] = useState<string | null>(null);
  const loadHeld = useCallback(() => {
    fetch("/api/held-sales", { credentials: "same-origin" }).then(r => r.ok ? r.json() : Promise.reject()).then(d => setHeldList(d as HeldSaleLite[])).catch(() => {});
  }, []);
  useEffect(loadHeld, [loadHeld]);
  const holdCurrent = () => {
    if (busyRef.current || cart.length === 0) return;
    busyRef.current = true; setBusy(true);
    fetch("/api/held-sales", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines: cart.map(l => ({ sku: l.sku, name: l.name, price: l.price, qty: l.qty })) }) })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (ok) { setCart([]); setHeldFlash(`Cart held as ${(d as HeldSaleLite).id} — resume it from Held / Suspended Sales.`); loadHeld(); }
        else setHeldFlash((d as { error?: string }).error ?? "Could not hold the cart.");
      })
      .catch(() => setHeldFlash("Could not reach the server."))
      .finally(() => { busyRef.current = false; setBusy(false); });
  };
  const resumeHeld = (h: HeldSaleLite) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    fetch("/api/held-sales", { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: h.id }) })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (ok) { setCart((d as HeldSaleLite).lines); setHeldFlash(`${h.id} resumed into the current sale.`); switchTab("pos"); loadHeld(); }
        else setHeldFlash((d as { error?: string }).error ?? "Could not resume the held sale.");
      })
      .catch(() => setHeldFlash("Could not reach the server."))
      .finally(() => { busyRef.current = false; setBusy(false); });
  };
  const discardHeld = (h: HeldSaleLite) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    fetch(`/api/held-sales?id=${encodeURIComponent(h.id)}`, { method: "DELETE", credentials: "same-origin" })
      .then(r => { if (r.ok) { setHeldFlash(`${h.id} discarded.`); loadHeld(); } else setHeldFlash("Could not discard the held sale."); })
      .catch(() => setHeldFlash("Could not reach the server."))
      .finally(() => { busyRef.current = false; setBusy(false); });
  };

  // Today's sales: paid + pending sales recorded today (refunds excluded — they
  // are shown, and processed, in Returns).
  const todaysSales = sales.filter(s => {
    if (s.status === "Refunded") return false;
    if (s.createdAt) return new Date(s.createdAt).toDateString() === new Date().toDateString();
    return (s.date || "").startsWith("Today");
  });

  // Cashier keyboard shortcuts (POS tab only, never while typing): F2 product
  // search, F4 charge, F8 hold, F3 held list.
  const posSearchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (embed) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      if (e.key === "F2") { e.preventDefault(); posSearchRef.current?.focus(); }
      else if (typing) return;
      else if (e.key === "F4" && tab === "pos") { e.preventDefault(); openPayment(); }
      else if (e.key === "F8" && tab === "pos") { e.preventDefault(); holdCurrent(); }
      else if (e.key === "F3" && !embed) { e.preventDefault(); switchTab("held"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const posTabs: { key: SalesTab; label: string }[] = [
    { key: "pos", label: "New Sale" },
    { key: "held", label: "Held / Suspended" },
    { key: "today", label: "Today's Sales" },
    { key: "returns", label: "Returns" },
    { key: "possettings", label: "POS Settings" },
  ];
  return <>{!embed && <PageHeading title={pageInfo[tab === "history" ? "Transactions" : "POS"].title} sub={pageInfo[tab === "history" ? "Transactions" : "POS"].subtitle}/>}
  {!embed && <div className="subnav subnav-wrap">
    {posTabs.map(t => <button key={t.key} className={`tab ${tab === t.key ? "active" : ""}`} onClick={() => switchTab(t.key)}>{t.label}{t.key === "held" && heldList.length > 0 ? ` (${heldList.length})` : ""}</button>)}
    {heldList.length > 0 && !embed && <span className="you-chip">F3 to open held sales</span>}   
  </div>}
  {heldFlash && <p className="checkout-success" role="status">{heldFlash}<button className="banner-close" aria-label="Dismiss" onClick={() => setHeldFlash(null)}><X size={14}/></button></p>}
  {refundDone && <p className="checkout-success success-banner" role="status">Refund for {refundDone} recorded successfully.</p>}
  {tab==="history" && <div className="panel table-panel"><div className={`toolbar ${loadingPage?"row-loading":""}`}><strong>{serverSales ? (historyQuery ? `${serverMeta.total} matching sales` : `${serverMeta.total} sales`) : (historyQuery ? `${historyMatches.length} of ${sales.length} sales` : `${sales.length} sales`)}</strong><div className="filter"><Search size={15}/><input placeholder="Search invoice or customer" value={historyQuery} onChange={e=>{setHistoryQuery(e.target.value);setPage(1);}}/>{historyQuery&&<button className="filter-clear" aria-label="Clear sales search" onClick={()=>{setHistoryQuery("");setPage(1);}}><X size={13}/></button>}</div><button className="outline-button" onClick={()=>setCardsView(v=>!v)}>{cardsView?"Table view":"Card view"}</button></div>{serverError&&<p className="offline-banner" role="alert">{serverError}</p>}{historyMatches.length===0?<div className="empty">{loadingPage?"Loading…":"No sales match your search."}</div>:cardsView?<div className={`receipts-grid ${loadingPage?"row-loading":""}`}>{historyMatches.map(s=><div className="panel receipt-card" key={s.id}><div className="receipt-card-head"><strong>{s.id}</strong><span className={`status ${statusClass(s.status)}`}>{s.status}</span></div><p>{s.customer} · {s.date}</p><div className="receipt-card-total"><span>{itemCount(s)} items</span><strong>{money(saleTotal(s))}</strong></div><button className="outline-button" onClick={()=>setViewing(s)}>View receipt</button></div>)}</div>:<SalesTable sales={historyMatches} onView={setViewing} onRefund={startRefund}/>}{serverSales && serverMeta.pages > 1 && (<div className="pager"><button className="outline-button" disabled={page<=1} onClick={()=>setPage(page-1)}>‹ Prev</button><span>Page {page} of {serverMeta.pages} · {serverMeta.total} sales</span><button className="outline-button" disabled={page>=serverMeta.pages} onClick={()=>setPage(page+1)}>Next ›</button></div>)}</div>}
  {tab==="pos" && <div className="pos-layout"><div className="panel product-picker"><div className="toolbar"><h2>Choose products</h2><div className="filter"><Search size={15}/><input ref={posSearchRef} value={productQuery} onChange={e=>setProductQuery(e.target.value)} placeholder="Search products (F2)"/></div></div><div className="picker-grid">{visibleProducts.map(p=>{const inCart=cart.find(l=>l.sku===p.sku)?.qty??0;const left=p.stock-inCart;return <button key={p.sku} className="picker-card" disabled={left<=0} onClick={()=>{setJustCheckedOut(null);setCart(c=>c.some(l=>l.sku===p.sku)?c.map(l=>l.sku===p.sku?{...l,qty:l.qty+1}:l):[...c,toLine(p)]);}}><div className="picker-thumb">{p.image?<img src={p.image} alt=""/>:<div className="product-placeholder"><Package size={20}/></div>}</div><strong>{p.name}</strong><span>{money(p.price)} · {left<=0?"none left":"in stock: "+left}</span></button>;})}{visibleProducts.length===0&&<div className="empty">No products match your search.</div>}</div></div><div className="panel cart-panel"><div className="panel-header"><h2>Current sale</h2><span className="status paid">{cart.reduce((n,l)=>n+l.qty,0)} items</span></div>{cart.length===0?<div className="empty">Your cart is empty</div>:<div className="cart-lines">{cart.map((l,i)=><div className="cart-line" key={l.sku}><div><strong>{l.name}</strong><span>{money(l.price)} × {l.qty}</span></div><button aria-label={`Remove ${l.name}`} onClick={()=>setCart(c=>c.filter((_,idx)=>idx!==i))}><X size={14}/></button></div>)}</div>}<div className="cart-total"><span>Subtotal</span><strong>{money(total)}</strong></div>{justCheckedOut&&<p className="checkout-success" role="status">Sale {justCheckedOut.id} recorded.{justCheckedOut.changeDue ? ` Change due ${money(justCheckedOut.changeDue)}.` : ""}</p>}<div className="modal-actions"><button className="outline-button" disabled={cart.length===0||busy} onClick={holdCurrent} title="Hold sale (F8)">Hold sale</button><button className="primary-button checkout" disabled={cart.length===0||busy} onClick={openPayment} title="Charge (F4)">{busy ? "Charging…" : `Charge ${money(total)}`}</button></div></div></div>}
  {tab==="held" && <div className="panel table-panel"><div className="toolbar"><strong>Held / suspended sales</strong><span className="you-chip">holding never reserves stock — stock policy applies when the sale is resumed and charged</span></div></div>}
  {tab==="held" && (heldList.length===0 ? <div className="empty">No held sales. Use “Hold sale” on New Sale to park a cart mid-checkout.</div> : <div className="pos-layout">{heldList.map(h=><div className="panel cart-panel" key={h.id}><div className="panel-header"><h2>{h.id}</h2><span className="status paid">{h.itemCount} items</span></div><div className="cart-lines">{h.lines.map(l=><div className="cart-line" key={l.sku}><div><strong>{l.name}</strong><span>{money(l.price)} × {l.qty}</span></div></div>)}</div><p className="form-intro">Held by {h.heldBy} · {new Date(h.heldAt).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"})}{h.note?` · ${h.note}`:""}</p><div className="modal-actions"><button className="primary-button" disabled={busy} onClick={()=>resumeHeld(h)}>Resume into current sale</button><button className="outline-button" disabled={busy} onClick={()=>discardHeld(h)}>Discard</button></div></div>)}</div>)}
  {tab==="today" && <div className="panel table-panel"><div className="toolbar"><strong>Sales recorded today</strong><span className="you-chip">{todaysSales.length} sale{todaysSales.length===1?"":"s"} · {money(todaysSales.reduce((t,s)=>t+saleTotal(s),0))} in sales today</span></div>{todaysSales.length===0?<div className="empty">No sales recorded today yet.</div>:<DataTable headers={["INVOICE","CUSTOMER","PAYMENT","AMOUNT","STATUS"]} rows={todaysSales.map(s=>[s.id,s.customer,s.payment,money(saleTotal(s)),s.status])}/>}</div>}
  {tab==="possettings" && <div className="panel table-panel"><div className="toolbar"><strong>POS posture — live from Settings</strong><span className="you-chip">change them in Settings; they apply at checkout instantly</span></div>{!settings?<div className="empty">Loading…</div>:<DataTable headers={["SETTING","VALUE"]} rows={[
    ["Accepted payment methods", ((settings.paymentMethods ?? []).filter(m=>m.enabled).map(m=>m.name).join(", ")) || "Cash"],
    ["Discount cap", `${settings.maxDiscountPercent ?? 50}% of subtotal (server-enforced)`],
    ["Tax", settings.taxEnabled ? `${settings.taxLabel || "Tax"} ${settings.taxRatePercent}% (${settings.taxInclusive ? "inclusive" : "exclusive"})` : "Off"],
    ["Stock policy", settings.allowNegativeStock ? "Allow selling below zero" : "Block sale when stock is insufficient"],
    ["Low-stock threshold", `${settings.lowStockThreshold ?? 10} units`],
    ["Loyalty", settings.loyaltyEnabled !== false ? `${settings.loyaltyEarnRate ?? 1} point(s) per ${settings.currency || "$"}1 on Paid sales` : "Off"],
  ]}/>}</div>}
  {tab==="returns" && <><div className="panel table-panel"><div className="toolbar"><strong>Refundable sales</strong><div className="filter"><Search size={15}/><input placeholder="Search sales" readOnly/></div><button className="select-button">All payments <ChevronDown size={14}/></button></div>{refundable.length===0?<div className="empty">Nothing left to refund.</div>:<SalesTable sales={refundable} onView={setViewing} onRefund={startRefund}/>}</div><div className="panel table-panel"><div className="toolbar"><strong>{refunds.length} refunds</strong></div>{refunds.length===0?<div className="empty">No refunds yet.</div>:<DataTable headers={["INVOICE","CUSTOMER","DATE","REFUNDED","REASON","STATUS"]} rows={refunds.map(s=>[s.id,s.customer,s.date,money(saleTotal(s)),s.refundReason||"—","Refunded"])}/>}</div></>}
  {viewing && <ReceiptModal sale={viewing} onClose={()=>setViewing(null)} onRefund={startRefund} storeName={storeName} storeLocation={storeLocation} receiptFooter={receiptFooter} currency={currency}/>}
  {paying && <PaymentModal total={total} itemCount={cart.reduce((n,l)=>n+l.qty,0)} currency={currency} role={role} busy={busy} onClose={()=>setPaying(false)} onConfirm={doCheckout} methods={methods}/>}
  {refunding && <div className="modal-backdrop" onClick={()=>setRefunding(null)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-header"><h2>Refund {refunding.id}</h2><button aria-label="Close refund dialog" onClick={()=>setRefunding(null)}><X size={18}/></button></div><p className="refund-summary">Refunding <strong>{money(saleTotal(refunding))}</strong> ({itemCount(refunding)} items) from <strong>{refunding.customer}</strong> back via {refunding.payment}.</p><label>Reason<textarea autoFocus placeholder="e.g. Damaged goods, customer changed their mind" value={refundNote} onChange={e=>setRefundNote(e.target.value)}/></label><div className="modal-actions"><button className="outline-button" onClick={()=>setRefunding(null)}>Cancel</button><button className="primary-button" disabled={busy} onClick={confirmRefund}>{busy ? "Refunding…" : `Confirm refund ${money(saleTotal(refunding))}`}</button></div></div></div>}</>;
}

function SalesTable({ sales, onView, onRefund }: { sales: Sale[]; onView: (s: Sale) => void; onRefund: (s: Sale) => void }) {
  return <div className="table-wrap"><table><thead><tr>{["INVOICE","CUSTOMER","DATE","PAYMENT","AMOUNT","STATUS",""].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{sales.map(s=><tr key={s.id}><td><strong>{s.id}</strong></td><td>{s.customer}</td><td>{s.date}</td><td>{s.payment}</td><td>{money(saleTotal(s))}</td><td><span className={`status ${statusClass(s.status)}`}>{s.status}</span></td><td><div className="row-actions"><button className="text-button" onClick={()=>onView(s)}>Receipt</button>{s.status!=="Refunded"&&<button className="text-button danger" onClick={()=>onRefund(s)}>Refund</button>}</div></td></tr>)}</tbody></table></div>;
}

/** Checkout confirmation: payment method, customer, discount (managers+), cash handling — then record. */
function PaymentModal({ total, itemCount, currency, role, busy, onClose, onConfirm, methods: enabledMethods }: { total: number; itemCount: number; currency: string; role: StaffRole; busy: boolean; onClose: () => void; onConfirm: (p: SalePayment) => void; methods?: string[] }) {
  // Enabled methods come from Payment Settings (falls back to the classic three).
  const METHODS = (enabledMethods && enabledMethods.length > 0 ? enabledMethods : ["Cash", "ABA Pay", "Credit"]) as string[];
  const [customer, setCustomer] = useState("");
  const [method, setMethod] = useState<string>("Cash");
  const [discount, setDiscount] = useState("");
  const [cash, setCash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cur = (n: number) => `${currency}${n.toFixed(2)}`;
  const discountNum = canViewMoney(role) && discount.trim() !== "" ? Number(discount) : 0;
  const invalidDiscount = discount.trim() !== "" && (!Number.isFinite(discountNum) || (discountNum as number) < 0);
  const overDiscount = Number.isFinite(discountNum) && discountNum > total;
  const netTotal = Math.round((total - Math.min(Math.max(discountNum, 0), total)) * 100) / 100;
  const paidNum = method === "Cash" && cash.trim() !== "" ? Number(cash) : undefined;
  const invalidCash = method === "Cash" && cash.trim() !== "" && (!Number.isFinite(paidNum) || (paidNum as number) < 0);
  const change = paidNum !== undefined && Number.isFinite(paidNum) ? Math.max(0, paidNum - netTotal) : undefined;
  const short = paidNum !== undefined && Number.isFinite(paidNum) && paidNum + 0.005 < netTotal;
  const confirm = () => {
    if (invalidDiscount) return setError("Discount must be zero or more.");
    if (invalidCash) return setError("Cash received must be a non-negative number.");
    if (short) return setError(`Cash received is less than the total (${cur(netTotal)}).`);
    setError(null);
    onConfirm({ customer: customer.trim(), payment: method, ...(discountNum > 0 && Number.isFinite(discountNum) ? { discount: discountNum } : {}), ...(method === "Cash" && cash.trim() !== "" && Number.isFinite(paidNum) ? { amountPaid: paidNum } : {}) });
  };
  return <div className="modal-backdrop" onClick={busy ? undefined : onClose}><div className="modal payment-modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-header"><h2>Confirm payment</h2>{!busy&&<button aria-label="Close payment dialog" onClick={onClose}><X size={18}/></button>}</div>
    <p className="refund-summary">{itemCount} item{itemCount===1?"":"s"} · total <strong>{cur(netTotal)}</strong></p>
    <div className="pay-methods" role="radiogroup" aria-label="Payment method">{METHODS.map(m => <button key={m} role="radio" aria-checked={method===m} className={`pay-method ${method===m?"on":""}`} onClick={()=>{setMethod(m);setError(null);}}>{m}</button>)}</div>
    <label>Customer name<input placeholder="Walk-in customer" value={customer} disabled={busy} onChange={e=>{setCustomer(e.target.value);setError(null);}}/></label>
    {canViewMoney(role)&&<label>Discount{method!=="Cash"&&<span className="you-chip"> · applied to the total</span>}<input inputMode="decimal" placeholder="0.00" value={discount} disabled={busy} onChange={e=>{setDiscount(e.target.value.replace(/[^\d.]/g,""));setError(null);}}/></label>}
    {(discountNum>0||overDiscount)&&Number.isFinite(discountNum)&&<div className="pay-change"><span>{overDiscount?"Discount exceeds the total":"Discount"}</span><strong className={overDiscount?"short":""}>{cur(Math.min(discountNum as number, total))}</strong></div>}
    {method==="Cash"&&<>
      <label>Cash received<input autoFocus inputMode="decimal" placeholder={cur(netTotal)} value={cash} disabled={busy} onChange={e=>{setCash(e.target.value.replace(/[^\d.]/g,""));setError(null);}}/></label>
      {paidNum!==undefined&&Number.isFinite(paidNum)&&<div className="pay-change"><span>Change due</span><strong className={short?"short":""}>{short?`Short ${cur(netTotal-paidNum)}`:cur(change as number)}</strong></div>}
    </>}
    {method==="Credit"&&<p className="form-intro">Credit sales are recorded as Pending until payment is collected.</p>}
    {error&&<p className="field-error" role="alert">{error}</p>}
    <div className="modal-actions"><button className="outline-button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy||invalidCash||invalidDiscount||overDiscount} onClick={confirm}>{busy?"Charging…":`Confirm ${cur(netTotal)}`}</button></div>
  </div></div>;
}

function ReceiptModal({ sale, onClose, onRefund, storeName, storeLocation, receiptFooter, currency }: { sale: Sale; onClose: () => void; onRefund: (s: Sale) => void; storeName: string; storeLocation: string; receiptFooter: string; currency: string }) {
  // While a receipt is open, the print stylesheet shows only the receipt (body.print-receipt).
  useEffect(() => {
    document.body.classList.add("print-receipt");
    return () => { document.body.classList.remove("print-receipt"); };
  }, []);
  const cur = (n: number) => `${currency}${n.toFixed(2)}`;
  return <div className="modal-backdrop" onClick={onClose}><div className="modal receipt-modal" onClick={e=>e.stopPropagation()}><div className="modal-header"><h2>Receipt {sale.id}</h2><button aria-label="Close receipt" onClick={onClose}><X size={18}/></button></div><p className="receipt-store"><strong>{storeName}</strong>{storeLocation&&` · ${storeLocation}`}</p><p className="receipt-meta">{sale.customer} · {sale.date} · Paid by {sale.payment}{sale.servedBy ? ` · Served by ${sale.servedBy}` : ""}</p><div className="receipt-lines">{sale.lines.map(l=><div className="receipt-line" key={l.sku}><span>{l.name} <em>× {l.qty}</em></span><strong>{cur(l.price*l.qty)}</strong></div>)}</div>{(sale.discount??0)>0&&<div className="receipt-payline"><span>Discount</span><strong>-{cur(sale.discount as number).slice(1)}</strong></div>}{!!sale.taxAmount&&<div className="receipt-payline"><span>{taxLabelOf(sale)}</span><strong>{cur(sale.taxAmount)}</strong></div>}<div className="receipt-total"><span>Total</span><strong>{cur(saleTotal(sale))}</strong></div>{sale.amountPaid!==undefined&&<div className="receipt-payline"><span>Paid by {sale.payment}</span><strong>{cur(sale.amountPaid)}</strong></div>}{sale.changeDue!==undefined&&sale.changeDue>0&&<div className="receipt-payline change"><span>Change due</span><strong>{cur(sale.changeDue)}</strong></div>}<p className="receipt-status">Status: <span className={`status ${statusClass(sale.status)}`}>{sale.status}</span>{sale.status==="Refunded"&&<em> · {sale.refundReason}</em>}</p>{receiptFooter&&<p className="receipt-footer">{receiptFooter}</p>}<div className="modal-actions"><button className="outline-button" onClick={()=>window.print()}><Printer size={15}/>Print</button><button className="outline-button" onClick={onClose}>Close</button>{sale.status!=="Refunded"&&<button className="primary-button" onClick={()=>onRefund(sale)}>Process refund</button>}</div></div></div>;
}

/** Staff hub: 8 views over the roster, roles, departments, attendance, and the audit trail. */
function StaffHub({ staff, sales, role, currentUser, query, onQuery, roles, reloadRoles, onAdd, onUpdate, onDelete, initialTab }: {
  staff: StaffMember[]; sales: Sale[]; role: StaffRole; currentUser: string; query: string; onQuery: (q: string) => void;
  roles: RoleDef[]; reloadRoles: () => void;
  onAdd: (m: StaffMember, pin: string, done?: (ok: boolean) => void) => void;
  onUpdate: (name: string, patch: Partial<StaffMember> & { pin?: string }, done?: (ok: boolean) => void) => void;
  onDelete: (name: string, done?: (ok: boolean) => void) => void; initialTab?: StaffTab;
}) {
  const tabs = ["All Staff", "Add Staff", "Roles & Permissions", "Departments", "Shifts", "Attendance", "Staff Performance", "Activity Log"] as const;
  const [tab, setTab] = useState<StaffTab>(initialTab ?? "All Staff");
  const [adding, setAdding] = useState(false);
  const [departments, setDepartments] = useState<DepartmentLite[] | null>(null);
  const [attendance, setAttendance] = useState<AttendanceLite[] | null>(null);
  const [activity, setActivity] = useState<ActivityLite[] | null>(null);
  const [shifts, setShifts] = useState<ShiftLite[] | null>(null);
  const loadStaffData = useCallback(() => {
    fetch("/api/departments").then(r => r.ok ? r.json() : Promise.reject()).then(d => setDepartments(d as DepartmentLite[])).catch(() => setDepartments([]));
    fetch("/api/attendance?limit=100").then(r => r.ok ? r.json() : Promise.reject()).then(d => setAttendance(d as AttendanceLite[])).catch(() => setAttendance([]));
    fetch("/api/activity?limit=150").then(r => r.ok ? r.json() : Promise.reject()).then(d => setActivity(d as ActivityLite[])).catch(() => setActivity([]));
    fetch("/api/register").then(r => r.ok ? r.json() : Promise.reject()).then(d => setShifts((d as { history?: ShiftLite[] }).history ?? [])).catch(() => setShifts([]));
  }, []);
  useEffect(loadStaffData, [loadStaffData]);
  const canManageStaff = CAN.manageStaff(role, roles);
  const when = (iso?: string) => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
  const showProfit = canViewMoney(role, roles);
  const perf = new Map<string, { orders: number; total: number; profit: number }>();
  for (const s of sales.filter(x => x.status !== "Refunded")) {
    const who = s.servedBy ?? "Unattributed";
    const row = perf.get(who) ?? { orders: 0, total: 0, profit: 0 };
    row.orders++;
    row.total = Math.round((row.total + saleTotal(s)) * 100) / 100;
    row.profit = Math.round((row.profit + saleTotal(s) - lineCost(s)) * 100) / 100;
    perf.set(who, row);
  }
  const perfRows = Array.from(perf.entries()).sort((a, b) => b[1].total - a[1].total);
  return <>
    <PageHeading title="Staff" sub="Team roster, roles, departments, shifts, and the audit trail"/>
    <div className="subnav subnav-wrap">
      {tabs.map(t => <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button>)}
    </div>
    {tab === "All Staff" && <StaffPage staff={staff} query={query} onQuery={onQuery} onAdd={onAdd} onUpdate={onUpdate} onDelete={onDelete} canManage={canManageStaff} currentUser={currentUser} roles={roles}/>}
    {tab === "Add Staff" && (canManageStaff
      ? <div className="panel empty-panel"><div className="empty"><strong>Add a team member</strong><p>Create a staff account with a role and a login PIN — the role decides what the member can do. New members can sign in at the register right away.</p><button className="primary-button" onClick={() => setAdding(true)}><Plus size={15}/> Open add-staff form</button></div></div>
      : <div className="panel empty-panel"><div className="empty"><strong>Not allowed</strong><p>Your role does not include staff management.</p></div></div>)}
    {tab === "Roles & Permissions" && <RolesPermissionsView roles={roles} role={role} canManage={canManageStaff} reload={reloadRoles}/>}
    {tab === "Departments" && <DepartmentsView departments={departments} staff={staff} role={role} roles={roles} onUpdate={onUpdate} reload={loadStaffData}/>}
    {tab === "Shifts" && <div className="panel table-panel"><div className="toolbar"><strong>{shifts ? `${shifts.length} closed register shift${shifts.length === 1 ? "" : "s"}` : "Loading shifts…"}</strong><span className="you-chip">shared with the Cash Register hub</span></div>
      {!shifts ? <div className="empty">Loading…</div> : shifts.length === 0 ? <div className="empty">No closed register shifts yet — open and close a shift from the Cash Register hub and the history lands here.</div>
        : <DataTable headers={["SHIFT", "OPENED BY", "OPENED", "CLOSED", "FLOAT", "COUNTED", "VARIANCE"]} rows={[...shifts].sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? "")).map(s => [s.id, s.openedBy, when(s.openedAt), s.closedAt ? when(s.closedAt) : "—", money(s.openingFloat), money(s.closingCount ?? 0), money(s.variance ?? 0)])}/>}
    </div>}
    {tab === "Attendance" && <AttendanceView entries={attendance} selfName={currentUser} reload={loadStaffData}/>}
    {tab === "Staff Performance" && <div className="panel table-panel"><div className="toolbar"><strong>Sales by team member</strong><span className="you-chip">live from recorded sales</span></div>
      {perfRows.length === 0 ? <div className="empty">No sales yet — performance builds as the team sells.</div>
        : <DataTable headers={showProfit ? ["STAFF", "ORDERS", "SALES", "PROFIT"] : ["STAFF", "ORDERS", "SALES"]} rows={perfRows.map(([who, r]) => showProfit ? [who, String(r.orders), money(r.total), money(r.profit)] : [who, String(r.orders), money(r.total)])}/>}
    </div>}
    {tab === "Activity Log" && (showProfit ? <div className="panel table-panel"><div className="toolbar"><strong>{activity ? `${activity.length} recent entries` : "Loading activity…"}</strong><span className="you-chip">newest first</span></div>
      {!activity ? <div className="empty">Loading…</div> : activity.length === 0 ? <div className="empty">No activity recorded yet — sales, refunds, register shifts, and attendance will appear here.</div>
        : <div className="table-wrap"><table><thead><tr>{["WHEN", "ACTION", "DETAIL", "BY"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
          {activity.map((a, i) => <tr key={i}><td>{when(a.createdAt)}</td><td><strong>{a.action}</strong></td><td>{a.detail}</td><td>{a.by}</td></tr>)}
        </tbody></table></div>}
    </div> : <div className="panel empty-panel"><div className="empty"><strong>Managers only</strong><p>The activity log is visible to managers and administrators.</p></div></div>)}
    {adding && <StaffFormModal roles={roles} onClose={() => setAdding(false)} onSave={(m, pin, done) => onAdd(m, pin, ok => { if (ok) { setAdding(false); setTab("All Staff"); } else done(ok); })}/>}
  </>;
}

/** Departments view: create, list with membership, assign staff, delete. */
function DepartmentsView({ departments, staff, role, roles, onUpdate, reload }: { departments: DepartmentLite[] | null; staff: StaffMember[]; role: StaffRole; roles: RoleDef[]; onUpdate: (name: string, patch: Partial<StaffMember> & { pin?: string }, done?: (ok: boolean) => void) => void; reload: () => void }) {
  const isManager = can("departments.manage", role, roles);
  const isAdmin = can("staff.manage", role, roles);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [assignFor, setAssignFor] = useState<StaffMember | null>(null);
  const [assignTo, setAssignTo] = useState("");
  const create = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/departments", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ name, description }) });
      const d = await res.json() as { error?: string };
      if (!res.ok) { setError(d.error ?? "Could not create the department."); return; }
      setName(""); setDescription(""); reload();
    } catch { setError("Could not reach the server."); }
    finally { setBusy(false); }
  };
  const remove = async (dept: DepartmentLite) => {
    setError(null);
    try {
      const res = await fetch(`/api/departments?id=${encodeURIComponent(dept.id)}`, { method: "DELETE", credentials: "same-origin" });
      const d = await res.json() as { error?: string };
      if (!res.ok) { setError(d.error ?? "Could not delete the department."); return; }
      reload();
    } catch { setError("Could not reach the server."); }
  };
  return <>
    {isManager && <div className="panel purchase-form-panel"><div className="toolbar"><strong>New department</strong></div>
      <div className="form-grid">
        <label>Name<input placeholder="e.g. Sales floor" value={name} onChange={e => { setName(e.target.value); setError(null); }}/></label>
        <label>Description (optional)<input placeholder="What this team covers" value={description} onChange={e => setDescription(e.target.value)}/></label>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="modal-actions"><button className="primary-button" disabled={busy || !name.trim()} onClick={create}>Create department</button></div>
    </div>}
    {!isManager && error && <p className="field-error" role="alert">{error}</p>}
    <div className="panel table-panel"><div className="toolbar"><strong>{departments ? `${departments.length} department${departments.length === 1 ? "" : "s"}` : "Loading departments…"}</strong></div>
      {!departments ? <div className="empty">Loading…</div> : departments.length === 0 ? <div className="empty">No departments yet — create one above to start grouping the team.</div>
        : <div className="table-wrap"><table><thead><tr>{["DEPARTMENT", "DESCRIPTION", "MEMBERS", ""].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
          {departments.map(d => { const members = staff.filter(m => m.department === d.name); return <tr key={d.id}>
            <td><strong>{d.name}</strong></td><td>{d.description || "—"}</td>
            <td>{members.length === 0 ? <span className="you-chip">none</span> : members.map(m => m.name).join(", ")}</td>
            <td><div className="row-actions">
              {isAdmin && <button className="text-button" onClick={() => { setAssignTo(d.name); setAssignFor(staff.find(m => !m.department) ?? staff[0] ?? null); setError(null); }}>Assign…</button>}
              {isManager && <button className="text-button danger" onClick={() => remove(d)}>Delete</button>}
              {!isManager && <span className="you-chip">view only</span>}
            </div></td>
          </tr>; })}
        </tbody></table></div>}
    </div>
    {assignFor && <div className="modal-backdrop" onClick={() => setAssignFor(null)}><div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-header"><h2>Assign department</h2><button aria-label="Close assign dialog" onClick={() => setAssignFor(null)}><X size={18}/></button></div>
      <div className="form-grid">
        <label>Staff member<select value={assignFor.name} onChange={e => setAssignFor(staff.find(m => m.name === e.target.value) ?? null)}>{staff.map(m => <option key={m.name} value={m.name}>{m.name} — {m.role}</option>)}</select></label>
        <label>Department<select value={assignTo} onChange={e => setAssignTo(e.target.value)}><option value="">(No department)</option>{(departments ?? []).map(d => <option key={d.id} value={d.name}>{d.name}</option>)}</select></label>
      </div>
      <div className="modal-actions"><button className="outline-button" onClick={() => setAssignFor(null)}>Cancel</button><button className="primary-button" onClick={() => { if (assignFor) onUpdate(assignFor.name, { department: assignTo }, ok => { if (ok) { setAssignFor(null); reload(); } else setError("Could not update the staff member."); }); }}>Save assignment</button></div>
    </div></div>}
  </>;
}

/** Attendance view: clock in/out for the signed-in member plus the shared history. */
function AttendanceView({ entries, selfName, reload }: { entries: AttendanceLite[] | null; selfName: string; reload: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const openEntry = (entries ?? []).find(e => e.staffName === selfName && !e.clockOut);
  const act = async (action: "clockIn" | "clockOut") => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action }) });
      const d = await res.json() as { error?: string };
      if (!res.ok) { setError(d.error ?? "Attendance action failed."); return; }
      reload();
    } catch { setError("Could not reach the server."); }
    finally { setBusy(false); }
  };
  const when = (iso?: string) => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
  return <>
    <div className="panel purchase-form-panel"><div className="toolbar"><strong>Your attendance{selfName ? ` — ${selfName}` : ""}</strong>{openEntry && <span className="you-chip">On shift since {new Date(openEntry.clockIn).toLocaleTimeString()}</span>}</div>
      <div className="modal-actions">
        <button className="primary-button" disabled={busy || !!openEntry} onClick={() => act("clockIn")}>Clock in</button>
        <button className="outline-button" disabled={busy || !openEntry} onClick={() => act("clockOut")}>Clock out</button>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
    <div className="panel table-panel"><div className="toolbar"><strong>{entries ? `${entries.length} recent entries` : "Loading attendance…"}</strong><span className="you-chip">newest first</span></div>
      {!entries ? <div className="empty">Loading…</div> : entries.length === 0 ? <div className="empty">No clock-ins recorded yet.</div>
        : <div className="table-wrap"><table><thead><tr>{["STAFF", "CLOCK IN", "CLOCK OUT", "HOURS"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
          {entries.map(e => <tr key={e.id}><td><strong>{e.staffName}</strong></td><td>{when(e.clockIn)}</td><td>{e.clockOut ? when(e.clockOut) : "—"}</td>
            <td>{e.clockOut ? <span className="status paid">{Math.round(((new Date(e.clockOut).getTime() - new Date(e.clockIn).getTime()) / 3600_000) * 100) / 100}h</span> : <span className="status pending">On shift</span>}</td></tr>)}
        </tbody></table></div>}
    </div>
  </>;
}

/** Live RBAC view: the role list with editable capability checkboxes and custom-role management. */
function RolesPermissionsView({ roles, role, canManage, reload }: { roles: RoleDef[]; role: StaffRole; canManage: boolean; reload: () => void }) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [formCaps, setFormCaps] = useState<string[]>(["sell"]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const toggle = (list: string[], cap: string) => list.includes(cap) ? list.filter(c => c !== cap) : [...list, cap];
  const create = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/roles", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ name: form.name, description: form.description, capabilities: formCaps }) });
      const d = await res.json() as { error?: string };
      if (!res.ok) { setError(d.error ?? "Could not create the role."); return; }
      setForm({ name: "", description: "" }); setFormCaps(["sell"]); setCreating(false); setSaved(`Role “${form.name}” created.`); reload();
    } catch { setError("Could not reach the server."); }
    finally { setBusy(false); }
  };
  const patchCaps = async (r: RoleDef, caps: string[]) => {
    setBusy(true); setError(null); setSaved(null);
    try {
      const res = await fetch(`/api/roles/${encodeURIComponent(r.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ capabilities: caps }) });
      const d = await res.json() as { error?: string };
      if (!res.ok) { setError(d.error ?? "Could not update the role."); reload(); return; }
      setSaved(`${r.name} updated — every member of this role is affected immediately.`); reload();
    } catch { setError("Could not reach the server."); reload(); }
    finally { setBusy(false); }
  };
  const remove = async (r: RoleDef) => {
    setBusy(true); setError(null); setSaved(null);
    try {
      const res = await fetch(`/api/roles/${encodeURIComponent(r.id)}`, { method: "DELETE", credentials: "same-origin" });
      const d = await res.json() as { error?: string };
      if (!res.ok) { setError(d.error ?? "Could not delete the role."); return; }
      setSaved(`Role “${r.name}” deleted.`); reload();
    } catch { setError("Could not reach the server."); }
    finally { setBusy(false); }
  };
  const CapChecks = ({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) => <>
    {CAPABILITY_GROUPS.map(g => <div key={g.group} style={{ marginBottom: 10 }}>
      <span className="you-chip">{g.group}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 5 }}>
        {g.items.map(c => <label key={c} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#566575", fontWeight: 700, cursor: canManage ? "pointer" : "default" }}>
          <input type="checkbox" checked={value.includes(c)} disabled={!canManage || busy} onChange={() => { if (canManage) onChange(toggle(value, c)); }}/>{CAPABILITY_LABELS[c]}
        </label>)}
      </div>
    </div>)}
  </>;
  return <>
    {canManage && (creating ? <div className="panel purchase-form-panel"><div className="toolbar"><strong>New role</strong></div>
      <div className="form-grid">
        <label>Name<input placeholder="e.g. Shift Supervisor" value={form.name} onChange={e => { setForm({ ...form, name: e.target.value }); setError(null); }}/></label>
        <label>Description (optional)<input placeholder="What this role is for" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}/></label>
      </div>
      <div style={{ margin: "12px 0 4px" }}><CapChecks value={formCaps} onChange={setFormCaps}/></div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="modal-actions"><button className="outline-button" onClick={() => { setCreating(false); setError(null); }}>Cancel</button><button className="primary-button" disabled={busy || !form.name.trim()} onClick={create}>Create role</button></div>
    </div>
    : <div className="panel purchase-form-panel"><div className="toolbar"><strong>Roles decide permissions</strong><button className="text-button" onClick={() => { setSaved(null); setCreating(true); }}><Plus size={13}/> New role</button></div>
      <p className="form-intro">Every staff member gets their capabilities from their role — edit a role once and every member of it updates instantly. Capabilities are re-checked on the server for every request.</p>
    </div>)}
    {!canManage && error && <p className="field-error" role="alert">{error}</p>}
    {saved && <p className="checkout-success success-banner" role="status">{saved}</p>}
    {roles.length === 0 ? <div className="panel empty-panel"><div className="empty"><strong>No roles loaded</strong><p>The roles list could not be loaded — refresh the page.</p></div></div>
      : roles.map(r => <div className="panel" key={r.id} style={{ marginBottom: 16 }}>
        <div className="toolbar"><strong>{r.name}{r.system && <span className="you-chip"> · system</span>}{r.id === role && <span className="you-chip"> · your role</span>}</strong>
          {!r.system && canManage && <button className="text-button danger" disabled={busy} onClick={() => remove(r)}>Delete</button>}
        </div>
        {r.description && <p className="form-intro" style={{ margin: "-8px 0 12px" }}>{r.description}</p>}
        <CapChecks value={r.capabilities} onChange={next => patchCaps(r, next)}/>
      </div>)}
  </>;
}

function StaffPage({ staff, query, onQuery, onAdd, onUpdate, onDelete, canManage, currentUser, roles }: { staff: StaffMember[]; query: string; onQuery: (q: string) => void; onAdd: (m: StaffMember, pin: string, done?: (ok: boolean) => void) => void; onUpdate: (name: string, patch: Partial<StaffMember> & { pin?: string }, done?: (ok: boolean) => void) => void; onDelete: (name: string, done?: (ok: boolean) => void) => void; canManage: boolean; currentUser: string; roles: RoleDef[] }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [deleting, setDeleting] = useState<StaffMember | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const q = query.toLowerCase();
  const rows = staff.filter(m => `${m.name} ${m.role} ${m.permissions} ${m.status}`.toLowerCase().includes(q));
  return <><PageHeading title="Staff" sub="Manage team members and permissions" action={canManage ? "Add staff" : undefined} onAction={()=>{setBanner(null);setAdding(true);}}/>
    {banner && <p className="checkout-success success-banner" role="status">{banner}</p>}
    <div className="panel table-panel"><div className="toolbar"><strong>{query ? `${rows.length} of ${staff.length} staff` : `${staff.length} staff`}</strong><div className="filter"><Search size={15}/><input placeholder="Search name, role, or status" value={query} onChange={e=>onQuery(e.target.value)}/>{query&&<button className="filter-clear" aria-label="Clear staff search" onClick={()=>onQuery("")}><X size={13}/></button>}</div><div className="select-wrap"><button className="select-button">{staff.filter(m=>m.status==="Active").length} active <ChevronDown size={14}/></button></div></div>
    {rows.length===0 ? <div className="empty">No staff match your search.</div> : <div className="table-wrap"><table><thead><tr>{["NAME","ROLE","PERMISSIONS","STATUS",""].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(m=><tr key={m.name}>
      <td><strong>{m.name}</strong></td><td>{m.role}</td><td>{m.permissions}</td><td><span className={`status ${m.status==="Inactive"?"refunded":m.status==="Active"?"paid":"pending"}`}>{m.status}</span>{m.name===currentUser&&<em className="you-chip"> · you</em>}</td>
      <td><div className="row-actions">{canManage ? [<button key="e" className="text-button" onClick={()=>{setBanner(null);setEditing(m);}}>Edit</button>, !can("staff.manage", m.role, roles) ? <button key="d" className="text-button danger" onClick={()=>{setBanner(null);setDeleting(m);}}>Delete</button> : null] : <span className="you-chip">view only</span>}</div></td>
    </tr>)}</tbody></table></div>}</div>
    {adding && <StaffFormModal roles={roles} onClose={()=>setAdding(false)} onSave={(m,pin,done)=>{onAdd(m,pin,ok=>{if(ok)setBanner(`${m.name} added to the team.`);done(ok);});}}/>}
    {editing && <StaffFormModal roles={roles} initial={editing} onClose={()=>setEditing(null)} onSave={(m,pin,done)=>{onUpdate(editing.name,{role:m.role,...(pin?{pin}:{})},ok=>{if(ok)setBanner(`${m.name} updated.`);done(ok);});}}/>}
    {deleting && <div className="modal-backdrop" onClick={()=>setDeleting(null)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-header"><h2>Remove staff member</h2><button aria-label="Close remove dialog" onClick={()=>setDeleting(null)}><X size={18}/></button></div><p className="refund-summary">Remove <strong>{deleting.name}</strong> ({deleting.role}) from the team? This cannot be undone.</p><div className="modal-actions"><button className="outline-button" onClick={()=>setDeleting(null)}>Cancel</button><button className="primary-button danger-button" onClick={()=>{onDelete(deleting.name,ok=>{if(ok)setBanner(`${deleting.name} removed.`);});setDeleting(null);}}>Remove member</button></div></div></div>}
  </>;
}

function StaffFormModal({ initial, roles, onClose, onSave }: { initial?: StaffMember; roles: RoleDef[]; onClose: () => void; onSave: (m: StaffMember, pin: string, done: (ok: boolean) => void) => void }) {
  const [form, setForm] = useState({ name: initial?.name ?? "", role: (initial?.role ?? "Cashier") as StaffRole, pin: "" });
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const name = form.name.trim();
    const pin = form.pin.trim();
    if (!name) return setError("Staff name is required.");
    if (name.length > 80) return setError("Staff name is too long (max 80 characters).");
    if (!roles.find(r => r.id === form.role)) return setError("Pick a role from the list.");
    if (!/^\d{4,6}$/.test(pin)) return setError("PIN must be 4–6 digits.");
    onSave({ name, role: form.role, permissions: roles.find(r => r.id === form.role)?.name ?? "", status: "Active" }, pin, ok => { if (ok) onClose(); else setError("Could not save this staff member — see the message at the top of the page."); });
  };
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => { setForm({ ...form, [k]: e.target.value }); setError(null); };
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-header"><h2>{initial ? "Edit staff member" : "Add staff"}</h2><button aria-label="Close staff form" onClick={onClose}><X size={18}/></button></div><div className="form-grid"><label>Name<input autoFocus placeholder="e.g. Chan L." value={form.name} onChange={set("name")}/></label><label>Login PIN (4–6 digits)<input type="password" inputMode="numeric" maxLength={6} placeholder={initial ? "Leave blank to keep current PIN" : "e.g. 4321"} value={form.pin} onChange={set("pin")}/></label><label>Role<select value={form.role} onChange={set("role")}>{roles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label>Permissions<em className="you-chip">from the role — {roles.find(r=>r.id===form.role)?.capabilities.length ?? 0} capabilities</em></label></div>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button className="outline-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={submit}>{initial ? "Save changes" : "Add staff member"}</button></div></div></div>;
}

function LoginScreen({ onLogin, settings }: { onLogin: (name: string, role: StaffRole) => void; settings: StoreSettings }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim() || !pin.trim()) return setError("Enter your name and PIN.");
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/auth/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), pin: pin.trim() }), credentials: "same-origin" });
      const data = await res.json() as { name?: string; role?: StaffRole; signedInAt?: string; error?: string };
      if (!res.ok || !data.name || !data.role) { setError(data.error ?? "Sign-in failed."); return; }
      onLogin(data.name, data.role);
    } catch {
      setError("Cannot reach the sign-in service — is the database running?");
    } finally { setBusy(false); }
  };
  return <div className="login-backdrop"><div className="login-card">
    <div className="login-brand"><div className="brand-mark">{settings.name.charAt(0).toUpperCase()}</div><div><strong>{settings.name}</strong><span>POS SYSTEM</span></div></div>
    <h1>Sign in</h1>
    <p className="login-sub">Use your staff name and PIN to open the register.</p>
    <form onSubmit={e => { e.preventDefault(); submit(); }}>
      <label>Name<input autoFocus placeholder="e.g. Sokha P." value={name} onChange={e => { setName(e.target.value); setError(null); }}/></label>
      <label>PIN<input type="password" inputMode="numeric" placeholder="••••" maxLength={6} value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, "")); setError(null); }}/></label>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="primary-button login-button" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
    <p className="login-hint">Demo PINs — Sokha P. (Admin) 1111 · Dara K. (Manager) 2222 · Mony S. (Cashier) 3333</p>
  </div></div>;
}

type ReportsTab = "products" | "inventory";
type ReportRange = "today" | 7 | 30 | "month" | "custom" | "all";

function Finance({ sales }: { sales: Sale[] }) {
  const [txnQuery, setTxnQuery] = useState("");
  const [method, setMethod] = useState("All payments");
  const [methodOpen, setMethodOpen] = useState(false);

  const counted = sales.filter(s => s.status !== "Refunded");
  const refunds = sales.filter(s => s.status === "Refunded");
  const income = counted.reduce((sum, s) => sum + saleTotal(s), 0);
  const refunded = refunds.reduce((sum, s) => sum + saleTotal(s), 0);
  const net = income - refunded;
  const pending = sales.filter(s => s.status === "Pending");
  const pendingAmount = pending.reduce((sum, s) => sum + saleTotal(s), 0);
  const methods = ["All payments", ...Array.from(new Set(sales.map(s => s.payment)))];
  const matches = sales.filter(s => `${s.id} ${s.customer} ${s.payment}`.toLowerCase().includes(txnQuery.toLowerCase()) && (method === "All payments" || s.payment === method));

  return <><PageHeading title={pageInfo["Cash Register"].title} sub={pageInfo["Cash Register"].subtitle}/>
    <section className="stats-grid">
      <Stat label="Gross income" value={money(income)} change={`${counted.length} paid orders`} icon={CircleDollarSign} tone="green"/>
      <Stat label="Refunded" value={money(refunded)} change={`${refunds.length} refunds`} icon={CreditCard} tone="orange" negative={refunds.length>0}/>
      <Stat label="Net revenue" value={money(net)} change="income minus refunds" icon={ArrowUpRight} tone="purple" negative={net<0}/>
      <Stat label="Awaiting payment" value={money(pendingAmount)} change={`${pending.length} pending orders`} icon={ShoppingCart} tone="blue" negative={pending.length>0}/>
    </section>
    <div className="panel table-panel"><div className="toolbar"><strong>{txnQuery ? `${matches.length} of ${sales.length} transactions` : `${sales.length} transactions`}</strong>
      <div className="filter"><Search size={15}/><input placeholder="Search invoice, customer, or method" value={txnQuery} onChange={e=>setTxnQuery(e.target.value)}/>{txnQuery&&<button className="filter-clear" aria-label="Clear transaction search" onClick={()=>setTxnQuery("")}><X size={13}/></button>}</div>
      <div className="select-wrap"><button className="select-button" onClick={()=>setMethodOpen(o=>!o)}>{method} <ChevronDown size={14}/></button>{methodOpen && <><button className="menu-backdrop" aria-label="Close payment-method menu" onClick={()=>setMethodOpen(false)}/><div className="select-menu">{methods.map(m=><button key={m} className={method===m?"on":""} onClick={()=>{setMethod(m);setMethodOpen(false);}}>{m}</button>)}</div></>}</div>
    </div>
    {matches.length===0?<div className="empty">No transactions match your filters.</div>:<DataTable headers={["INVOICE","CUSTOMER","PAYMENT","AMOUNT","STATUS"]} rows={matches.map(s=>[s.id,s.customer,s.payment,money(saleTotal(s)),s.status])}/>}
    </div>
  </>;
}

/** Settings hub: 17 views. Real views read/write the settings document and real APIs; speculative groups show documented policy instead of invented options. */
function SettingsHub({ settings, sales, role, roles, canManage, onSave, onChanged, navigate }: {
  settings: StoreSettings; sales: Sale[]; role: StaffRole; roles: RoleDef[]; canManage: boolean;
  onSave: (s: StoreSettings, done?: (ok: boolean) => void) => void; onChanged: () => void; navigate: (t: string) => void;
}) {
  type View = "General" | "Store / Locations" | "Users & Security" | "POS & Sales" | "Products & Inventory" | "Purchases" | "Customers" | "Suppliers" | "Payments" | "Taxes" | "Discounts" | "Loyalty" | "Receipts & Printing" | "Notifications" | "Integrations" | "Backup & Data" | "Audit Log";
  const views: View[] = ["General", "Store / Locations", "Users & Security", "POS & Sales", "Products & Inventory", "Purchases", "Customers", "Suppliers", "Payments", "Taxes", "Discounts", "Loyalty", "Receipts & Printing", "Notifications", "Integrations", "Backup & Data", "Audit Log"];
  const [tab, setTab] = useState<View>("General");
  return <>
    <PageHeading title="Settings" sub="Configure your StoreGenz workspace"/>
    <div className="subnav subnav-wrap">
      {views.map(t => <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button>)}
    </div>
    {tab === "General" && <GeneralSettings settings={settings} canManage={canManage} onSave={onSave}/>}
    {tab === "Store / Locations" && <StoreLocationsSettings canManage={canManage}/>}
    {tab === "Users & Security" && <UsersSecuritySettings canManage={canManage} onChanged={onChanged}/>}
    {tab === "POS & Sales" && <PosSalesSettings settings={settings} canManage={canManage} onSave={onSave}/>}
    {tab === "Products & Inventory" && <InventorySettings settings={settings} canManage={canManage} onSave={onSave}/>}
    {tab === "Purchases" && <PolicyNoteCard title="Purchases" note="Purchase orders always require Manager capabilities, snapshot the unit cost on receive, and prune to one open PO per receive — policies are enforced where the PO is created, not configured here."/>}
    {tab === "Customers" && <PolicyNoteCard title="Customers" note="Customer names are unique and deletions are blocked while sales reference the customer; credit sales post as Pending and reduce the balance only when a payment is recorded."/>}
    {tab === "Suppliers" && <PolicyNoteCard title="Suppliers" note="Supplier names are unique and deletions are blocked while purchase orders reference the supplier; statements derive from non-returned POs minus recorded payments."/>}
    {tab === "Payments" && <PaymentMethodsSettings settings={settings} canManage={canManage} onChanged={onChanged}/>}
    {tab === "Taxes" && <TaxSettings settings={settings} canManage={canManage} onSave={onSave}/>}
    {tab === "Discounts" && <DiscountSettings settings={settings} canManage={canManage} onSave={onSave}/>}
    {tab === "Loyalty" && <LoyaltySettings settings={settings} canManage={canManage} onSave={onSave}/>}
    {tab === "Receipts & Printing" && <GeneralSettings settings={settings} canManage={canManage} onSave={onSave} receiptsOnly/>}
    {tab === "Notifications" && <PolicyNoteCard title="Notifications" note="No notification service is wired up yet — nothing to configure. In-app alerts today: the register variance banner and the low-stock list on the dashboard."/>}
    {tab === "Integrations" && <PolicyNoteCard title="Integrations" note="No third-party integrations are connected — no invented connections are shown. The POS talks to MongoDB and nothing else today."/>}
    {tab === "Backup & Data" && <BackupDataSettings canManage={canManage}/>}
    {tab === "Audit Log" && <div className="panel table-panel"><div className="toolbar"><strong>Full activity trail</strong><span className="you-chip">newest first</span></div><AuditTrailTable/></div>}
  </>;
}

/** Shared policy note for groups whose rules live in the enforcing module. */
function PolicyNoteCard({ title, note }: { title: string; note: string }) {
  return <div className="panel empty-panel"><div className="empty"><strong>{title}</strong><p>{note}</p><span className="you-chip">enforced by the module itself — nothing to configure here</span></div></div>;
}

/** Real-time audit trail for Settings → Audit Log (manager capability gate). */
function AuditTrailTable() {
  const [rows, setRows] = useState<{ action: string; detail: string; by: string; createdAt: string }[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/activity?limit=200").then(r => r.ok ? r.json() : Promise.reject()).then(d => { if (alive) setRows(d as typeof rows); }).catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, []);
  if (!rows) return <div className="empty">Loading…</div>;
  if (rows.length === 0) return <div className="empty">No activity recorded yet.</div>;
  return <DataTable headers={["WHEN", "ACTION", "DETAIL", "BY"]} rows={rows.map(a => [new Date(a.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }), a.action, a.detail, a.by])}/>;
}

/** General (and Receipts & Printing): store profile + receipt footer. */
function GeneralSettings({ settings, canManage, onSave, receiptsOnly }: { settings: StoreSettings; canManage: boolean; onSave: (s: StoreSettings, done?: (ok: boolean) => void) => void; receiptsOnly?: boolean }) {
  const [form, setForm] = useState({ name: settings.name, location: settings.location, currency: settings.currency, receiptFooter: settings.receiptFooter });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => setForm({ name: settings.name, location: settings.location, currency: settings.currency, receiptFooter: settings.receiptFooter }), [settings]);
  const dirty = JSON.stringify(form) !== JSON.stringify({ name: settings.name, location: settings.location, currency: settings.currency, receiptFooter: settings.receiptFooter });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => { setForm({ ...form, [k]: e.target.value }); setError(null); setSaved(false); };
  const save = () => {
    const next = { ...settings, name: form.name.trim(), location: form.location.trim(), currency: form.currency.trim(), receiptFooter: form.receiptFooter.trim() };
    if (!next.name) return setError("Store name is required.");
    if (!next.currency) return setError("Currency symbol is required.");
    onSave(next, ok => { if (ok) { setSaved(true); setError(null); } else setError("Could not save settings — check your connection and try again."); });
  };
  return <div className="panel stock-form"><div className="toolbar"><h2>{receiptsOnly ? "Receipts & printing" : "Store profile"}</h2>{!canManage&&<span className="you-chip">view only</span>}</div>
    <p className="form-intro">{receiptsOnly ? "The footer prints at the bottom of every invoice. Printing uses the browser's print dialog — there is no printer driver to configure here." : "The store name and location appear in the sidebar and on the sign-in screen."}</p>
    <div className="form-grid">
      {!receiptsOnly && <label>Store name<input value={form.name} disabled={!canManage} onChange={set("name")}/></label>}
      {!receiptsOnly && <label>Location<input value={form.location} disabled={!canManage} onChange={set("location")}/></label>}
      {!receiptsOnly && <label>Currency symbol<input value={form.currency} maxLength={4} disabled={!canManage} onChange={set("currency")}/></label>}
      <label>Receipt footer<input value={form.receiptFooter} placeholder="e.g. Thanks for shopping — see you soon!" disabled={!canManage} onChange={set("receiptFooter")}/></label>
    </div>
    {error&&<p className="field-error" role="alert">{error}</p>}
    {saved&&<p className="form-intro" role="status">Settings saved.</p>}
    {canManage&&<div className="modal-actions"><button className="primary-button" disabled={!dirty} onClick={save}>Save changes</button></div>}
  </div>;
}

/**
 * Store / Locations: the store registry. The configured single store is seeded as
 * ST-001; Add Store follows the recommended form (name, code, type, status) and
 * writes through POST /api/stores with unique code/name enforcement server-side.
 * Multi-store features beyond the registry (per-location stock, sales scoping,
 * store switching) remain unbuilt and are stated plainly — no invented behavior.
 */
function StoreLocationsSettings({ canManage }: { canManage: boolean }) {
  type StoreRow = { id: string; code: string; name: string; type: string; status: string; createdAt: string };
  const [stores, setStores] = useState<StoreRow[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", type: "Retail Store", status: "Active" });
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch("/api/stores", { credentials: "same-origin" }).then(r => r.ok ? r.json() : Promise.reject()).then(d => setStores(d as StoreRow[])).catch(() => setStores([]));
  }, []);
  useEffect(load, [load]);
  const openForm = () => {
    const list = stores ?? [];
    const max = list.reduce((m, s) => Math.max(m, Number.parseInt(s.code.slice(3), 10) || 0), 0);
    setForm({ name: "", code: `ST-${String(max + 1).padStart(3, "0")}`, type: "Retail Store", status: "Active" });
    setError(null);
    setShowForm(true);
  };
  const submit = async () => {
    setError(null);
    try {
      const res = await fetch("/api/stores", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await res.json() as { error?: string };
      if (!res.ok) return setError(d.error ?? "Could not create the store.");
      setShowForm(false);
      load();
    } catch { setError("Could not reach the server."); }
  };
  return <>
    <div className="panel table-panel"><div className="toolbar"><strong>Stores</strong><span className="you-chip">{stores?.length ?? 0} registered</span>
      {canManage && <button className="outline-button" onClick={openForm}><Plus size={14}/> Add Store</button>}
    </div>
    {!stores ? <div className="empty">Loading…</div>
      : stores.length === 0 ? <div className="empty">No stores registered yet — add the first one below.</div>
      : <DataTable headers={["CODE", "NAME", "TYPE", "STATUS", "ADDED"]} rows={stores.map(s => [s.code, s.name, s.type, s.status, new Date(s.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })])}/>}
    </div>
    {showForm && <AddStoreForm form={form} setForm={setForm} error={error} onSubmit={submit} onCancel={() => setShowForm(false)}/>}
  </>;
}

/** Add Store — the recommended form: name, code, type, status. */
function AddStoreForm({ form, setForm, error, onSubmit, onCancel }: {
  form: { name: string; code: string; type: string; status: string };
  setForm: (f: { name: string; code: string; type: string; status: string }) => void;
  error: string | null; onSubmit: () => void; onCancel: () => void;
}) {
  return <div className="panel stock-form" style={{ borderColor: "var(--line-strong, #2a2f3a)" }}>
    <div className="toolbar"><h2>Add Store</h2><span className="you-chip">recommended form</span></div>
    <p className="form-intro">Create a new store or business location.</p>
    <div className="form-grid">
      <label>Store Name *<input value={form.name} placeholder="Apple Store Siem Reap" onChange={e => setForm({ ...form, name: e.target.value })}/></label>
      <label>Store Code *<input value={form.code} placeholder="ST-001" onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}/></label>
      <label>Store Type<select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option>Retail Store</option><option>Warehouse</option><option>Online Store</option></select></label>
      <label>Status
        <span className="radio-row">
          <label className="radio"><input type="radio" name="store-status" checked={form.status === "Active"} onChange={() => setForm({ ...form, status: "Active" })}/> Active</label>
          <label className="radio"><input type="radio" name="store-status" checked={form.status === "Inactive"} onChange={() => setForm({ ...form, status: "Inactive" })}/> Inactive</label>
        </span>
      </label>
    </div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="modal-actions">
      <button className="primary-button" onClick={onSubmit}>Save store</button>
      <button className="outline-button" onClick={onCancel}>Cancel</button>
    </div>
  </div>;
}

/** Users & Security: live security posture + force sign-out of all sessions. */
function UsersSecuritySettings({ canManage, onChanged }: { canManage: boolean; onChanged: () => void }) {
  const [info, setInfo] = useState<{ authMode: string; sessionTtlDays: number; activeAccounts: number; inactiveAccounts: number; administrators: number; roles: Record<string, number> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    fetch("/api/security", { credentials: "same-origin" }).then(r => r.ok ? r.json() : Promise.reject()).then(d => setInfo(d as NonNullable<typeof info>)).catch(() => setInfo(null));
  }, []);
  useEffect(load, [load]);
  const signOutAll = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/security", { method: "POST", credentials: "same-origin" });
      const d = await res.json() as { error?: string; signedOut?: number };
      if (!res.ok) setError(d.error ?? "Could not sign users out.");
      else { load(); onChanged(); }
    } catch { setError("Could not reach the server."); }
    finally { setBusy(false); }
  };
  return <>
    <div className="panel table-panel"><div className="toolbar"><strong>Security posture</strong>{!canManage && <span className="you-chip">view only</span>}</div>
      {!info ? <div className="empty">Loading…</div> : <DataTable headers={["SETTING", "VALUE"]} rows={[
        ["Authentication", info.authMode],
        ["Session lifetime", `${info.sessionTtlDays} days`],
        ["Active accounts", String(info.activeAccounts)],
        ["Inactive accounts", String(info.inactiveAccounts)],
        ["Administrators", String(info.administrators)],
        ...Object.entries(info.roles).map(([r, n]) => [`${r} members`, String(n)]),
      ]}/>}
    </div>
    {canManage && <div className="panel purchase-form-panel"><div className="toolbar"><strong>Force sign-out</strong></div>
      <p className="form-intro">Deletes every active session — all users are signed out on their next request. Your own session is kept.</p>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="modal-actions"><button className="danger-button primary-button" disabled={busy} onClick={signOutAll}>Sign out all users</button></div>
    </div>}
  </>;
}

/** POS & Sales: oversell policy and discount cap note (discount cap lives in Discounts). */
function PosSalesSettings({ settings, canManage, onSave }: { settings: StoreSettings; canManage: boolean; onSave: (s: StoreSettings, done?: (ok: boolean) => void) => void }) {
  const allow = settings.allowNegativeStock ?? false;
  return <div className="panel stock-form"><div className="toolbar"><h2>Checkout stock policy</h2>{!canManage&&<span className="you-chip">view only</span>}</div>
    <p className="form-intro">When stock runs out mid-sale: <strong>{allow ? "allow the sale and let stock go negative" : "block the sale"}</strong>. Blocking is the safe default; allowing matches busy counters that sell before restocking.</p>
    <div className="modal-actions"><button className={allow ? "outline-button" : "primary-button"} disabled={!canManage || !allow} onClick={() => onSave({ ...settings, allowNegativeStock: false })}>Block overselling</button>
    <button className={allow ? "primary-button" : "outline-button"} disabled={!canManage || allow} onClick={() => onSave({ ...settings, allowNegativeStock: true })}>Allow negative stock</button></div>
  </div>;
}

/** Products & Inventory: low-stock threshold. */
function InventorySettings({ settings, canManage, onSave }: { settings: StoreSettings; canManage: boolean; onSave: (s: StoreSettings, done?: (ok: boolean) => void) => void }) {
  const [threshold, setThreshold] = useState(String(settings.lowStockThreshold ?? 10));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setThreshold(String(settings.lowStockThreshold ?? 10)), [settings]);
  const save = () => {
    const t = Number(threshold);
    if (!Number.isInteger(t) || t < 0 || t > 9999) return setError("Threshold must be a whole number between 0 and 9999.");
    onSave({ ...settings, lowStockThreshold: t }, ok => { if (ok) setError(null); else setError("Could not save — try again."); });
  };
  return <div className="panel stock-form"><div className="toolbar"><h2>Low-stock threshold</h2>{!canManage&&<span className="you-chip">view only</span>}</div>
    <p className="form-intro">Products at or below this stock count are flagged on the dashboard and in the Stock hub.</p>
    <div className="form-grid"><label>Flag products when stock is under<input type="number" min="0" max="9999" value={threshold} disabled={!canManage} onChange={e => { setThreshold(e.target.value); setError(null); }}/></label></div>
    {error&&<p className="field-error" role="alert">{error}</p>}
    {canManage&&<div className="modal-actions"><button className="primary-button" disabled={!threshold && threshold !== "0"} onClick={save}>Save threshold</button></div>}
  </div>;
}

/** Payment methods editor (same admin PATCH that powers the POS charge dialog). */
function PaymentMethodsSettings({ settings, canManage, onChanged }: { settings: StoreSettings; canManage: boolean; onChanged: () => void }) {
  const [methods, setMethods] = useState<MethodSetting[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setMethods(settings.paymentMethods ?? []), [settings]);
  const save = async (next: MethodSetting[]) => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ paymentMethods: next }) });
      const d = await res.json() as { error?: string };
      if (!res.ok) setError(d.error ?? "Could not save payment methods.");
      else onChanged();
    } catch { setError("Could not reach the server."); }
    finally { setBusy(false); }
  };
  const toggle = (m: MethodSetting) => {
    if (!methods) return;
    const next = methods.map(x => x.name === m.name ? { ...x, enabled: !x.enabled } : x);
    if (!next.some(x => x.enabled)) return setError("At least one method must stay enabled.");
    setMethods(next); save(next);
  };
  return <div className="panel table-panel"><div className="toolbar"><strong>Accepted payment methods</strong><span className="you-chip">the POS charge dialog reads this list live</span></div>
    {!methods ? <div className="empty">Loading…</div> : <div className="table-wrap"><table><thead><tr>{["METHOD", "ENABLED", ""].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
      {methods.map(m => <tr key={m.name}><td><strong>{m.name}</strong></td><td><span className={`status ${m.enabled ? "paid" : "refunded"}`}>{m.enabled ? "enabled" : "disabled"}</span></td>
        <td>{canManage && <button className="text-button" disabled={busy} onClick={() => toggle(m)}>{m.enabled ? "Disable" : "Enable"}</button>}</td></tr>)}
    </tbody></table></div>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </div>;
}

/** Taxes: enable, rate, label, and exclusive/inclusive mode. */
function TaxSettings({ settings, canManage, onSave }: { settings: StoreSettings; canManage: boolean; onSave: (s: StoreSettings, done?: (ok: boolean) => void) => void }) {
  const [form, setForm] = useState({ enabled: settings.taxEnabled ?? false, rate: String(settings.taxRatePercent ?? 0), label: settings.taxLabel ?? "VAT", inclusive: settings.taxInclusive ?? false });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => setForm({ enabled: settings.taxEnabled ?? false, rate: String(settings.taxRatePercent ?? 0), label: settings.taxLabel ?? "VAT", inclusive: settings.taxInclusive ?? false }), [settings]);
  const save = () => {
    const rate = Number(form.rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return setError("Tax rate must be between 0 and 100.");
    if (form.enabled && rate <= 0) return setError("Enter a non-zero rate, or disable tax.");
    onSave({ ...settings, taxEnabled: form.enabled, taxRatePercent: Math.round(rate * 100) / 100, taxLabel: form.label.trim() || "VAT", taxInclusive: form.inclusive }, ok => { if (ok) { setSaved(true); setError(null); } else setError("Could not save — try again."); });
  };
  const set = (k: keyof typeof form, v: string | boolean) => { setForm({ ...form, [k]: v }); setError(null); setSaved(false); };
  return <div className="panel stock-form"><div className="toolbar"><h2>Tax</h2>{!canManage&&<span className="you-chip">view only</span>}</div>
    <p className="form-intro">Exclusive adds the tax on top at checkout; inclusive treats the shelf price as already containing tax and divides it out for reporting.</p>
    <div className="form-grid">
      <label>Tax enabled<input type="checkbox" checked={form.enabled} disabled={!canManage} onChange={e => set("enabled", e.target.checked)}/></label>
      <label>Rate (%)<input type="number" min="0" max="100" step="0.01" value={form.rate} disabled={!canManage} onChange={e => set("rate", e.target.value)}/></label>
      <label>Label (receipts)<input value={form.label} maxLength={12} disabled={!canManage} onChange={e => set("label", e.target.value)}/></label>
      <label>Prices include tax<input type="checkbox" checked={form.inclusive} disabled={!canManage} onChange={e => set("inclusive", e.target.checked)}/></label>
    </div>
    {error&&<p className="field-error" role="alert">{error}</p>}
    {saved&&<p className="form-intro" role="status">Tax settings saved — new sales use them immediately.</p>}
    {canManage&&<div className="modal-actions"><button className="primary-button" onClick={save}>Save tax settings</button></div>}
  </div>;
}

/** Discounts: store-wide cap enforced by POST /api/sales. */
function DiscountSettings({ settings, canManage, onSave }: { settings: StoreSettings; canManage: boolean; onSave: (s: StoreSettings, done?: (ok: boolean) => void) => void }) {
  const [cap, setCap] = useState(String(settings.maxDiscountPercent ?? 50));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => setCap(String(settings.maxDiscountPercent ?? 50)), [settings]);
  const save = () => {
    const c = Number(cap);
    if (!Number.isFinite(c) || c < 0 || c > 100) return setError("Cap must be between 0 and 100.");
    onSave({ ...settings, maxDiscountPercent: Math.round(c * 100) / 100 }, ok => { if (ok) { setSaved(true); setError(null); } else setError("Could not save — try again."); });
  };
  return <div className="panel stock-form"><div className="toolbar"><h2>Discount cap</h2>{!canManage&&<span className="you-chip">view only</span>}</div>
    <p className="form-intro">A percentage discount larger than this share of the subtotal is rejected by the server — the cap applies to every checkout regardless of who is signed in.</p>
    <div className="form-grid"><label>Maximum discount (% of subtotal)<input type="number" min="0" max="100" step="0.5" value={cap} disabled={!canManage} onChange={e => { setCap(e.target.value); setError(null); setSaved(false); }}/></label></div>
    {error&&<p className="field-error" role="alert">{error}</p>}
    {saved&&<p className="form-intro" role="status">Cap saved.</p>}
    {canManage&&<div className="modal-actions"><button className="primary-button" onClick={save}>Save cap</button></div>}
  </div>;
}

/** Loyalty: enable, earn rate, and tier ladder. */
function LoyaltySettings({ settings, canManage, onSave }: { settings: StoreSettings; canManage: boolean; onSave: (s: StoreSettings, done?: (ok: boolean) => void) => void }) {
  const tiers = settings.loyaltyTiers ?? [{ name: "Bronze", min: 0 }];
  return <>
    <div className="panel stock-form"><div className="toolbar"><h2>Earning</h2>{!canManage&&<span className="you-chip">view only</span>}</div>
      <p className="form-intro">Points accrue on Paid sales to a known customer at <strong>{settings.loyaltyEarnRate ?? 1} point(s) per {settings.currency ?? "$"}1</strong>. {settings.loyaltyEnabled === false ? "Earning is currently disabled." : "Earning is active."}</p>
      <div className="modal-actions">
        <button className={settings.loyaltyEnabled === false ? "primary-button" : "outline-button"} disabled={!canManage} onClick={() => onSave({ ...settings, loyaltyEnabled: false })}>Disable earning</button>
        <button className={settings.loyaltyEnabled === false ? "outline-button" : "primary-button"} disabled={!canManage} onClick={() => onSave({ ...settings, loyaltyEnabled: true })}>Enable earning</button>
        <button className="outline-button" disabled={!canManage} onClick={() => { const v = window.prompt("Points earned per 1.00 spent", String(settings.loyaltyEarnRate ?? 1)); if (v === null) return; const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 1000) return; onSave({ ...settings, loyaltyEarnRate: Math.round(n * 100) / 100 }); }}>Set earn rate…</button>
      </div>
    </div>
    <div className="panel table-panel"><div className="toolbar"><strong>Tiers</strong><span className="you-chip">members reach a tier when their balance crosses its minimum</span></div>
      <DataTable headers={["TIER", "STARTS AT"]} rows={tiers.map(t => [t.name, `${t.min} points`])}/>
    </div>
  </>;
}

/** Backup & Data: list, create, and (with typing a confirmation) restore from the newest backup. */
function BackupDataSettings({ canManage }: { canManage: boolean }) {
  const [list, setList] = useState<{ file: string; createdAt: string; sizeBytes: number }[] | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch("/api/backups", { credentials: "same-origin" }).then(r => r.ok ? r.json() : Promise.reject()).then(d => setList((d as { backups?: typeof list }).backups ?? [])).catch(() => setList([]));
  }, []);
  useEffect(load, [load]);
  const create = async () => {
    setBusy(true); setError(null); setNote(null);
    try {
      const res = await fetch("/api/backups", { method: "POST", credentials: "same-origin" });
      const d = await res.json() as { error?: string; file?: string };
      if (!res.ok) setError(d.error ?? "Backup failed.");
      else { setNote(`Backup created: ${d.file}`); load(); }
    } catch { setError("Could not reach the server."); }
    finally { setBusy(false); }
  };
  const restore = async () => {
    setBusy(true); setError(null); setNote(null);
    try {
      const res = await fetch("/api/backups", { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ confirm: confirmText }) });
      const d = await res.json() as { error?: string; restoredFrom?: string };
      if (!res.ok) setError(d.error ?? "Restore failed.");
      else { setNote(`Restored from ${d.restoredFrom}`); setConfirmText(""); load(); }
    } catch { setError("Could not reach the server."); }
    finally { setBusy(false); }
  };
  return <>
    <div className="panel table-panel"><div className="toolbar"><strong>Backups</strong><span className="you-chip">auto: daily boot-time check + Windows task at 02:00</span>
      {canManage && <button className="text-button" disabled={busy} onClick={create}><Plus size={13}/> Back up now</button>}</div>
      {!list ? <div className="empty">Loading…</div> : list.length === 0 ? <div className="empty">No backup files yet — create one now or wait for the scheduled backup.</div>
        : <DataTable headers={["FILE", "CREATED", "SIZE"]} rows={list.map(b => [b.file, new Date(b.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }), `${Math.round(b.sizeBytes / 1024)} KB`])}/>}
    </div>
    {canManage && <div className="panel purchase-form-panel"><div className="toolbar"><strong>Restore from newest backup</strong></div>
      <p className="form-intro">Overwrites the live database with the newest file in backups/. Type <strong>RESTORE</strong> to confirm.</p>
      <div className="form-grid"><label>Confirmation<input value={confirmText} placeholder="RESTORE" onChange={e => { setConfirmText(e.target.value); setError(null); }}/></label></div>
      {error && <p className="field-error" role="alert">{error}</p>}
      {note && <p className="form-intro" role="status">{note}</p>}
      <div className="modal-actions"><button className="danger-button primary-button" disabled={busy || confirmText !== "RESTORE"} onClick={restore}>Restore now</button></div>
    </div>}
  </>;
}

function SettingsPage({ settings, canManage, onSave }: { settings: StoreSettings; canManage: boolean; onSave: (s: StoreSettings, done?: (ok: boolean) => void) => void }) {
  const [form, setForm] = useState<StoreSettings>(settings);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setForm(settings); }, [settings]);
  const dirty = JSON.stringify(form) !== JSON.stringify(settings);
  const set = (k: keyof StoreSettings, v: string) => { setForm(f => ({ ...f, [k]: v })); setError(null); setSaved(false); };
  const save = () => {
    const next = { name: form.name.trim(), location: form.location.trim(), receiptFooter: form.receiptFooter.trim(), currency: form.currency.trim() };
    if (!next.name) return setError("Store name is required.");
    if (!next.currency) return setError("Currency symbol is required.");
    onSave(next, ok => {
      if (ok) { setSaved(true); setError(null); } else setError("Could not save settings — check your connection and try again.");
    });
  };
  return <><PageHeading title="Settings" sub="Configure your StoreGenz workspace"/>
    <div className="panel stock-form"><div className="toolbar"><h2>Store profile</h2>{!canManage&&<span className="you-chip">view only</span>}</div>
      <p className="form-intro">The store name and location appear in the sidebar and on the sign-in screen; the receipt footer prints at the bottom of every invoice.</p>
      <div className="form-grid">
        <label>Store name<input value={form.name} disabled={!canManage} onChange={e=>set("name",e.target.value)}/></label>
        <label>Location<input value={form.location} disabled={!canManage} onChange={e=>set("location",e.target.value)}/></label>
        <label>Currency symbol<input value={form.currency} maxLength={4} disabled={!canManage} onChange={e=>set("currency",e.target.value)}/></label>
        <label>Receipt footer<input value={form.receiptFooter} placeholder="e.g. Thanks for shopping — see you soon!" disabled={!canManage} onChange={e=>set("receiptFooter",e.target.value)}/></label>
      </div>
      {error&&<p className="field-error" role="alert">{error}</p>}
      {saved&&<p className="form-intro" role="status">Settings saved.</p>}
      {canManage&&<div className="modal-actions"><button className="primary-button" disabled={!dirty} onClick={save}>Save changes</button></div>}
    </div>
  </>;
}

function GenericPage({ active, info, query, catalog }: { active: string; info?: {title:string;subtitle:string}; query:string; catalog: Product[] }) {
  const inventoryRows: string[][] = catalog.map(p=>[p.name,p.sku,p.category,String(p.stock),p.stock===0?"Out of stock":p.stock<LOW_STOCK_LIMIT?"Low stock":"In stock"]);
  const data: Record<string,string[][]> = { Purchases:[["PO-2048","Fresh Foods Co.","Today","$1,240.00","Received"],["PO-2047","Mega Distribution","Yesterday","$860.00","Pending"]], Inventory:inventoryRows, Customers:[["Sokha Trading","sokha@example.com","12 orders","$2,840.00","Active"],["Dara Market","dara@example.com","8 orders","$1,420.50","Active"]], Suppliers:[["Fresh Foods Co.","+855 12 555 019","Groceries","Active"],["Mega Distribution","+855 11 302 904","General","Active"]], Finance:[["Sales revenue","Today","Income","$4,286.50","Completed"],["Store rent","Sep 20","Expense","-$650.00","Paid"]]}; const rows=data[active]||[["Store profile","Main Store","Phnom Penh","Open"],["Tax settings","VAT 10%","Default","Configured"]]; return <><PageHeading title={info?.title||active} sub={info?.subtitle||""}/><div className="panel table-panel"><div className="toolbar"><strong>{query ? `Results for “${query}”` : "Overview"}</strong><div className="filter"><Search size={15}/><input placeholder={`Search ${active.toLowerCase()}`}/></div><button className="select-button">Filter <ChevronDown size={14}/></button></div><DataTable headers={["NAME","DETAIL","TYPE","AMOUNT","STATUS"]} rows={rows}/></div><div className="quick-grid"><div className="panel mini-card"><Tag size={18}/><strong>Quick actions</strong><span>Export data · Print report · Manage permissions</span></div><div className="panel mini-card"><Building2 size={18}/><strong>Need a hand?</strong><span>Visit our documentation for setup guides.</span></div></div></>;
}

function PageHeading({title,sub,action,onAction}:{title:string;sub:string;action?:string;onAction?:()=>void}) { return <div className="page-heading"><div><p className="eyebrow">WORKSPACE</p><h1>{title}</h1><p className="subtitle">{sub}</p></div>{action&&<button className="primary-button" onClick={onAction}><Plus size={18}/>{action}</button>}</div>; }
function PanelHeader({title,sub,action,onAction}:{title:string;sub?:string;action?:string;onAction?:()=>void}) { return <div className="panel-header"><div><h2>{title}</h2>{sub&&<p>{sub}</p>}</div>{action&&<button className="text-button" onClick={onAction}>{action}</button>}</div>; }
function Stat({label,value,change,icon:Icon,tone,negative,caption}:{label:string;value:string;change:string;icon:typeof ArrowUpRight;tone:string;negative?:boolean;caption?:string}) { return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={20}/></div><div className="stat-body"><span>{label}</span><strong>{value}</strong><small className={`change ${negative?"negative":""}`}>{negative?<ArrowDownRight size={12}/>:<ArrowUpRight size={12}/>} {change}<em>{caption ?? "vs last week"}</em></small></div></div>; }
function DataTable({headers,rows}:{headers:string[];rows:string[][]}) { return <div className="table-wrap"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{j===0?<strong>{cell}</strong>:j===row.length-1?<span className={`status ${cell.toLowerCase().includes("refund")||cell.toLowerCase().includes("out")?"refunded":cell.toLowerCase().includes("pending")||cell.toLowerCase().includes("low")?"pending":"paid"}`}>{cell}</span>:cell}</td>)}</tr>)}</tbody></table></div>; }
