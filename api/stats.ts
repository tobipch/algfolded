import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "./_lib/db.js";
import { getCurrentUser } from "./_lib/auth.js";

// Per-case aggregates for the stats overview: how often each case was solved
// and how long it took on average (plus best and most recent solve).
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      res.status(401).json({ error: "Not logged in" });
      return;
    }
    const algset = typeof req.query.algset === "string" ? req.query.algset : null;
    if (!algset || algset.length > 32) {
      res.status(400).json({ error: "algset required" });
      return;
    }
    const rows = await query<{
      case_key: string;
      n: number;
      avg_ms: number;
      best_ms: number;
      last_at: string;
    }>(
      `SELECT case_key, COUNT(*) AS n, AVG(ms) AS avg_ms, MIN(ms) AS best_ms,
              MAX(solved_at) AS last_at
         FROM solves
        WHERE user_id = ? AND algset = ?
        GROUP BY case_key`,
      [user.id, algset]
    );
    res.status(200).json({
      cases: rows.map((r) => ({
        caseKey: r.case_key,
        count: Number(r.n),
        avgMs: Math.round(Number(r.avg_ms)),
        bestMs: Number(r.best_ms),
        lastAt: r.last_at,
      })),
    });
  } catch (err) {
    console.error("stats error:", err);
    res.status(500).json({ error: "Internal error" });
  }
}
