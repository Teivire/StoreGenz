import { readdir, mkdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * Runs once when the Next.js server boots (and again on some dev restarts).
 * Automatic backup: if the newest file in backups/ is older than 24 hours
 * (or there is none), export the database to backups/<timestamp>-storegenz.json.
 * Failures are logged but never block the server from starting.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const dir = path.join(process.cwd(), "backups");
    await mkdir(dir, { recursive: true });
    const files = (await readdir(dir)).filter(f => f.endsWith(".json")).sort();
    const newest = files[files.length - 1];
    if (newest) {
      const s = await stat(path.join(dir, newest));
      if (Date.now() - s.mtimeMs < 24 * 3600_000) return; // fresh enough — nothing to do
    }
    const require = createRequire(import.meta.url);
    const { writeBackup } = require("./scripts/backup-db.js") as { writeBackup: (o?: { print?: boolean }) => Promise<string> };
    await writeBackup({ print: true });
  } catch (e) {
    // Backup is best-effort: report, but never block the server.
    console.warn("[auto-backup] skipped:", e instanceof Error ? e.message : e);
  }

  // Recurring expenses (rent, utilities…): generate anything due, then advance
  // each schedule. Idempotent — safe on every boot and dev restart.
  try {
    const { runDueRecurringExpenses } = await import("./lib/db");
    const generated = await runDueRecurringExpenses();
    if (generated > 0) console.log(`[recurring-expenses] generated ${generated} expense(s) due since the last run.`);
  } catch (e) {
    console.warn("[recurring-expenses] skipped:", e instanceof Error ? e.message : e);
  }
}
