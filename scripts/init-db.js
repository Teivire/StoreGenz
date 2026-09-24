/**
 * Creates the StoreGenz MongoDB database explicitly, so the schema is versioned
 * code rather than an accident of the first insert.
 *
 *   npm run db:init            # structure only (collections + validators + indexes)
 *   npm run db:init -- --seed  # also insert starter data if collections are empty
 *   MONGODB_URI="mongodb://user:pass@host:27017" npm run db:init   # custom target
 *
 * Safe to re-run: creation operations and index builds are idempotent, and seeding
 * only fills EMPTY collections (it never overwrites existing documents).
 *
 * Reads MONGODB_URI from the environment; if unset, parses ./.env.local (no dotenv
 * dependency) and falls back to the app's default mongodb://127.0.0.1:27017.
 * The database name mirrors DB_NAME in lib/db.ts.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

const DB_NAME = "storegenz";

function resolveUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const envPath = path.join(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*MONGODB_URI\s*=\s*(.+)\s*$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  return `mongodb://127.0.0.1:27017/${DB_NAME}`;
}

const validators = {
  products: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "name", "sku", "category", "price", "stock"],
      properties: {
        _id: { bsonType: "string" },
        name: { bsonType: "string", minLength: 1 },
        sku: { bsonType: "string", minLength: 1 },
        category: { bsonType: "string", minLength: 1 },
        price: { bsonType: "number", minimum: 0 },
        cost: { bsonType: "number", minimum: 0 },
        // allowNegativeStock (Settings → POS & Sales) can drive stock below zero on
        // purpose, so the validator permits negatives and the policy lives in code.
        stock: { bsonType: "number" },
        image: { bsonType: ["string", "null"] }
      }
    }
  },
  staff: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "name", "role", "permissions", "status"],
      properties: {
        _id: { bsonType: "string" },
        name: { bsonType: "string", minLength: 1 },
        // Role ids reference the roles collection — validated by the API against the
        // live list, so the schema stays open to custom roles (RBAC).
        role: { bsonType: "string", minLength: 1, maxLength: 60 },
        permissions: { bsonType: "string", maxLength: 60 },
        status: { enum: ["Active", "Inactive"] }
      }
    }
  },
  sales: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "id", "customer", "date", "payment", "status", "lines", "createdAt"],
      properties: {
        _id: { bsonType: "string" },
        id: { bsonType: "string", pattern: "^#INV-\\d+$" },
        customer: { bsonType: "string", minLength: 1 },
        date: { bsonType: "string" },
        payment: { bsonType: "string" },
        status: { enum: ["Paid", "Pending", "Refunded"] },
        refundReason: { bsonType: "string" },
        discount: { bsonType: "number", minimum: 0 },
        saleTotal: { bsonType: "number", minimum: 0 },
        amountPaid: { bsonType: "number", minimum: 0 },
        changeDue: { bsonType: "number", minimum: 0 },
        lines: {
          bsonType: "array",
          minItems: 1,
          items: {
            bsonType: "object",
            required: ["name", "sku", "price", "cost", "qty"],
            properties: {
              name: { bsonType: "string" },
              sku: { bsonType: "string" },
              price: { bsonType: "number", minimum: 0 },
              cost: { bsonType: "number", minimum: 0 },
              qty: { bsonType: "number", minimum: 1 }
            }
          }
        },
        createdAt: { bsonType: "date" }
      }
    }
  },
  settings: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "name", "location", "receiptFooter", "currency"],
      properties: {
        _id: { bsonType: "string", enum: ["settings"] },
        name: { bsonType: "string", minLength: 1, maxLength: 60 },
        location: { bsonType: "string", maxLength: 80 },
        receiptFooter: { bsonType: "string", maxLength: 120 },
        currency: { bsonType: "string", minLength: 1, maxLength: 4 },
        // Optional policy groups (RBAC-era settings hub). Present fields are typed;
        // absent fields fall back to DEFAULT_SETTINGS in lib/db.ts.
        taxEnabled: { bsonType: "bool" },
        taxRatePercent: { bsonType: "number", minimum: 0, maximum: 100 },
        taxLabel: { bsonType: "string", maxLength: 12 },
        taxInclusive: { bsonType: "bool" },
        allowNegativeStock: { bsonType: "bool" },
        lowStockThreshold: { bsonType: "int", minimum: 0, maximum: 9999 },
        maxDiscountPercent: { bsonType: "number", minimum: 0, maximum: 100 },
        loyaltyEnabled: { bsonType: "bool" },
        loyaltyEarnRate: { bsonType: "number", minimum: 0, maximum: 1000 },
        loyaltyTiers: {
          bsonType: "array",
          minItems: 1,
          items: { bsonType: "object", required: ["name", "min"], properties: {
            name: { bsonType: "string", minLength: 1, maxLength: 30 },
            min: { bsonType: "int", minimum: 0 }
          } }
        },
        paymentMethods: {
          bsonType: "array",
          minItems: 1,
          items: { bsonType: "object", required: ["name", "enabled"], properties: {
            name: { bsonType: "string", minLength: 1, maxLength: 40 },
            enabled: { bsonType: "bool" }
          } }
        }
      }
    }
  },
  sessions: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "staffId", "createdAt", "expiresAt"],
      properties: {
        _id: { bsonType: "string", minLength: 1 },
        staffId: { bsonType: "string", minLength: 1 },
        createdAt: { bsonType: "date" },
        expiresAt: { bsonType: "date" }
      }
    }
  },
  categories: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "id", "name", "parentId", "description", "status", "sortOrder", "createdBy", "createdAt", "updatedAt"],
      properties: {
        _id: { bsonType: "string", minLength: 1 },
        id: { bsonType: "string", minLength: 1 },
        name: { bsonType: "string", minLength: 1, maxLength: 60 },
        parentId: { bsonType: ["string", "null"] },
        description: { bsonType: "string", maxLength: 300 },
        status: { enum: ["Active", "Inactive"] },
        sortOrder: { bsonType: "int" },
        createdBy: { bsonType: "string" },
        createdAt: { bsonType: "string" },
        updatedAt: { bsonType: "string" }
      }
    }
  },
  stock_movements: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "sku", "productName", "delta", "reason", "note", "by", "refId", "createdAt"],
      properties: {
        _id: { bsonType: "string", minLength: 1 },
        sku: { bsonType: "string", minLength: 1 },
        productName: { bsonType: "string", minLength: 1 },
        delta: { bsonType: "int" },
        reason: { enum: ["adjustment", "sale", "refund", "purchase", "purchase-return", "transfer-in", "transfer-out", "seed"] },
        note: { bsonType: "string", maxLength: 200 },
        by: { bsonType: "string", minLength: 1 },
        refId: { bsonType: "string" },
        createdAt: { bsonType: "string" }
      }
    }
  },
  expenses: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "id", "date", "category", "amount", "note", "createdBy", "createdAt"],
      properties: {
        _id: { bsonType: "string", minLength: 1 },
        id: { bsonType: "string", pattern: "^EXP-\\d+$" },
        date: { bsonType: "string" },
        category: { bsonType: "string", minLength: 1 },
        amount: { bsonType: "number", minimum: 0.01 },
        note: { bsonType: "string", maxLength: 200 },
        createdBy: { bsonType: "string" },
        createdAt: { bsonType: "string" }
      }
    }
  },
  purchases: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "id", "supplier", "lines", "status", "note", "createdBy", "createdAt"],
      properties: {
        _id: { bsonType: "string", minLength: 1 },
        id: { bsonType: "string", pattern: "^PO-\\d+$" },
        supplier: { bsonType: "string", minLength: 1, maxLength: 80 },
        lines: {
          bsonType: "array",
          minItems: 1,
          items: {
            bsonType: "object",
            required: ["sku", "name", "qty", "cost"],
            properties: {
              sku: { bsonType: "string", minLength: 1 },
              name: { bsonType: "string", minLength: 1 },
              qty: { bsonType: "int", minimum: 1 },
              cost: { bsonType: "number", minimum: 0 }
            }
          }
        },
        status: { enum: ["Pending", "Received", "Returned"] },
        note: { bsonType: "string", maxLength: 200 },
        createdBy: { bsonType: "string" },
        createdAt: { bsonType: "string" },
        receivedAt: { bsonType: "string" },
        returnedAt: { bsonType: "string" }
      }
    }
  },
  suppliers: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "id", "name", "phone", "email", "address", "group", "note", "createdBy", "createdAt", "updatedAt"],
      properties: {
        _id: { bsonType: "string", minLength: 1 },
        id: { bsonType: "string", pattern: "^SUP-\\d+$" },
        name: { bsonType: "string", minLength: 1, maxLength: 80 },
        phone: { bsonType: "string", maxLength: 40 },
        email: { bsonType: "string", maxLength: 120 },
        address: { bsonType: "string", maxLength: 200 },
        group: { bsonType: "string", minLength: 1, maxLength: 40 },
        note: { bsonType: "string", maxLength: 200 },
        createdBy: { bsonType: "string" },
        createdAt: { bsonType: "string" },
        updatedAt: { bsonType: "string" }
      }
    }
  },
  supplier_payments: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "id", "supplierId", "supplierName", "date", "amount", "method", "note", "createdBy", "createdAt"],
      properties: {
        _id: { bsonType: "string", minLength: 1 },
        id: { bsonType: "string", pattern: "^SPP-\\d+$" },
        supplierId: { bsonType: "string", minLength: 1 },
        supplierName: { bsonType: "string", minLength: 1 },
        date: { bsonType: "string" },
        amount: { bsonType: "number", minimum: 0.01 },
        method: { bsonType: "string", minLength: 1, maxLength: 40 },
        note: { bsonType: "string", maxLength: 200 },
        createdBy: { bsonType: "string" },
        createdAt: { bsonType: "string" }
      }
    }
  },
  customers: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "id", "name", "phone", "email", "address", "group", "loyaltyPoints", "note", "createdBy", "createdAt", "updatedAt"],
      properties: {
        _id: { bsonType: "string", minLength: 1 },
        id: { bsonType: "string", pattern: "^CUS-\\d+$" },
        name: { bsonType: "string", minLength: 1, maxLength: 80 },
        phone: { bsonType: "string", maxLength: 40 },
        email: { bsonType: "string", maxLength: 120 },
        address: { bsonType: "string", maxLength: 200 },
        group: { bsonType: "string", minLength: 1, maxLength: 40 },
        loyaltyPoints: { bsonType: "int", minimum: 0 },
        note: { bsonType: "string", maxLength: 200 },
        createdBy: { bsonType: "string" },
        createdAt: { bsonType: "string" },
        updatedAt: { bsonType: "string" }
      }
    }
  },
  recurring_expenses: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "id", "category", "amount", "frequency", "note", "nextRun", "active", "createdBy", "createdAt"],
      properties: {
        _id: { bsonType: "string", minLength: 1 },
        id: { bsonType: "string", pattern: "^REC-\\d+$" },
        category: { bsonType: "string", minLength: 1 },
        amount: { bsonType: "number", minimum: 0.01 },
        frequency: { enum: ["weekly", "monthly"] },
        note: { bsonType: "string", maxLength: 200 },
        nextRun: { bsonType: "string" },
        lastRun: { bsonType: "string" },
        active: { bsonType: "bool" },
        createdBy: { bsonType: "string" },
        createdAt: { bsonType: "string" }
      }
    }
  },
  customer_payments: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "id", "customerId", "customerName", "date", "amount", "method", "note", "createdBy", "createdAt"],
      properties: {
        _id: { bsonType: "string", minLength: 1 },
        id: { bsonType: "string", pattern: "^CSP-\\d+$" },
        customerId: { bsonType: "string", minLength: 1 },
        customerName: { bsonType: "string", minLength: 1 },
        date: { bsonType: "string" },
        amount: { bsonType: "number", minimum: 0.01 },
        method: { bsonType: "string", minLength: 1, maxLength: 40 },
        note: { bsonType: "string", maxLength: 200 },
        createdBy: { bsonType: "string" },
        createdAt: { bsonType: "string" }
      }
    }
  },
  stock_transfers: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "id", "sku", "productName", "qty", "from", "to", "note", "by", "createdAt"],
      properties: {
        _id: { bsonType: "string", minLength: 1 },
        id: { bsonType: "string", pattern: "^TRF-\\d+$" },
        sku: { bsonType: "string", minLength: 1 },
        productName: { bsonType: "string", minLength: 1 },
        qty: { bsonType: "int", minimum: 1 },
        from: { bsonType: "string", minLength: 1, maxLength: 80 },
        to: { bsonType: "string", minLength: 1, maxLength: 80 },
        note: { bsonType: "string", maxLength: 200 },
        by: { bsonType: "string", minLength: 1 },
        createdAt: { bsonType: "string" }
      }
    }
  },
  departments: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "id", "name", "description", "createdBy", "createdAt"],
      properties: {
        _id: { bsonType: "string", minLength: 1 },
        id: { bsonType: "string", minLength: 1 },
        name: { bsonType: "string", minLength: 1, maxLength: 60 },
        description: { bsonType: "string", maxLength: 200 },
        createdBy: { bsonType: "string" },
        createdAt: { bsonType: "string" }
      }
    }
  },
  stores: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "id", "code", "name", "type", "status", "createdBy", "createdAt", "updatedAt"],
      properties: {
        _id: { bsonType: "string", minLength: 1 },
        id: { bsonType: "string", minLength: 1 },
        code: { bsonType: "string", minLength: 1, maxLength: 20 },
        name: { bsonType: "string", minLength: 1, maxLength: 80 },
        type: { enum: ["Retail Store", "Warehouse", "Online Store"] },
        status: { enum: ["Active", "Inactive"] },
        createdBy: { bsonType: "string" },
        createdAt: { bsonType: "string" },
        updatedAt: { bsonType: "string" }
      }
    }
  },
  attendance: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "id", "staffName", "clockIn"],
      properties: {
        _id: { bsonType: "string", minLength: 1 },
        id: { bsonType: "string", minLength: 1 },
        staffName: { bsonType: "string", minLength: 1 },
        clockIn: { bsonType: "string" },
        clockOut: { bsonType: "string" },
        note: { bsonType: "string", maxLength: 200 }
      }
    }
  },
  activity_log: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "action", "detail", "by", "createdAt"],
      properties: {
        _id: { bsonType: "string", minLength: 1 },
        action: { bsonType: "string", minLength: 1, maxLength: 60 },
        detail: { bsonType: "string", maxLength: 200 },
        by: { bsonType: "string", minLength: 1 },
        createdAt: { bsonType: "string" }
      }
    }
  },
  register_shifts: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "id", "openedBy", "openedAt", "openingFloat"],
      properties: {
        _id: { bsonType: "string", minLength: 1 },
        id: { bsonType: "string", pattern: "^SHF-\\d+$" },
        openedBy: { bsonType: "string", minLength: 1 },
        openedAt: { bsonType: "string" },
        openingFloat: { bsonType: "number", minimum: 0 },
        closedBy: { bsonType: "string" },
        closedAt: { bsonType: "string" },
        closingCount: { bsonType: "number", minimum: 0 },
        expectedCash: { bsonType: "number" },
        variance: { bsonType: "number" },
        note: { bsonType: "string", maxLength: 200 }
      }
    }
  },
  cash_movements: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "id", "shiftId", "direction", "amount", "reason", "by", "createdAt"],
      properties: {
        _id: { bsonType: "string", minLength: 1 },
        id: { bsonType: "string", pattern: "^MOV-\\d+$" },
        shiftId: { bsonType: "string", minLength: 1 },
        direction: { enum: ["in", "out"] },
        amount: { bsonType: "number", minimum: 0.01 },
        reason: { bsonType: "string", minLength: 1, maxLength: 120 },
        by: { bsonType: "string", minLength: 1 },
        createdAt: { bsonType: "string" }
      }
    }
  },
  roles: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "id", "name", "description", "capabilities", "system", "createdBy", "createdAt", "updatedAt"],
      properties: {
        _id: { bsonType: "string", minLength: 1 },
        id: { bsonType: "string", minLength: 1, maxLength: 60 },
        name: { bsonType: "string", minLength: 1, maxLength: 60 },
        description: { bsonType: "string", maxLength: 300 },
        capabilities: {
          bsonType: "array",
          uniqueItems: true,
          items: { bsonType: "string", enum: [
            "sell", "inventory.manage", "purchases.manage", "suppliers.manage",
            "customers.manage", "finance.manage", "register.operate", "departments.manage",
            "reports.view", "staff.manage", "settings.manage"
          ] }
        },
        system: { bsonType: "bool" },
        createdBy: { bsonType: "string" },
        createdAt: { bsonType: "string" },
        updatedAt: { bsonType: "string" }
      }
    }
  }
};

const indexes = {
  products: [
    { key: { category: 1 }, name: "category_1" }
  ],
  staff: [
    { key: { status: 1 }, name: "status_1" }
  ],
  sales: [
    // newest-first for the Transactions list and dashboard recent-sales panel
    { key: { createdAt: -1 }, name: "createdAt_-1" },
    // filtered queries: status + date (e.g. "show all Paid sales in range")
    { key: { status: 1, createdAt: -1 }, name: "status_1_createdAt_-1" },
    // invoice / customer search
    { key: { customer: 1 }, name: "customer_1" },
    // staff-performance aggregations on the dashboard
    { key: { servedBy: 1, createdAt: -1 }, name: "servedBy_1_createdAt_-1" }
  ],
  sessions: [
    // TTL: MongoDB auto-deletes expired sessions on its own schedule
    { key: { expiresAt: 1 }, name: "expiresAt_1", expireAfterSeconds: 0 }
  ],
  categories: [
    { key: { sortOrder: 1, name: 1 }, name: "sortOrder_1_name_1" },
    { key: { parentId: 1 }, name: "parentId_1" }
  ],
  stock_movements: [
    { key: { createdAt: -1 }, name: "createdAt_-1" },
    { key: { sku: 1, createdAt: -1 }, name: "sku_1_createdAt_-1" },
    { key: { reason: 1, createdAt: -1 }, name: "reason_1_createdAt_-1" }
  ],
  expenses: [
    { key: { date: -1 }, name: "date_-1" },
    { key: { category: 1, date: -1 }, name: "category_1_date_-1" }
  ],
  purchases: [
    { key: { createdAt: -1 }, name: "createdAt_-1" },
    { key: { status: 1, createdAt: -1 }, name: "status_1_createdAt_-1" }
  ],
  suppliers: [
    { key: { name: 1 }, name: "name_1" },
    { key: { group: 1, name: 1 }, name: "group_1_name_1" }
  ],
  supplier_payments: [
    { key: { date: -1 }, name: "date_-1" },
    { key: { supplierId: 1, date: -1 }, name: "supplierId_1_date_-1" }
  ],
  stock_transfers: [
    { key: { createdAt: -1 }, name: "createdAt_-1" },
    { key: { sku: 1, createdAt: -1 }, name: "sku_1_createdAt_-1" }
  ],
  customers: [
    { key: { name: 1 }, name: "name_1" },
    { key: { group: 1, name: 1 }, name: "group_1_name_1" },
    { key: { loyaltyPoints: -1 }, name: "loyaltyPoints_-1" }
  ],
  customer_payments: [
    { key: { date: -1 }, name: "date_-1" },
    { key: { customerId: 1, date: -1 }, name: "customerId_1_date_-1" }
  ],
  recurring_expenses: [
    { key: { active: 1, nextRun: 1 }, name: "active_1_nextRun_1" }
  ],
  register_shifts: [
    // Exactly one open shift at a time — enforced by the database, not just checks.
    { key: { closedAt: 1 }, name: "unique_open_shift", unique: true, partialFilterExpression: { closedAt: { $exists: false } } },
    { key: { openedAt: -1 }, name: "openedAt_-1" }
  ],
  cash_movements: [
    { key: { shiftId: 1, createdAt: -1 }, name: "shiftId_1_createdAt_-1" }
  ],
  departments: [
    { key: { name: 1 }, name: "name_1" }
  ],
  stores: [
    { key: { code: 1 }, name: "code_1", unique: true }
  ],
  attendance: [
    { key: { clockIn: -1 }, name: "clockIn_-1" },
    { key: { staffName: 1, clockIn: -1 }, name: "staffName_1_clockIn_-1" }
  ],
  activity_log: [
    { key: { createdAt: -1 }, name: "createdAt_-1" }
  ],
  roles: [
    { key: { name: 1 }, name: "name_1" }
  ]
};

async function main() {
  const seed = process.argv.includes("--seed");
  const uri = resolveUri();
  console.log(`Connecting to ${uri.replace(/\/\/[^@]*@/, "//***@")} (db: ${DB_NAME})…`);
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(DB_NAME);

    for (const [name, validator] of Object.entries(validators)) {
      await db.createCollection(name, { validator }).catch(err => {
        if (err.codeName !== "NamespaceExists") throw err;
        // Collection already exists: bring an older validator up to date.
        return db.command({ collMod: name, validator });
      });
      const have = new Set((await db.collection(name).listIndexes().toArray()).map(i => i.name));
      for (const idx of indexes[name] ?? []) {
        const idxName = idx.name ?? JSON.stringify(idx.key);
        // Pass the full entry through (minus the key itself) so options like
        // unique/partialFilterExpression survive — a name-only createIndex silently
        // downgrades those and then clashes with the app's stricter index.
        if (!have.has(idxName)) await db.collection(name).createIndex(idx.key, { ...idx, key: undefined });
      }
      console.log(`✓ collection "${name}" (validator + indexes ok)`);
    }

    if (seed) {
      // Seed data mirrors ensureSeeded() in lib/db.ts; kept in sync manually.
      const products = db.collection("products");
      const sales = db.collection("sales");
      if ((await products.countDocuments()) === 0) {
        await products.insertMany([
          { _id: "SKU-09231", name: "Premium Jasmine Rice 5kg",   sku: "SKU-09231", category: "Groceries", price: 12.5, cost: 9.8,  stock: 4  },
          { _id: "SKU-00842", name: "Coca Cola Original 330ml",   sku: "SKU-00842", category: "Beverages", price: 0.75, cost: 0.45, stock: 48 },
          { _id: "SKU-00128", name: "Cambodia Beer Can 330ml",    sku: "SKU-00128", category: "Beverages", price: 1.25, cost: 0.8,  stock: 12 },
          { _id: "SKU-00419", name: "Angkor Mineral Water 1.5L",  sku: "SKU-00419", category: "Beverages", price: 0.5,  cost: 0.28, stock: 96 },
          { _id: "SKU-00555", name: "Palm Sugar 500g",            sku: "SKU-00555", category: "Groceries", price: 3.2,  cost: 2.1,  stock: 25 },
          { _id: "SKU-00783", name: "Laundry Detergent 1kg",      sku: "SKU-00783", category: "Household", price: 4.75, cost: 3.4,  stock: 18 }
        ]);
        console.log("✓ seeded 6 products");
      } else {
        console.log("• products not empty, skipped seeding");
      }
      const staff = db.collection("staff");
      if ((await staff.countDocuments()) === 0) {
        // PINs are plain-text in this demo — swap for bcrypt/argon2 before production.
        await staff.insertMany([
          { _id: "Sokha P.", name: "Sokha P.", role: "Administrator", permissions: "Full access",     status: "Active", pin: "1111" },
          { _id: "Dara K.",  name: "Dara K.",  role: "Manager",       permissions: "POS + inventory", status: "Active", pin: "2222" },
          { _id: "Mony S.",  name: "Mony S.",  role: "Cashier",       permissions: "POS access",      status: "Active", pin: "3333" }
        ]);
        console.log("✓ seeded 3 staff (demo PINs: 1111 / 2222 / 3333)");
      } else {
        console.log("• staff not empty, skipped seeding");
      }
      const rolesCol = db.collection("roles");
      if ((await rolesCol.countDocuments()) === 0) {
        // Must stay in sync with ROLE_SEEDS in lib/db.ts.
        const now = new Date().toISOString();
        const allCaps = ["sell", "inventory.manage", "purchases.manage", "suppliers.manage", "customers.manage", "finance.manage", "register.operate", "departments.manage", "reports.view", "staff.manage", "settings.manage"];
        const noAdminCaps = allCaps.filter(c => c !== "staff.manage" && c !== "settings.manage");
        await rolesCol.insertMany([
          { _id: "Administrator", id: "Administrator", name: "Owner / Admin", description: "Full control — staff accounts, roles, settings, and every module.", capabilities: allCaps, system: true, createdBy: "system", createdAt: now, updatedAt: now },
          { _id: "Manager",       id: "Manager",       name: "Manager",        description: "Runs the floor — inventory, purchasing, suppliers, finance, reports, and the register.", capabilities: noAdminCaps, system: true, createdBy: "system", createdAt: now, updatedAt: now },
          { _id: "Cashier",       id: "Cashier",       name: "Cashier",        description: "Sells at the POS, takes payments, processes refunds, and clocks in and out.", capabilities: ["sell"], system: true, createdBy: "system", createdAt: now, updatedAt: now },
          { _id: "Inventory Staff", id: "Inventory Staff", name: "Inventory Staff", description: "Stockkeeping — products, categories, stock levels, transfers, and counts.", capabilities: ["sell", "inventory.manage", "reports.view"], system: false, createdBy: "system", createdAt: now, updatedAt: now },
          { _id: "Sales Staff",     id: "Sales Staff",     name: "Sales Staff",     description: "Front-of-house selling with customer bookkeeping.", capabilities: ["sell", "customers.manage"], system: false, createdBy: "system", createdAt: now, updatedAt: now },
          { _id: "Accountant",      id: "Accountant",      name: "Accountant",      description: "Reads the numbers — reports, expenses, and payments; no selling or stock changes.", capabilities: ["reports.view", "finance.manage"], system: false, createdBy: "system", createdAt: now, updatedAt: now }
        ]);
        console.log("✓ seeded 6 roles (Administrator, Manager, Cashier, Inventory Staff, Sales Staff, Accountant)");
      } else {
        console.log("• roles not empty, skipped seeding");
      }
      if ((await sales.countDocuments()) === 0) {
        console.log("• sales left to ensureSeeded() on first API use (its timestamps are relative to 'now')");
      }
    }

    const collections = await db.listCollections().toArray();
    const counts = {};
    for (const c of collections) counts[c.name] = await db.collection(c.name).countDocuments();
    console.log("Database ready.", JSON.stringify(counts));
  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error("✗ db:init failed:", err.message);
  process.exit(1);
});
