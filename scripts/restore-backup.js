#!/usr/bin/env node
/**
 * Restores a backup file produced by backup-db.js back into MongoDB.
 * Refuses to run without --yes so a destructive overwrite is never accidental.
 *
 * Usage:
 *   node scripts/restore-backup.js backups/2026-09-23T...-storegenz.json --yes
 */
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

const file = process.argv[2];
const yes = process.argv.includes("--yes");
if (require.main === module) {
  if (!file || !fs.existsSync(file)) {
    console.error("Usage: node scripts/restore-backup.js <backup-file.json> --yes");
    process.exit(1);
  }
  if (!yes) {
    console.error("Refusing to overwrite the live database without --yes.");
    process.exit(1);
  }
}

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

/**
 * Restores the given backup JSON file into MongoDB. Exported so the Settings →
 * Backup & Data API can reuse the exact same logic as the CLI (RESTORE_DB lets
 * tooling restore into a scratch database for round-trip tests).
 * @param {string} backupFile path to the backup JSON
 * @param {{ yes?: boolean }} opts `yes: true` confirms the destructive overwrite
 */
async function restoreBackup(backupFile, { yes = false } = {}) {
  const file = backupFile;
  if (!file || !fs.existsSync(file)) throw new Error(`Backup file not found: ${file}`);
  if (!yes) throw new Error("Refusing to overwrite the live database without confirmation.");
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  // RESTORE_DB lets tooling restore into a scratch database (round-trip tests) instead of the live one.
  const dbName = process.env.RESTORE_DB ?? parsed.database ?? "storegenz";
  const collections = parsed.collections ?? {};
  const client = new MongoClient(resolveUri());
  await client.connect();
  const db = client.db(dbName);

  for (const [name, docs] of Object.entries(collections)) {
    const col = db.collection(name);
    await col.deleteMany({});
    if (Array.isArray(docs) && docs.length > 0) {
      // Revive ISO strings written by the backup into BSON Dates where the field name suggests it.
      const revived = docs.map(d => {
        for (const [k, v] of Object.entries(d)) {
          if (typeof v === "string" && (k === "createdAt" || k.endsWith("At")) && !Number.isNaN(Date.parse(v))) d[k] = new Date(v);
        }
        return d;
      });
      await col.insertMany(revived);
    }
    console.log(`restored ${name}: ${Array.isArray(docs) ? docs.length : 0} docs`);
  }
  await client.close();
  console.log(`restore complete from ${path.basename(file)} into "${dbName}"`);
  return { database: dbName, collections: Object.keys(collections).length };
}

module.exports = { restoreBackup };

if (require.main === module) {
  restoreBackup(file, { yes }).catch(e => { console.error("restore failed:", e.message); process.exit(1); });
}
