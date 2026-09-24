"use client";

import {
  ArrowDownRight, ArrowLeftRight, ArrowUpRight, Banknote, Bell, Box, Boxes, BriefcaseBusiness, Building2, ChevronDown, ChevronUp,
  CircleDollarSign, ClipboardList, CreditCard, Download, FileBarChart, LayoutDashboard, LogOut, Menu,
  Package, Plus, Printer, ReceiptText, RotateCcw, Search, Settings, Settings as SettingsIcon, ShieldCheck, ShoppingCart, Store, Tag, Truck, Users, Wallet, X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

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

type StaffRole = "Administrator" | "Manager" | "Cashier";
type StaffMember = { name: string; role: StaffRole; permissions: string; status: "Active" | "Inactive" };
type Session = { name: string; role: StaffRole };
type StoreSettings = { name: string; location: string; receiptFooter: string; currency: string };
const DEFAULT_SETTINGS: StoreSettings = { name: "StoreGenz", location: "Phnom Penh", receiptFooter: "", currency: "$" };
/** Role rules, mirrored server-side by requireStaff() in lib/db.ts. */
const CAN = {
  sell: (_r: StaffRole) => true,
  refund: (_r: StaffRole) => true,
  manageProducts: (r: StaffRole) => r === "Manager" || r === "Administrator",
  manageStaff: (r: StaffRole) => r === "Administrator"
};
const seedStaff: StaffMember[] = [
  { name: "Sokha P.", role: "Administrator", permissions: "Full access", status: "Active" },
  { name: "Mony S.", role: "Cashier", permissions: "POS access", status: "Active" },
  { name: "Dara K.", role: "Manager", permissions: "POS + inventory", status: "Active" }
];

type SaleLine = { name: string; sku: string; price: number; cost: number; qty: number };
type SaleStatus = "Paid" | "Pending" | "Refunded";
type Sale = { id: string; customer: string; date: string; payment: string; status: SaleStatus; discount?: number; lines: SaleLine[]; refundReason?: string; servedBy?: string; createdAt?: string; amountPaid?: number; changeDue?: number; saleTotal?: number };
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
    ["Staff", BriefcaseBusiness], ["Roles & Permissions", ShieldCheck], ["Settings", SettingsIcon]
  ]}
] as const;

const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
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
  const [query, setQuery] = useState("");
  // Start from seed data so the UI renders instantly; real state hydrates from MongoDB below.
  const [sales, setSales] = useState<Sale[]>(seedSales);
  const [catalog, setCatalog] = useState<Product[]>(seedProducts);
  const [staff, setStaff] = useState<StaffMember[]>(seedStaff);
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
      const [pRes, sRes, sfRes, seRes] = await Promise.all([fetch("/api/products?all=1"), fetch("/api/sales"), fetch("/api/staff"), fetch("/api/settings")]);
      if (!pRes.ok || !sRes.ok) throw new Error("API unavailable");
      const [p, s, sf, se] = await Promise.all([pRes.json(), sRes.json(), sfRes.json(), seRes.ok ? seRes.json() : null]);
      if (!mountedRef.current || gen !== refreshGen.current) return;
      setCatalog(p as Product[]);
      setSales(s as Sale[]);
      setStaff(sf as StaffMember[]);
      if (se) setSettings(se as StoreSettings);
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

  const navigate = (label: string) => { setActive(label); setSidebarOpen(false); setQuery(""); };
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
    <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-mark">{settings.name.charAt(0).toUpperCase()}</div><div><strong>{settings.name}</strong><span>POS SYSTEM</span></div><button className="mobile-close" onClick={() => setSidebarOpen(false)}><X size={19}/></button></div>
      <div className="store-wrap">
        <button className="store-switcher" aria-label="Switch store" onClick={() => setStoreOpen(o => !o)}><div className="store-icon"><Store size={17}/></div><div><span>🏪 {settings.name}</span><small>{settings.location} store</small></div><ChevronDown size={15}/></button>
        {storeOpen && <><button className="menu-backdrop" aria-label="Close store menu" onClick={() => setStoreOpen(false)}/><div className="store-menu">
          <p className="store-menu-label">Switch store</p>
          <button className="on" disabled><Store size={14}/> {settings.name} — {settings.location} <span>✓ current</span></button>
          <p className="store-menu-note">Other locations appear here once added.</p>
          {session.role === "Administrator" && <button onClick={() => { setStoreOpen(false); navigate("Settings"); }}><Plus size={14}/> Add store</button>}
        </div></>}
      </div>
      <nav className="nav-list">{navGroups.map(group => <div key={group.title}><p className="nav-label">{group.title}</p>{group.items.map(([label, Icon]) => <button key={label} onClick={() => navigate(label)} className={`nav-item ${active === label ? "nav-active" : ""}`}><Icon size={18}/><span>{label}</span></button>)}</div>)}</nav>
      <div className="sidebar-footer"><div className="help-card"><div className="help-icon">?</div><div><strong>Need help?</strong><span>View documentation</span></div></div><div className="profile-wrap"><div className="profile" role="button" tabIndex={0} aria-label={`View profile for ${session.name}`} onClick={() => setProfileOpen(o => !o)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setProfileOpen(o => !o); } }}><div className="avatar">{session.name.slice(0, 2).toUpperCase()}</div><div><strong>{session.name}</strong><span>{session.role}</span></div><ChevronUp size={14} className={`profile-chevron ${profileOpen ? "open" : ""}`}/></div>{profileOpen && <><button className="menu-backdrop" aria-label="Close profile" onClick={() => setProfileOpen(false)}/><div className="profile-popover" role="dialog" aria-label="Signed-in profile"><div className="profile-popover-head"><div className="avatar">{session.name.slice(0, 2).toUpperCase()}</div><div><strong>{session.name}</strong><span>{session.role}</span></div></div><dl className="profile-facts"><div><dt>Permissions</dt><dd>{me?.permissions ?? "—"}</dd></div><div><dt>Status</dt><dd>{me?.status ?? "Active"}</dd></div><div><dt>Signed in</dt><dd>{signedInAt ? signedInAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—"}</dd></div></dl></div></>}</div><button className="logout-button" aria-label="Sign out" title={`Sign out ${session.name}`} onClick={() => { setSession(null); setProfileOpen(false); fetch("/api/auth/session", { method: "DELETE", credentials: "same-origin" }).catch(() => {}); navigate("Dashboard"); }}><LogOut size={15}/></button></div>
    </aside>
    <section className="content">
      <header className="topbar"><button className="mobile-menu" onClick={() => setSidebarOpen(true)}><Menu size={22}/></button><div className="breadcrumb"><span>Workspace</span><b>/</b><strong>{active}</strong></div><div className="topbar-actions"><div className="search"><Search size={17}/><input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && query.trim()) { e.preventDefault(); const t = query.trim(); if (/^#?inv/i.test(t)) { setOrderSearch(t.replace(/^#/, "")); navigate("Transactions"); } else { navigate("Products"); setQuery(t); } } }} placeholder="Search products, orders..."/><kbd className="search-kbd">Ctrl K</kbd></div><button className="icon-button notification"><Bell size={19}/><i/></button><button className="language">EN <ChevronDown size={14}/></button></div></header>
      <div className="page-content">{dbOnline === false && <p className="offline-banner" role="alert">⚠ Database offline — showing seeded data; changes cannot be saved.</p>}{notice && <p className="offline-banner error-banner" role="alert">{notice}<button className="banner-close" aria-label="Dismiss error" onClick={() => setNotice(null)}><X size={14}/></button></p>}{active === "Dashboard" ? <Dashboard navigate={navigate} sales={sales} catalog={catalog} role={session.role} userName={session.name}/> : active === "POS" || active === "Transactions" || active === "Returns & Refunds" ? <Sales key={active} catalog={catalog} sales={sales} initialTab={active === "POS" ? "pos" : active === "Transactions" ? "history" : "returns"} initialHistoryQuery={orderSearch} onRecord={recordSale} onRefund={refundSale} storeName={settings.name} storeLocation={settings.location} receiptFooter={settings.receiptFooter} currency={settings.currency} role={session.role}/> : active === "Products" || active === "Categories" ? <Products key={active} catalog={catalog} query={query} onQuery={setQuery} initialTab={active === "Categories" ? "categories" : "products"} onUpsert={(p,done)=>upsertProduct(p,done)} onDelete={(sku,done)=>deleteProduct(sku,done)} onAdjust={adjustStock} canManage={CAN.manageProducts(session.role)}/> : active === "Stock" ? <StockPage catalog={catalog} canManage={CAN.manageProducts(session.role)} onAdjust={adjustStock}/> : active === "Cash Register" ? <Finance sales={sales}/> : active === "Reports" ? <Reports sales={sales} catalog={catalog}/> : active === "Settings" ? <SettingsPage settings={settings} canManage={CAN.manageStaff(session.role)} onSave={updateSettings}/> : active === "Staff" ? <StaffPage staff={staff} query={query} onQuery={setQuery} onAdd={(m,pin,done)=>addStaff(m,pin,done)} onUpdate={(n,p,done)=>updateStaff(n,p,done)} onDelete={(n,done)=>deleteStaff(n,done)} canManage={CAN.manageStaff(session.role)}/> : <GenericPage active={active} info={info} query={query} catalog={catalog}/>}</div>
    </section>
  </main>;
}

const canViewMoney = (r: StaffRole) => r === "Manager" || r === "Administrator";

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
  // Trend-chart metric: revenue always, orders, and gross profit (managers+ only).
  const [metric, setMetric] = useState<"revenue" | "orders" | "profit">("revenue");
  const trendValue = (d: { revenue: number; orders: number; profit: number }) => metric === "revenue" ? d.revenue : metric === "orders" ? d.orders : d.profit;
  const metricLabel = metric === "revenue" ? "Revenue" : metric === "orders" ? "Orders" : "Gross profit";

  const DAY = 86_400_000;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const rangeStart = range === "all" ? 0 : todayStart.getTime() - (range === "today" ? 0 : (range as 7 | 30) - 1) * DAY;
  const rangeLabel = range === "today" ? "Today" : range === "all" ? "All time" : `Last ${range} days`;
  const categories = Array.from(new Set(catalog.map(p => p.category))).sort();
  const payments = Array.from(new Set(sales.map(s => s.payment))).sort();
  const cashiers = Array.from(new Set(sales.map(s => s.servedBy).filter((x): x is string => !!x))).sort();

  // Category filtering is applied per line — a mixed-category sale contributes its
  // matching lines to KPIs, charts, and tables alike.
  const inRange = (s: Sale) => range === "all" || (s.createdAt ? new Date(s.createdAt).getTime() >= rangeStart : false);
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

  // ---- Sales trend: daily buckets for day ranges, monthly for all time ----
  const dated = counted.filter(s => s.createdAt);
  const undated = counted.length - dated.length;
  const buckets = new Map<string, { label: string; revenue: number; orders: number; profit: number; sort: number }>();
  for (const s of dated) {
    const t = new Date(s.createdAt as string).getTime();
    const d = new Date(t);
    const key = range === "all" ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : d.toDateString();
    const row = buckets.get(key) ?? { label: "", revenue: 0, orders: 0, profit: 0, sort: t };
    row.revenue += saleTotal(s); row.orders += 1;
    buckets.set(key, row);
  }
  // Honest zero bars for day ranges (only "today" has a single bucket).
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
    const d = new Date(s.createdAt as string).getTime();
    const dd = new Date(d);
    const key = range === "all" ? `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}` : dd.toDateString();
    const saleCost = lineCost(s) * (category === "All categories" ? 1 : keptLines(s).length / Math.max(s.lines.length, 1));
    profitByBucket.set(key, (profitByBucket.get(key) ?? 0) + (saleTotal(s) - saleCost));
  }
  for (const b of trend) {
    const dd = new Date(b.sort);
    const key = range === "all" ? `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}` : dd.toDateString();
    b.profit = Math.round((profitByBucket.get(key) ?? 0) * 100) / 100;
  }
  for (const b of trend) {
    const d = new Date(b.sort);
    b.label = range === "all"
      ? d.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
      : range === 30 ? String(d.getDate()) : range === 7 ? d.toLocaleDateString("en-US", { weekday: "short" }) : d.toLocaleTimeString("en-US", { hour: "numeric" });
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
  const topProducts = Array.from(byProduct.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
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
  const staffRows = Array.from(byStaff.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.sales - a.sales);

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
      <div className="select-wrap"><button className="select-button" onClick={()=>setRangeOpen(o=>!o)}>{rangeLabel} <ChevronDown size={14}/></button>{rangeOpen && <><button className="menu-backdrop" aria-label="Close range menu" onClick={()=>setRangeOpen(false)}/><div className="select-menu">{(["today",7,30,"all"] as ReportRange[]).map(r=><button key={String(r)} className={range===r?"on":""} onClick={()=>{setRange(r);setRangeOpen(false);}}>{r === "today" ? "Today" : r === "all" ? "All time" : `Last ${r} days`}</button>)}</div></>}</div>
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
        <PanelHeader title="Sales trend" sub={`${metricLabel} per ${range === "all" ? "month" : "day"} — ${rangeLabel.toLowerCase()}, refunds excluded`}/>
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
        {sales.length===0 ? <div className="empty">No sales yet.</div> : <DataTable headers={["INVOICE","CUSTOMER","CASHIER","AMOUNT","PAYMENT","TIME","STATUS"]} rows={sales.slice(0,6).map(s=>[s.id,s.customer,s.servedBy??"—",money(saleTotal(s)),s.payment,s.date,s.status])}/>}
      </div>
      <div className="panel">
        <PanelHeader title="Low stock" sub="Products that need attention" action="View inventory" onAction={()=>navigate("Stock")}/>
        {catalog.filter(p=>p.stock<10).length===0 ? <div className="empty">All products are well stocked.</div> : <div className="stock-list">{catalog.filter(p=>p.stock<10).sort((a,b)=>a.stock-b.stock).slice(0,6).map(p=>
          <div className="stock-item" key={p.sku}><div className="product-placeholder"><Package size={18}/></div><div className="stock-name"><strong>{p.name}</strong><span>{p.sku}</span></div><div className="stock-count"><strong className={p.stock===0?"critical":""}>{p.stock} units</strong><span className={`status ${p.stock===0?"refunded":"pending"}`}>{p.stock===0?"OUT OF STOCK":"LOW STOCK"}</span></div></div>)}</div>}
        <button className="outline-button" onClick={()=>navigate("Stock")}>View inventory <ArrowUpRight size={15}/></button>
      </div>
    </section>

    <section className="dashboard-grid">
      <div className="panel table-panel">
        <PanelHeader title="Top products" sub="Best sellers in the current view" action="View all" onAction={()=>navigate("Reports")}/>
        {topProducts.length===0 ? <div className="empty">No sales in this range.</div> : <DataTable headers={["PRODUCT","UNITS","REVENUE"]} rows={topProducts.map(r=>[r.name,String(r.qty),money(r.revenue)])}/>}
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

function Products({ catalog, query, onQuery, onUpsert, onDelete, onAdjust, canManage, initialTab }: { catalog: Product[]; query: string; onQuery: (q: string) => void; onUpsert: (p: Product, done?: (ok: boolean) => void) => void; onDelete: (sku: string, done?: (ok: boolean) => void) => void; onAdjust: (sku: string, delta: number) => void; canManage: boolean; initialTab?: ProductsTab }) {
  const [tab, setTab] = useState<ProductsTab>(initialTab ?? "products");
  const [catOpen, setCatOpen] = useState(false);
  const [category, setCategory] = useState("All categories");
  const [editing, setEditing] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);
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

  return <><PageHeading title={pageInfo[initialTab === "categories" ? "Categories" : "Products"].title} sub={pageInfo[initialTab === "categories" ? "Categories" : "Products"].subtitle} action={initialTab === "categories" ? undefined : (canManage ? "Add product" : undefined)} onAction={()=>{setBanner(null);setAdding(true);}}/>
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
      <td><span className={`status ${p.stock===0?"refunded":p.stock<10?"pending":"paid"}`}>{p.stock===0?"Out of stock":p.stock<10?"Low stock":"In stock"}</span></td>
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
function StockPage({ catalog, canManage, onAdjust }: { catalog: Product[]; canManage: boolean; onAdjust: (sku: string, delta: number) => void }) {
  const [done, setDone] = useState<string | null>(null);
  const stockStatus = (stock: number) => stock === 0 ? ["Out of stock", "refunded"] as const : stock < 10 ? ["Low stock", "pending"] as const : ["Healthy", "paid"] as const;
  return <>
    <PageHeading title={pageInfo["Stock"].title} sub={pageInfo["Stock"].subtitle}/>
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

type SalesTab = "pos" | "history" | "returns";

function Sales({ catalog, sales, onRecord, onRefund, storeName, storeLocation, receiptFooter, currency, role, initialTab, initialHistoryQuery }: { catalog: Product[]; sales: Sale[]; onRecord: (lines: SaleLine[], payment: SalePayment, done?: (ok: boolean, sale?: Sale) => void) => void; onRefund: (id: string, reason: string, done?: (ok: boolean) => void) => void; storeName: string; storeLocation: string; receiptFooter: string; currency: string; role: StaffRole; initialTab: SalesTab; initialHistoryQuery?: string }) {
  const [tab, setTab] = useState<SalesTab>(initialTab);
  const [cardsView, setCardsView] = useState(false);
  const [historyQuery, setHistoryQuery] = useState(initialHistoryQuery ?? "");
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
  const historyMatches = sales.filter(s => `${s.id} ${s.customer}`.toLowerCase().includes(historyQuery.toLowerCase()));
  const refunds = sales.filter(s => s.status === "Refunded");
  const switchTab = (t: SalesTab) => { setTab(t); setRefundDone(null); };
  const startRefund = (s: Sale) => { setViewing(null); setRefundNote(""); setRefundDone(null); setRefunding(s); };
  const confirmRefund = () => { if (!refunding || busyRef.current) return; busyRef.current = true; const target = refunding; setBusy(true); onRefund(target.id, refundNote, ok => { busyRef.current = false; setBusy(false); if (ok) setRefundDone(target.id); setRefunding(null); }); };
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

  return <><PageHeading title={pageInfo[tab === "pos" ? "POS" : tab === "history" ? "Transactions" : "Returns & Refunds"].title} sub={pageInfo[tab === "pos" ? "POS" : tab === "history" ? "Transactions" : "Returns & Refunds"].subtitle}/>
  {refundDone && <p className="checkout-success success-banner" role="status">Refund for {refundDone} recorded successfully.</p>}
  {tab==="pos" && <div className="pos-layout"><div className="panel product-picker"><div className="toolbar"><h2>Choose products</h2><div className="filter"><Search size={15}/><input value={productQuery} onChange={e=>setProductQuery(e.target.value)} placeholder="Search products"/></div></div><div className="picker-grid">{visibleProducts.map(p=>{const inCart=cart.find(l=>l.sku===p.sku)?.qty??0;const left=p.stock-inCart;return <button key={p.sku} className="picker-card" disabled={left<=0} onClick={()=>{setJustCheckedOut(null);setCart(c=>c.some(l=>l.sku===p.sku)?c.map(l=>l.sku===p.sku?{...l,qty:l.qty+1}:l):[...c,toLine(p)]);}}><div className="picker-thumb">{p.image?<img src={p.image} alt=""/>:<div className="product-placeholder"><Package size={20}/></div>}</div><strong>{p.name}</strong><span>{money(p.price)} · {left<=0?"none left":"in stock: "+left}</span></button>;})}{visibleProducts.length===0&&<div className="empty">No products match your search.</div>}</div></div><div className="panel cart-panel"><div className="panel-header"><h2>Current sale</h2><span className="status paid">{cart.reduce((n,l)=>n+l.qty,0)} items</span></div>{cart.length===0?<div className="empty">Your cart is empty</div>:<div className="cart-lines">{cart.map((l,i)=><div className="cart-line" key={l.sku}><div><strong>{l.name}</strong><span>{money(l.price)} × {l.qty}</span></div><button aria-label={`Remove ${l.name}`} onClick={()=>setCart(c=>c.filter((_,idx)=>idx!==i))}><X size={14}/></button></div>)}</div>}<div className="cart-total"><span>Subtotal</span><strong>{money(total)}</strong></div>{justCheckedOut&&<p className="checkout-success" role="status">Sale {justCheckedOut.id} recorded.{justCheckedOut.changeDue ? ` Change due ${money(justCheckedOut.changeDue)}.` : ""}</p>}<button className="primary-button checkout" disabled={cart.length===0||busy} onClick={openPayment}>{busy ? "Charging…" : `Charge ${money(total)}`}</button></div></div>}
  {tab==="history" && <div className="panel table-panel"><div className="toolbar"><strong>{historyQuery ? `${historyMatches.length} of ${sales.length} sales` : `${sales.length} sales`}</strong><div className="filter"><Search size={15}/><input placeholder="Search invoice or customer" value={historyQuery} onChange={e=>setHistoryQuery(e.target.value)}/>{historyQuery&&<button className="filter-clear" aria-label="Clear sales search" onClick={()=>setHistoryQuery("")}><X size={13}/></button>}</div><button className="outline-button" onClick={()=>setCardsView(v=>!v)}>{cardsView?"Table view":"Card view"}</button></div>{historyMatches.length===0?<div className="empty">No sales match your search.</div>:cardsView?<div className="receipts-grid">{historyMatches.map(s=><div className="panel receipt-card" key={s.id}><div className="receipt-card-head"><strong>{s.id}</strong><span className={`status ${statusClass(s.status)}`}>{s.status}</span></div><p>{s.customer} · {s.date}</p><div className="receipt-card-total"><span>{itemCount(s)} items</span><strong>{money(saleTotal(s))}</strong></div><button className="outline-button" onClick={()=>setViewing(s)}>View receipt</button></div>)}</div>:<SalesTable sales={historyMatches} onView={setViewing} onRefund={startRefund}/>}</div>}
  {tab==="returns" && <><div className="panel table-panel"><div className="toolbar"><strong>Refundable sales</strong><div className="filter"><Search size={15}/><input placeholder="Search sales" readOnly/></div><button className="select-button">All payments <ChevronDown size={14}/></button></div>{refundable.length===0?<div className="empty">Nothing left to refund.</div>:<SalesTable sales={refundable} onView={setViewing} onRefund={startRefund}/>}</div><div className="panel table-panel"><div className="toolbar"><strong>{refunds.length} refunds</strong></div>{refunds.length===0?<div className="empty">No refunds yet.</div>:<DataTable headers={["INVOICE","CUSTOMER","DATE","REFUNDED","REASON","STATUS"]} rows={refunds.map(s=>[s.id,s.customer,s.date,money(saleTotal(s)),s.refundReason||"—","Refunded"])}/>}</div></>}
  {viewing && <ReceiptModal sale={viewing} onClose={()=>setViewing(null)} onRefund={startRefund} storeName={storeName} storeLocation={storeLocation} receiptFooter={receiptFooter} currency={currency}/>}
  {paying && <PaymentModal total={total} itemCount={cart.reduce((n,l)=>n+l.qty,0)} currency={currency} role={role} busy={busy} onClose={()=>setPaying(false)} onConfirm={doCheckout}/>}
  {refunding && <div className="modal-backdrop" onClick={()=>setRefunding(null)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-header"><h2>Refund {refunding.id}</h2><button aria-label="Close refund dialog" onClick={()=>setRefunding(null)}><X size={18}/></button></div><p className="refund-summary">Refunding <strong>{money(saleTotal(refunding))}</strong> ({itemCount(refunding)} items) from <strong>{refunding.customer}</strong> back via {refunding.payment}.</p><label>Reason<textarea autoFocus placeholder="e.g. Damaged goods, customer changed their mind" value={refundNote} onChange={e=>setRefundNote(e.target.value)}/></label><div className="modal-actions"><button className="outline-button" onClick={()=>setRefunding(null)}>Cancel</button><button className="primary-button" disabled={busy} onClick={confirmRefund}>{busy ? "Refunding…" : `Confirm refund ${money(saleTotal(refunding))}`}</button></div></div></div>}</>;
}

function SalesTable({ sales, onView, onRefund }: { sales: Sale[]; onView: (s: Sale) => void; onRefund: (s: Sale) => void }) {
  return <div className="table-wrap"><table><thead><tr>{["INVOICE","CUSTOMER","DATE","PAYMENT","AMOUNT","STATUS",""].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{sales.map(s=><tr key={s.id}><td><strong>{s.id}</strong></td><td>{s.customer}</td><td>{s.date}</td><td>{s.payment}</td><td>{money(saleTotal(s))}</td><td><span className={`status ${statusClass(s.status)}`}>{s.status}</span></td><td><div className="row-actions"><button className="text-button" onClick={()=>onView(s)}>Receipt</button>{s.status!=="Refunded"&&<button className="text-button danger" onClick={()=>onRefund(s)}>Refund</button>}</div></td></tr>)}</tbody></table></div>;
}

/** Checkout confirmation: payment method, customer, discount (managers+), cash handling — then record. */
function PaymentModal({ total, itemCount, currency, role, busy, onClose, onConfirm }: { total: number; itemCount: number; currency: string; role: StaffRole; busy: boolean; onClose: () => void; onConfirm: (p: SalePayment) => void }) {
  const METHODS = ["Cash", "ABA Pay", "Credit"] as const;
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
  return <div className="modal-backdrop" onClick={onClose}><div className="modal receipt-modal" onClick={e=>e.stopPropagation()}><div className="modal-header"><h2>Receipt {sale.id}</h2><button aria-label="Close receipt" onClick={onClose}><X size={18}/></button></div><p className="receipt-store"><strong>{storeName}</strong>{storeLocation&&` · ${storeLocation}`}</p><p className="receipt-meta">{sale.customer} · {sale.date} · Paid by {sale.payment}{sale.servedBy ? ` · Served by ${sale.servedBy}` : ""}</p><div className="receipt-lines">{sale.lines.map(l=><div className="receipt-line" key={l.sku}><span>{l.name} <em>× {l.qty}</em></span><strong>{cur(l.price*l.qty)}</strong></div>)}</div>{(sale.discount??0)>0&&<div className="receipt-payline"><span>Discount</span><strong>-{cur(sale.discount as number).slice(1)}</strong></div>}<div className="receipt-total"><span>Total</span><strong>{cur(saleTotal(sale))}</strong></div>{sale.amountPaid!==undefined&&<div className="receipt-payline"><span>Paid by {sale.payment}</span><strong>{cur(sale.amountPaid)}</strong></div>}{sale.changeDue!==undefined&&sale.changeDue>0&&<div className="receipt-payline change"><span>Change due</span><strong>{cur(sale.changeDue)}</strong></div>}<p className="receipt-status">Status: <span className={`status ${statusClass(sale.status)}`}>{sale.status}</span>{sale.status==="Refunded"&&<em> · {sale.refundReason}</em>}</p>{receiptFooter&&<p className="receipt-footer">{receiptFooter}</p>}<div className="modal-actions"><button className="outline-button" onClick={()=>window.print()}><Printer size={15}/>Print</button><button className="outline-button" onClick={onClose}>Close</button>{sale.status!=="Refunded"&&<button className="primary-button" onClick={()=>onRefund(sale)}>Process refund</button>}</div></div></div>;
}

const ROLES = ["Administrator", "Manager", "Cashier"] as const;
const PERMS = ["Full access", "POS + inventory", "POS access"] as const;

function StaffPage({ staff, query, onQuery, onAdd, onUpdate, onDelete, canManage }: { staff: StaffMember[]; query: string; onQuery: (q: string) => void; onAdd: (m: StaffMember, pin: string, done?: (ok: boolean) => void) => void; onUpdate: (name: string, patch: Partial<StaffMember> & { pin?: string }, done?: (ok: boolean) => void) => void; onDelete: (name: string, done?: (ok: boolean) => void) => void; canManage: boolean }) {
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
      <td><strong>{m.name}</strong></td><td>{m.role}</td><td>{m.permissions}</td><td><span className={`status ${m.status==="Inactive"?"refunded":m.role==="Administrator"?"":m.status==="Active"?"paid":"pending"}`}>{m.status}</span>{m.role==="Administrator"&&<em className="you-chip"> · you</em>}</td>
      <td><div className="row-actions">{canManage ? [<button key="e" className="text-button" onClick={()=>{setBanner(null);setEditing(m);}}>Edit</button>, m.role!=="Administrator" ? <button key="d" className="text-button danger" onClick={()=>{setBanner(null);setDeleting(m);}}>Delete</button> : null] : <span className="you-chip">view only</span>}</div></td>
    </tr>)}</tbody></table></div>}</div>
    {adding && <StaffFormModal onClose={()=>setAdding(false)} onSave={(m,pin,done)=>{onAdd(m,pin,ok=>{if(ok)setBanner(`${m.name} added to the team.`);done(ok);});}}/>}
    {editing && <StaffFormModal initial={editing} onClose={()=>setEditing(null)} onSave={(m,pin,done)=>{onUpdate(editing.name,{role:m.role,permissions:m.permissions,...(pin?{pin}:{})},ok=>{if(ok)setBanner(`${m.name} updated.`);done(ok);});}}/>}
    {deleting && <div className="modal-backdrop" onClick={()=>setDeleting(null)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-header"><h2>Remove staff member</h2><button aria-label="Close remove dialog" onClick={()=>setDeleting(null)}><X size={18}/></button></div><p className="refund-summary">Remove <strong>{deleting.name}</strong> ({deleting.role}) from the team? This cannot be undone.</p><div className="modal-actions"><button className="outline-button" onClick={()=>setDeleting(null)}>Cancel</button><button className="primary-button danger-button" onClick={()=>{onDelete(deleting.name,ok=>{if(ok)setBanner(`${deleting.name} removed.`);});setDeleting(null);}}>Remove member</button></div></div></div>}
  </>;
}

function StaffFormModal({ initial, onClose, onSave }: { initial?: StaffMember; onClose: () => void; onSave: (m: StaffMember, pin: string, done: (ok: boolean) => void) => void }) {
  const [form, setForm] = useState({ name: initial?.name ?? "", role: (initial?.role ?? "Cashier") as StaffRole, permissions: initial?.permissions ?? "POS access", pin: "" });
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const name = form.name.trim();
    const pin = form.pin.trim();
    if (!name) return setError("Staff name is required.");
    if (name.length > 80) return setError("Staff name is too long (max 80 characters).");
    if (!/\d{4,6}/.test(pin)) return setError("PIN must be 4–6 digits.");
    onSave({ name, role: form.role, permissions: form.permissions, status: "Active" }, pin, ok => { if (ok) onClose(); else setError("Could not save this staff member — see the message at the top of the page."); });
  };
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => { setForm({ ...form, [k]: e.target.value }); setError(null); };
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-header"><h2>{initial ? "Edit staff member" : "Add staff"}</h2><button aria-label="Close staff form" onClick={onClose}><X size={18}/></button></div><div className="form-grid"><label>Name<input autoFocus placeholder="e.g. Chan L." value={form.name} onChange={set("name")}/></label><label>Login PIN (4–6 digits)<input type="password" inputMode="numeric" maxLength={6} placeholder={initial ? "Leave blank to keep current PIN" : "e.g. 4321"} value={form.pin} onChange={set("pin")}/></label><label>Role<select value={form.role} onChange={set("role")}>{ROLES.map(r=><option key={r} value={r}>{r}</option>)}</select></label><label>Permissions<select value={form.permissions} onChange={set("permissions")}>{PERMS.map(p=><option key={p} value={p}>{p}</option>)}</select></label></div>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button className="outline-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={submit}>{initial ? "Save changes" : "Add staff member"}</button></div></div></div>;
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
type ReportRange = "today" | 7 | 30 | "all";

function Reports({ sales, catalog }: { sales: Sale[]; catalog: Product[] }) {
  const [tab, setTab] = useState<ReportsTab>("products");
  const [productQuery, setProductQuery] = useState("");
  const [range, setRange] = useState<ReportRange>(30);
  const [rangeOpen, setRangeOpen] = useState(false);

  const DAY = 86_400_000;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const rangeStart = range === "all" ? 0 : todayStart.getTime() - ((range as 7 | 30) - 1) * DAY;
  const tsOf = (s: Sale) => s.createdAt ? new Date(s.createdAt).getTime() : NaN;
  const inRange = (s: Sale) => range === "all" || (Number.isFinite(tsOf(s)) && tsOf(s) >= rangeStart);
  const rangeLabel = range === "all" ? "all time" : `last ${range} days`;

  // Money on refunds goes out the door, so refunds are subtracted from revenue and
  // never counted as orders; refunded sale lines stay out of product rankings.
  const counted = sales.filter(s => s.status !== "Refunded" && inRange(s));
  const revenue = counted.reduce((sum, s) => sum + saleTotal(s), 0);
  const orders = counted.length;
  const unitsSold = counted.reduce((n, s) => n + itemCount(s), 0);
  const refunds = sales.filter(s => s.status === "Refunded" && inRange(s));
  const refundAmount = refunds.reduce((sum, s) => sum + saleTotal(s), 0);
  const refundRate = orders + refunds.length > 0 ? Math.round((refunds.length / (orders + refunds.length)) * 1000) / 10 : 0;

  // Daily buckets for day ranges; monthly buckets when viewing all time.
  const dated = counted.filter(s => Number.isFinite(tsOf(s)));
  const undated = counted.length - dated.length;
  const buckets = new Map<string, { label: string; revenue: number; sort: number }>();
  for (const s of dated) {
    const d = new Date(tsOf(s));
    const key = range === "all" ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : d.toDateString();
    const label = range === "all"
      ? d.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
      : range === 7 ? d.toLocaleDateString("en-US", { weekday: "short" }) : String(d.getDate());
    const row = buckets.get(key) ?? { label, revenue: 0, sort: tsOf(s) };
    row.revenue += saleTotal(s);
    buckets.set(key, row);
  }
  // Fill the empty days so the chart shows honest gaps.
  if (range !== "all") {
    for (let i = 0; i < (range as 7 | 30); i++) {
      const d = new Date(todayStart.getTime() - ((range as 7 | 30) - 1 - i) * DAY);
      const key = d.toDateString();
      if (!buckets.has(key)) buckets.set(key, { label: range === 7 ? d.toLocaleDateString("en-US", { weekday: "short" }) : String(d.getDate()), revenue: 0, sort: d.getTime() });
    }
  }
  const week = Array.from(buckets.values()).sort((a, b) => a.sort - b.sort);
  const labelEvery = week.length > 16 ? 5 : 1;
  const maxRevenue = Math.max(...week.map(d => d.revenue), 1);

  const byProduct = new Map<string, { name: string; sku: string; qty: number; revenue: number }>();
  for (const s of counted) for (const l of s.lines) {
    const row = byProduct.get(l.sku) ?? { name: l.name, sku: l.sku, qty: 0, revenue: 0 };
    row.qty += l.qty; row.revenue += l.qty * l.price;
    byProduct.set(l.sku, row);
  }
  const productRows = Array.from(byProduct.values()).sort((a, b) => b.revenue - a.revenue);
  const filteredProducts = productRows.filter(r => `${r.name} ${r.sku}`.toLowerCase().includes(productQuery.toLowerCase()));

  const inventoryValue = catalog.reduce((sum, p) => sum + p.price * p.stock, 0);
  const unitsInStock = catalog.reduce((n, p) => n + p.stock, 0);
  const stockStatus = (stock: number) => stock === 0 ? ["Out of stock", "refunded"] as const : stock < 10 ? ["Low stock", "pending"] as const : ["Healthy", "paid"] as const;

  return <><PageHeading title="Reports" sub="Understand your store performance"/>
    <div className="subnav">
      <button className={`tab ${tab==="products"?"active":""}`} onClick={()=>setTab("products")}>Product performance</button>
      <button className={`tab ${tab==="inventory"?"active":""}`} onClick={()=>setTab("inventory")}>Inventory health</button>
      <div className="select-wrap range-wrap"><button className="select-button" onClick={()=>setRangeOpen(o=>!o)}>{range === "all" ? "All time" : `Last ${range} days`} <ChevronDown size={14}/></button>{rangeOpen && <><button className="menu-backdrop" aria-label="Close range menu" onClick={()=>setRangeOpen(false)}/><div className="select-menu">{([7,30,"all"] as ReportRange[]).map(r=><button key={String(r)} className={range===r?"on":""} onClick={()=>{setRange(r);setRangeOpen(false);}}>{r === "all" ? "All time" : `Last ${r} days`}</button>)}</div></>}</div>
    </div>
    {tab==="products" && <div className="panel table-panel"><div className="toolbar"><strong>{productQuery?`${filteredProducts.length} of ${productRows.length} products`:`${productRows.length} products sold · ${rangeLabel}`}</strong><div className="filter"><Search size={15}/><input placeholder="Search product or SKU" value={productQuery} onChange={e=>setProductQuery(e.target.value)}/>{productQuery&&<button className="filter-clear" aria-label="Clear product search" onClick={()=>setProductQuery("")}><X size={13}/></button>}</div></div>
      {filteredProducts.length===0?<div className="empty">No products match your search.</div>:<DataTable headers={["PRODUCT","SKU","UNITS SOLD","REVENUE"]} rows={filteredProducts.map(r=>[r.name,r.sku,String(r.qty),money(r.revenue)])}/>}
    </div>}
    {tab==="inventory" && <>
      <section className="stats-grid">
        <Stat label="Inventory value" value={money(inventoryValue)} change={`${catalog.length} products`} icon={Package} tone="blue"/>
        <Stat label="Units in stock" value={String(unitsInStock)} change="across catalog" icon={Box} tone="purple"/>
        <Stat label="Low stock" value={String(catalog.filter(p=>p.stock>0&&p.stock<10).length)} change="under 10 units" icon={Tag} tone="orange" negative/>
        <Stat label="Out of stock" value={String(catalog.filter(p=>p.stock===0).length)} change="needs restock" icon={ArrowDownRight} tone="orange" negative={catalog.some(p=>p.stock===0)}/>
      </section>
      <div className="panel table-panel"><div className="toolbar"><strong>Stock levels</strong></div>
        <DataTable headers={["PRODUCT","SKU","PRICE","STOCK","STATUS"]} rows={catalog.map(p=>{const [label,tone]=stockStatus(p.stock);return [p.name,p.sku,money(p.price),`${p.stock} units`,label];}).map((row)=>row)}/>
      </div>
    </>}
  </>;
}

/** Cash Register page: the Finance overview — income, refunds, net, pending, and the transaction ledger. */
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
  const inventoryRows: string[][] = catalog.map(p=>[p.name,p.sku,p.category,String(p.stock),p.stock===0?"Out of stock":p.stock<10?"Low stock":"In stock"]);
  const data: Record<string,string[][]> = { Purchases:[["PO-2048","Fresh Foods Co.","Today","$1,240.00","Received"],["PO-2047","Mega Distribution","Yesterday","$860.00","Pending"]], Inventory:inventoryRows, Customers:[["Sokha Trading","sokha@example.com","12 orders","$2,840.00","Active"],["Dara Market","dara@example.com","8 orders","$1,420.50","Active"]], Suppliers:[["Fresh Foods Co.","+855 12 555 019","Groceries","Active"],["Mega Distribution","+855 11 302 904","General","Active"]], Finance:[["Sales revenue","Today","Income","$4,286.50","Completed"],["Store rent","Sep 20","Expense","-$650.00","Paid"]]}; const rows=data[active]||[["Store profile","Main Store","Phnom Penh","Open"],["Tax settings","VAT 10%","Default","Configured"]]; return <><PageHeading title={info?.title||active} sub={info?.subtitle||""}/><div className="panel table-panel"><div className="toolbar"><strong>{query ? `Results for “${query}”` : "Overview"}</strong><div className="filter"><Search size={15}/><input placeholder={`Search ${active.toLowerCase()}`}/></div><button className="select-button">Filter <ChevronDown size={14}/></button></div><DataTable headers={["NAME","DETAIL","TYPE","AMOUNT","STATUS"]} rows={rows}/></div><div className="quick-grid"><div className="panel mini-card"><Tag size={18}/><strong>Quick actions</strong><span>Export data · Print report · Manage permissions</span></div><div className="panel mini-card"><Building2 size={18}/><strong>Need a hand?</strong><span>Visit our documentation for setup guides.</span></div></div></>;
}

function PageHeading({title,sub,action,onAction}:{title:string;sub:string;action?:string;onAction?:()=>void}) { return <div className="page-heading"><div><p className="eyebrow">WORKSPACE</p><h1>{title}</h1><p className="subtitle">{sub}</p></div>{action&&<button className="primary-button" onClick={onAction}><Plus size={18}/>{action}</button>}</div>; }
function PanelHeader({title,sub,action,onAction}:{title:string;sub?:string;action?:string;onAction?:()=>void}) { return <div className="panel-header"><div><h2>{title}</h2>{sub&&<p>{sub}</p>}</div>{action&&<button className="text-button" onClick={onAction}>{action}</button>}</div>; }
function Stat({label,value,change,icon:Icon,tone,negative,caption}:{label:string;value:string;change:string;icon:typeof ArrowUpRight;tone:string;negative?:boolean;caption?:string}) { return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={20}/></div><div className="stat-body"><span>{label}</span><strong>{value}</strong><small className={`change ${negative?"negative":""}`}>{negative?<ArrowDownRight size={12}/>:<ArrowUpRight size={12}/>} {change}<em>{caption ?? "vs last week"}</em></small></div></div>; }
function DataTable({headers,rows}:{headers:string[];rows:string[][]}) { return <div className="table-wrap"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{j===0?<strong>{cell}</strong>:j===row.length-1?<span className={`status ${cell.toLowerCase().includes("refund")||cell.toLowerCase().includes("out")?"refunded":cell.toLowerCase().includes("pending")||cell.toLowerCase().includes("low")?"pending":"paid"}`}>{cell}</span>:cell}</td>)}</tr>)}</tbody></table></div>; }
