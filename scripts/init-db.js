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
        stock: { bsonType: "number", minimum: 0 },
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
        role: { enum: ["Administrator", "Manager", "Cashier"] },
        permissions: { enum: ["Full access", "POS + inventory", "POS access"] },
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
        currency: { bsonType: "string", minLength: 1, maxLength: 4 }
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
    { key: { createdAt: -1 }, name: "createdAt_-1" },
    { key: { status: 1, createdAt: -1 }, name: "status_1_createdAt_-1" }
  ],
  sessions: [
    { key: { expiresAt: 1 }, name: "expiresAt_1", expireAfterSeconds: 0 }
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
        if (!have.has(idxName)) await db.collection(name).createIndex(idx.key, { name: idxName });
      }
      console.log(`✓ collection "${name}" (validator + indexes ok)`);
    }

    if (seed) {
      // Seed data mirrors ensureSeeded() in lib/db.ts; kept in sync manually.
      const products = db.collection("products");
      const sales = db.collection("sales");
      if ((await products.countDocuments()) === 0) {
        await products.insertMany([
          { _id: "SKU-09231", name: "Premium Jasmine Rice 5kg", sku: "SKU-09231", category: "Groceries", price: 12.5, stock: 4 },
          { _id: "SKU-00842", name: "Coca Cola Original 330ml", sku: "SKU-00842", category: "Beverages", price: 0.75, stock: 48 },
          { _id: "SKU-00128", name: "Cambodia Beer Can 330ml", sku: "SKU-00128", category: "Beverages", price: 1.25, stock: 12 },
          { _id: "SKU-00419", name: "Angkor Mineral Water 1.5L", sku: "SKU-00419", category: "Beverages", price: 0.5, stock: 96 },
          { _id: "SKU-00555", name: "Palm Sugar 500g", sku: "SKU-00555", category: "Groceries", price: 3.2, stock: 25 },
          { _id: "SKU-00783", name: "Laundry Detergent 1kg", sku: "SKU-00783", category: "Household", price: 4.75, stock: 18 }
        ]);
        console.log("✓ seeded 6 products");
      } else {
        console.log("• products not empty, skipped seeding");
      }
      const staff = db.collection("staff");
      if ((await staff.countDocuments()) === 0) {
        await staff.insertMany([
          { _id: "Sokha P.", name: "Sokha P.", role: "Administrator", permissions: "Full access", status: "Active" },
          { _id: "Mony S.", name: "Mony S.", role: "Cashier", permissions: "POS access", status: "Active" },
          { _id: "Dara K.", name: "Dara K.", role: "Manager", permissions: "POS + inventory", status: "Active" }
        ]);
        console.log("✓ seeded 3 staff");
      } else {
        console.log("• staff not empty, skipped seeding");
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
