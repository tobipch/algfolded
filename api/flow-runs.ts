import type { VercelRequest, VercelResponse } from "@vercel/node";
import { execute, query } from "./_lib/db.js";
import { getCurrentUser } from "./_lib/auth.js";

// Finished flow runs, one series per algset. Runs belong to the account, so a
// run drilled on one machine is there on the next — the series an Ao5 and a
// personal best are read off is the user's, not the browser's.
//
// A run is identified by when it finished (`at`, epoch ms), which makes every
// upload idempotent: a retry, or a second device that still holds the run in
// its own localStorage, writes the same row.
const MAX_ALGSET = 32;
const MAX_SEL = 32;
const MAX_BATCH = 200;
const MAX_RETURNED = 200;
const MAX_MS = 6 * 60 * 60 * 1000; // six hours; above that it is garbage data
const MAX_AT = 4102444800000; // 2100-01-01; beyond that it is not a timestamp

interface RunInput {
  at: number;
  sel: string;
  pages: number;
  cases: number;
  ms: number;
  execMs: number;
  pauseMs: number;
  recoveryMs: number;
  moves: number;
  firstTry: number;
}

const int = (v: unknown, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null;

// One malformed run must not reject the whole batch, so a run is either
// well-formed or skipped. The parts (execution, pause, recovery, moves) are
// descriptive only: a missing one falls back to zero rather than dropping a
// run whose time is perfectly good.
function sanitize(raw: unknown): RunInput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const at = int(r.at, MAX_AT);
  const ms = int(r.ms, MAX_MS);
  const pages = int(r.pages, 1000);
  const cases = int(r.cases, 10000);
  if (at === null || at === 0 || ms === null || pages === null || cases === null) return null;
  return {
    at,
    ms,
    pages,
    cases,
    // Runs stored before the series was split per selection carry none; they
    // are kept, and compare against nothing, exactly as they do locally.
    sel: typeof r.sel === "string" ? r.sel.slice(0, MAX_SEL) : "",
    execMs: int(r.execMs, MAX_MS) ?? 0,
    pauseMs: int(r.pauseMs, MAX_MS) ?? 0,
    recoveryMs: int(r.recoveryMs, MAX_MS) ?? 0,
    moves: int(r.moves, 100000) ?? 0,
    firstTry: int(r.firstTry, 10000) ?? 0,
  };
}

interface RunRow {
  at_ms: number | string;
  selection: string;
  pages: number;
  cases: number;
  ms: number;
  exec_ms: number;
  pause_ms: number;
  recovery_ms: number;
  moves: number;
  first_try: number;
}

// BIGINT comes back as a string from some drivers/configurations, so the
// timestamp is normalised here rather than reaching the client as `"1758…"`
// and silently failing every `run.at === endedAt` comparison.
const toRun = (row: RunRow) => ({
  at: Number(row.at_ms),
  sel: row.selection,
  pages: row.pages,
  cases: row.cases,
  ms: row.ms,
  execMs: row.exec_ms,
  pauseMs: row.pause_ms,
  recoveryMs: row.recovery_ms,
  moves: row.moves,
  firstTry: row.first_try,
});

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      res.status(401).json({ error: "Not logged in" });
      return;
    }

    if (req.method === "GET") {
      const algset = typeof req.query.algset === "string" ? req.query.algset : null;
      if (!algset || algset.length > MAX_ALGSET) {
        res.status(400).json({ error: "algset required" });
        return;
      }
      // Newest first in SQL so the cap keeps the runs that matter, then
      // reversed: the client's series is oldest first, the way an Ao5 reads it.
      const rows = await query<RunRow>(
        `SELECT at_ms, selection, pages, cases, ms, exec_ms, pause_ms,
                recovery_ms, moves, first_try
           FROM flow_runs
          WHERE user_id = ? AND algset = ?
          ORDER BY at_ms DESC
          LIMIT ${MAX_RETURNED}`,
        [user.id, algset]
      );
      res.status(200).json({ runs: rows.map(toRun).reverse() });
      return;
    }

    if (req.method === "POST") {
      const body = req.body as { algset?: unknown; runs?: unknown[] } | undefined;
      const algset = typeof body?.algset === "string" ? body.algset : null;
      if (!algset || algset.length === 0 || algset.length > MAX_ALGSET) {
        res.status(400).json({ error: "algset required" });
        return;
      }
      const raw = Array.isArray(body?.runs) ? body!.runs!.slice(0, MAX_BATCH) : [];
      const runs = raw.map(sanitize).filter((r): r is RunInput => r !== null);
      let saved = 0;
      for (const run of runs) {
        // INSERT IGNORE + unique (user_id, algset, at_ms) makes retries and a
        // second device uploading the same run idempotent.
        const result = await execute(
          `INSERT IGNORE INTO flow_runs
             (user_id, algset, at_ms, selection, pages, cases, ms,
              exec_ms, pause_ms, recovery_ms, moves, first_try)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            user.id, algset, run.at, run.sel, run.pages, run.cases, run.ms,
            run.execMs, run.pauseMs, run.recoveryMs, run.moves, run.firstTry,
          ]
        );
        saved += result.affectedRows;
      }
      res.status(200).json({ saved });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("flow-runs error:", err);
    res.status(500).json({ error: "Internal error" });
  }
}
