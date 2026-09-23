#!/usr/bin/env node
/**
 * Backs up the storegenz MongoDB database to backups/<timestamp>-storegenz.json
 * using the Node driver (no mongodump required).
 *
 * Usage:
 *   node scripts/backup-db.js                — write backups/<timestamp>-storegenz.json
 *   node scripts/backup-db.js --print        — also print a one-line summary
 *
 * Reads MONGODB_URI from the environment, falling back to .env.local, then to
 * mongodb://127.0.0.1:27017/storegenz.
 */
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

function resolveUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const envPath = path.join(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*MONGODB_URI\s*=\s*(.+)\s*$/);
      if (m) return m[1].trim();
    }
  }
  return "mongodb://127.0.0.1:27017/storegenz";
}

async function writeBackup({ print = false } = {}) {
  const uri = resolveUri();
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  const names = (await db.listCollections().toArray()).map(c => c.name).sort();
  const data = {};
  const counts = {};
  for (const name of names) {
    const docs = await db.collection(name).find().toArray();
    // BSON Dates do not survive JSON.stringify as Dates — normalize to ISO strings.
    data[name] = JSON.parse(JSON.stringify(docs));
    counts[name] = docs.length;
  }
  await client.close();

  const dir = path.join(__dirname, "..", "backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `${stamp}-${db.databaseName}.json`);
  fs.writeFileSync(file, JSON.stringify({ database: db.databaseName, createdAt: new Date().toISOString(), collections: data }, null, 1));

  // Retention: keep only the KEEP newest *.json backups (timestamped names sort chronologically).
  const KEEP = 30;
  const all = fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort();
  const stale = all.slice(0, Math.max(0, all.length - KEEP));
  for (const f of stale) fs.unlinkSync(path.join(dir, f));

  if (print) console.log(`backup: ${path.basename(file)} (${names.map(n => `${n}=${counts[n]}`).join(", ")})${stale.length ? ` — pruned ${stale.length} old file${stale.length === 1 ? "" : "s"}` : ""}`);
  return file;
}

if (require.main === module) {
  writeBackup({ print: process.argv.includes("--print") })
    .then(f => { if (!process.argv.includes("--print")) console.log(f); })
    .catch(e => { console.error("backup failed:", e.message); process.exit(1); });
}

module.exports = { writeBackup };
