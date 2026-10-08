# StoreGenz POS

A full-stack Point of Sale system built with **Next.js 14**, **React 18**, **MongoDB**, and **Tailwind CSS**.

## Features

- **POS register** — product grid with category filters, cart, hold/resume orders, cash/ABA Pay/card checkout
- **Orders view** — searchable, filterable order history with receipt and refund actions
- **Dashboard** — KPI stats, sales trend chart, payment method breakdown, low-stock alerts, staff performance
- **Products & Stock** — catalog management, stock adjustments, movement ledger, low-stock alerts
- **Purchases** — purchase orders with receive/return flow, automatic stock updates
- **Customers & Suppliers** — directory, credit balances, loyalty points
- **Cash Register** — shift open/close, cash in/out movements, variance reporting
- **Staff & Roles** — RBAC with 6 built-in roles, custom roles, departments, attendance
- **Reports** — 30+ reports across sales, inventory, finance, and staff with CSV export
- **Settings** — store profile, tax, discounts, loyalty, payment methods, backup & restore

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | MongoDB (native driver) |
| Styling | Tailwind CSS + custom CSS |
| Language | TypeScript |

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB running on `localhost:27017` (or set `MONGODB_URI` in `.env.local`)

### Setup

```bash
# 1. Clone
git clone https://github.com/Teivire/StoreGenz.git
cd StoreGenz

# 2. Install
npm install

# 3. Configure (optional — defaults to localhost:27017)
echo "MONGODB_URI=mongodb://127.0.0.1:27017/storegenz" > .env.local

# 4. Init database (creates indexes + seeds demo data)
npm run init-db

# 5. Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Demo accounts

| Name | Role | PIN |
|---|---|---|
| Sokha P. | Administrator | `1111` |
| Dara K. | Manager | `2222` |
| Mony S. | Cashier | `3333` |

## Scripts

```bash
npm run dev          # Development server
npm run build        # Production build
npm run init-db      # Initialize DB schema + indexes
npm run init-db:seed # Initialize + seed demo data
npm run backup       # Manual database backup
npm run restore      # Restore from backup
npm run audit-core   # Run core business logic audit (requires dev server)
```

## Project Structure

```
app/
  api/          # REST API routes (Next.js App Router)
  page.tsx      # Single-page client app (all UI components)
  globals.css   # Design system + component styles
lib/
  db.ts         # MongoDB connection, types, auth helpers, seed logic
scripts/
  init-db.js    # Database initialization + schema setup
  backup-db.js  # Automated backup
  audit-core.js # Core business logic verification
```

## License

MIT
