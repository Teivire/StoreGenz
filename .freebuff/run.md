# StoreGenz POS — Run Doc

## Reproduce uncommitted artifacts
- Copy `.env.local` from the main checkout (`C:\Users\PT\Desktop\online-store\StoreGenz\.env.local`) into the worktree root. It holds `MONGODB_URI=mongodb://127.0.0.1:27017/storegenz` — the database must be reachable (local `mongod` on 27017, or an Atlas URI in the main checkout).
- Install dependencies with the project's package manager (npm):
  ```
  npm install
  ```
- No build artifacts are needed for dev mode (`npm run dev` compiles on the fly). For production: `npm run build`.
- Create the database structure explicitly (idempotent; `--seed` also fills empty collections):
  ```
  npm run init-db -- --seed
  ```
  Creates `storegenz` with `products`, `sales`, `sessions`, `settings`, and `staff` collections, `$jsonSchema` validators, and indexes (`products.category_1`, `sales.createdAt_-1`, `sales.status_1_createdAt_-1`, `sales.servedBy_1_createdAt_-1`, `sales.lines.sku_1`). Running the app without this also works — `ensureSeeded()` creates the same structure on first API use — but the script is the versioned source of truth for the schema.
- Connection tuning lives in `lib/db.ts`: `maxPoolSize 20 / minPoolSize 5`, `serverSelectionTimeoutMS 4000`, `connectTimeoutMS 8000`, `socketTimeoutMS 30000`, `retryWrites: true`. One cached `MongoClient` per process; seeding and legacy-data migrations run once per process (memoized promise), so steady-state API calls do no schema work. If Mongo is down, writes surface a 503 with "Database offline" and reads fall back to in-memory data with a warning banner.
- Backups (JSON exports of every collection into `backups/`, no mongodump needed):
  - **Automatic**: on server boot, `instrumentation.ts` writes `backups/<timestamp>-storegenz.json` if the newest backup is older than 24 hours (best-effort, never blocks startup).
  - **Scheduled (Windows)**: a Task Scheduler job "StoreGenz daily backup" runs `npm run backup` daily at 02:00. Register it on a new machine with `powershell -ExecutionPolicy Bypass -File scripts\register-backup-task.ps1`; inspect with `Get-ScheduledTaskInfo -TaskName 'StoreGenz daily backup'`.
  - **Manual**: `npm run backup` — writes a timestamped file and prints a one-line summary.
  - **Restore**: `npm run restore -- backups/<file>.json --yes` (refuses without `--yes`; set `RESTORE_DB=<name>` to restore into a scratch database for testing).
  - **Retention**: every backup prunes `backups/` to the 30 newest files.
- Module APIs beyond products/sales: `/api/categories` (list/create; PATCH+DELETE at `/api/categories/<id>` — rename cascades to products, reparenting is cycle-checked, delete blocked while products/children reference it), `/api/movements` (stock-movement ledger, newest first, `?sku=` / `?reason=` / `?limit=`), `/api/expenses` (list/create, manager+; categories: Rent/Utilities/Supplies/Salaries/Marketing/Maintenance/Transport/Other), and `/api/purchases` (list/create POs; PATCH at `/api/purchases/<id>` with `{action:"receive"|"return"}` — receiving increments stock and snapshots unit cost onto the product, returning requires the stock to still cover it; both write `purchase`/`purchase-return` movement-ledger entries), `/api/suppliers` (list/create; PATCH+DELETE at `/api/suppliers/<id>` — name-unique, delete blocked while POs reference the name; seeded once from PO history), and `/api/supplier-payments` (GET: per-supplier statements — ordered value from non-returned POs minus payments; POST: record a payment, manager-gated, `SPP-n` ids). Customers: `/api/customers` (list/create; PATCH+DELETE at `/api/customers/<id>` — name-unique, delete blocked while sales reference the name; seeded once from sales history with loyalty points = floor of paid sale totals) and `/api/customer-payments` (GET: per-customer statements — credit owed (Pending credit sales) minus payments received, plus live loyalty points; POST: record a payment, manager-gated, `CSP-n` ids). Credit sales POST as `Pending` (not income) until collected here. The ledger records every stock change (adjustment via product PATCH `stockDelta`, sale lines out, refunds back in, PO receive/return) plus a `seed` entry per product at bootstrap so Stock Count's ledger-net reconciles to current stock. Stock transfers: `/api/transfers` (GET history, POST record — manager-gated) writes a `stock_transfers` record plus paired `transfer-out`/`transfer-in` ledger entries; total stock is unchanged by design (units move between locations). The verify suites remove their scratch sales' movement entries on cleanup so the ledger keeps reconciling.
- Suppliers module UI: sidebar **Suppliers** → 5 tabs (All Suppliers, Add Supplier, Supplier Groups, Supplier Payments, Supplier Statements); Purchases → Supplier Payments is the same real view (no longer a placeholder); Reports → Supplier Summary/Balance/Payments compute from statements.
- Customers module UI: sidebar **Customers** → 6 tabs (All Customers, Add Customer, Customer Groups, Customer Payments, Customer Statements, Loyalty / Points with Gold ≥500 / Silver ≥100 tiers); Reports → Loyalty Points reads the same data.
- Concurrency regression check (dev server must be running): `npm run verify-concurrency` — races the sales/refund endpoints with a scratch product and asserts the money invariants (distinct invoice numbers under concurrent checkout, exact stock decrement, single-winner refunds, single restock). Cleans up after itself; exits non-zero on any broken invariant.
- API contract suite (dev server must be running): `npm run verify-api` — 41 table-driven cases: cookie sessions (login/whoami/logout/deactivation cutoff), header login, sale validation, payment form, discounts (reject/clamp/apply), line-cost snapshots, stock boundary, refund lifecycle, role gating, sales pagination/search envelope. Cleans up after itself.
- Expenses hub: sidebar **Expenses** → 5 tabs (All Expenses, Add Expense, Expense Categories, Recurring Expenses, Expense Reports with 6-month trend). Recurring templates (`/api/recurring-expenses` GET/POST/PATCH, manager+; PUT runs generation): weekly/monthly frequency, catch-up generation on boot via instrumentation (idempotent — each occurrence becomes a real EXP tagged `recurringId`, nextRun advances; pause/resume/delete supported). Reports → Finance → Expenses reads the same ledger.
- Payments hub: sidebar **Payments** → 6 tabs. All Payments merges Paid sales, refunds, and customer/supplier payment totals into one in/out ledger; Refunds lists real refunds; **Payment Methods** is admin-editable via `PATCH /api/settings` with `{paymentMethods:[{name,enabled}]}` (stored on the settings doc, validator-extended; Cash must stay enabled, ≥1 enabled, no duplicates — the POS charge dialog reads this list live via the settings fetch — verified: disabling Credit removes it from the checkout modal). Payment Settings documents the credit/cash/currency policy.
- Cash Register: sidebar **Cash Register** → 7 tabs (Overview, Open, Current Shift, Cash In/Out, Close, History, Settings). Shifts live in `register_shifts` (a unique partial index on open shifts enforces one-at-a-time at the DB level); drawer adjustments in `cash_movements`. Expected drawer cash is **recomputed server-side** from real cash sales/refunds/movements within the shift window (sales dated by `createdAt`, refunds by `refundedAt` — the refund route now stamps it, so cross-shift refunds land in the closing shift). Close records counted cash + variance. Register defaults (opening float, variance alert) ride the settings PATCH, admin-gated.
- Auth: browser mutations authenticate via an HttpOnly `pos_session` cookie (`sessions` collection, 30-day TTL); scripts/tests may still use the `X-Staff-Name`/`X-Staff-Pin` headers. Deactivating a staff member kills their sessions instantly.

## Run the server
```
npm run dev
```
- Next.js 14 defaults to port **3000** if free; otherwise it picks a random free port — read the actual port from the startup log ("Local: http://localhost:XXXX").
- Env: `MONGODB_URI` from `.env.local`. If Mongo is down the app still boots (seeded data + "Database offline" banner; unsaved changes roll back with an error banner).
- Start detached on Windows (stdout and stderr must go to different files):
  ```
  powershell -NoProfile -Command "(Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -RedirectStandardOutput '<log>' -RedirectStandardError '<log>.err' -WindowStyle Hidden -PassThru).Id"
  ```
  Note: this can print the pid but not return within the caller's timeout — check the log file for "Ready" and `netstat` for the listener instead of assuming failure.

## Health check
- `curl http://localhost:<port>/api/products` → paginated envelope `{ items, total, page, limit, pages }` (default limit 10, max 100).
  - `?q=cola` — server-side literal-substring search over name/sku/category (user input is regex-escaped)
  - `?category=Groceries` — exact category filter (indexed)
  - `?page=2&limit=2` — paging; out-of-range pages clamp to the last page
  - `?all=1` — legacy full-array mode (used by the app's hydration and catalog-wide consumers)
- `curl "http://localhost:<port>/api/sales?page=1&limit=25"` → paginated envelope `{ items, total, page, limit, pages }`; `?q=` searches invoice id / customer / cashier server-side (indexed-backed sort `createdAt -1`); `?all=1` keeps the legacy full-array mode for client-side analytics (Dashboard/Reports). Default page size 25, max 200.
- `curl http://localhost:<port>/` → 200.
- POS integrity (verified behaviors): checkout atomically decrements per-product stock (oversell → 409, no partial apply); refund restocks the items and is single-shot (double refund → 409).
- `curl http://localhost:<port>/api/staff` → list of staff (`{ name, role, permissions, status }`; roles: Administrator/Manager/Cashier). `POST` creates (duplicate name → 409); `PATCH/DELETE /api/staff/<urlencoded name>` updates or removes (admins are undeletable in the UI). Validated by `$jsonSchema` in `init-db`.
- **Auth & roles**: the app opens on a login screen; staff sign in with name + PIN (`POST /api/auth/login`). Every mutating API requires `X-Staff-Name` / `X-Staff-Pin` headers, validated against MongoDB (`requireStaff` in `lib/db.ts`):
  - Selling (`POST /api/sales`) and refunds: **any Active role** (Cashier+). Sales record `servedBy`.
  - Product create/edit/delete and stock adjustments: **Manager or Administrator**.
  - Staff create/update/delete (PIN management): **Administrator only**.
  - Violations → 401 (bad/missing credentials) or 403 (role/inactive); GETs stay public.
  - Demo PINs: Sokha P. (Admin) 1111 · Dara K. (Manager) 2222 · Mony S. (Cashier) 3333. PINs are plain text in the demo database — swap for bcrypt before real use.
