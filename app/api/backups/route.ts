import { NextResponse } from "next/server";
import { requireCapability, ensureSeeded, logActivity, DB_NAME, requireStaff } from "@/lib/db";
import fs from "fs";
import path from "path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

const run = promisify(execFile);
const backupsDir = () => path.join(process.cwd(), "backups");
const readManifest = () => {
  const dir = backupsDir();
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort().reverse();
    return files.map(f => {
      const full = path.join(dir, f);
      const st = fs.statSync(full);
      return { file: f, createdAt: st.mtime.toISOString(), sizeBytes: st.size };
    });
  } catch {
    return [];
  }
};

/**
 * The backup/restore logic lives in scripts/backup-db.js and scripts/restore-backup.js —
 * the exact same CLIs `npm run backup` uses. They are outside the compiler's include set,
 * so they are executed as child processes of the running node binary instead of imported
 * (bundlers mangle CJS interop for builtins like createRequire).
 */
const runScript = (args: string[]) =>
  run(process.execPath, args, { cwd: process.cwd(), env: process.env, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });

/** Lists the backups/ directory (Settings → Backup & Data). Read requires any signed-in staff. */
export async function GET(request: Request) {
  try {
    await ensureSeeded();
    await requireStaff(request);
    return NextResponse.json({ backups: readManifest(), autoBackup: "daily via boot-time check and Windows scheduled task (02:00)" });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}

/** Creates a backup now (same JSON format as `npm run backup`). Requires settings.manage. */
export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const by = await requireCapability(request, "settings.manage");
    const { stdout } = await runScript(["scripts/backup-db.js", "--print"]);
    // The script prints "backup: <file> (<collections>)" with --print.
    const m = stdout.match(/backup:\s*(\S+\.json)/);
    if (!m) return bad(`Backup script produced no file (output: ${stdout.slice(0, 200)})`, 503);
    await logActivity("backup.create", `${m[1]} (${DB_NAME})`, by);
    return NextResponse.json({ ok: true, file: m[1], backups: readManifest() }, { status: 201 });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    const detail = (e as { stderr?: string }).stderr ?? String(e);
    return NextResponse.json({ error: detail.slice(0, 300) }, { status: 503 });
  }
}

/** Restores from the newest backup file — a destructive, admin-only operation. */
export async function PUT(request: Request) {
  try {
    await ensureSeeded();
    const by = await requireCapability(request, "staff.manage");
    const body = (await request.json().catch(() => ({}))) as { confirm?: string };
    if (body.confirm !== "RESTORE") return bad("Send {\"confirm\":\"RESTORE\"} to confirm — this overwrites the live database.");
    const list = readManifest();
    if (list.length === 0) return bad("No backup files found in backups/.", 404);
    const newest = list[0];
    await runScript(["scripts/restore-backup.js", path.join("backups", newest.file), "--yes"]);
    await logActivity("backup.restore", `Database restored from ${newest.file}`, by);
    return NextResponse.json({ ok: true, restoredFrom: newest.file });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return bad((e as Error).message, status);
    const detail = (e as { stderr?: string }).stderr ?? String(e);
    return NextResponse.json({ error: detail.slice(0, 300) }, { status: 503 });
  }
}
