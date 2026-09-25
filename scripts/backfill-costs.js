#!/usr/bin/env node
/**
 * One-time backfill: sets correct cost values on seed products that were inserted
 * before the cost field existed (they have cost: 0 from the updateMany backfill).
 * Safe to re-run — only patches documents where cost is still 0.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

function resolveUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const envPath = path.join(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*MONGODB_URI\s*=\s*(.+)\s*$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  return "mongodb://127.0.0.1:27017/storegenz";
}

// Correct costs for the 6 seed products — mirrors lib/db.ts ensureSeeded().
const SEED_COSTS = {
  "SKU-09231": 9.8,
  "SKU-00842": 0.45,
  "SKU-00128": 0.8,
  "SKU-00419": 0.28,
  "SKU-00555": 2.1,
  "SKU-00783": 3.4,
};

async function main() {
  const uri = resolveUri();
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const products = client.db("storegenz").collection("products");

    console.log("Current product costs:");
    const docs = await products.find({}, { projection: { _id: 1, name: 1, cost: 1 } }).toArray();
    for (const d of docs) {
      console.log(`  ${d._id}  cost=${d.cost}  ${d.name}`);
    }

    let updated = 0;
    for (const [sku, cost] of Object.entries(SEED_COSTS)) {
      const res = await products.updateOne(
        { _id: sku, cost: 0 },
        { $set: { cost } }
      );
      if (res.modifiedCount) {
        console.log(`  ✓ patched ${sku} → cost ${cost}`);
        updated++;
      }
    }

    if (updated === 0) {
      console.log("All seed product costs are already correct — nothing to patch.");
    } else {
      console.log(`Patched ${updated} product(s).`);
    }
  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error("backfill-costs failed:", err.message);
  process.exit(1);
});
