import type { VercelRequest, VercelResponse } from "@vercel/node";
import { execute, query } from "./_lib/db.js";
import { getCurrentUser } from "./_lib/auth.js";

// The user's preferred algorithm per case. GET returns a caseKey -> alg map
// for one algset; PUT upserts a single choice (alg = null clears it).
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      res.status(401).json({ error: "Not logged in" });
      return;
    }

    if (req.method === "GET") {
      const algset = typeof req.query.algset === "string" ? req.query.algset : null;
      if (!algset || algset.length > 32) {
        res.status(400).json({ error: "algset required" });
        return;
      }
      const rows = await query<{ case_key: string; alg: string }>(
        "SELECT case_key, alg FROM user_case_algs WHERE user_id = ? AND algset = ?",
        [user.id, algset]
      );
      const algs: Record<string, string> = {};
      for (const r of rows) algs[r.case_key] = r.alg;
      res.status(200).json({ algs });
      return;
    }

    if (req.method === "PUT") {
      const body = req.body as
        | { algset?: unknown; caseKey?: unknown; alg?: unknown }
        | undefined;
      const algset = typeof body?.algset === "string" ? body.algset : null;
      const caseKey = typeof body?.caseKey === "string" ? body.caseKey : null;
      const alg = typeof body?.alg === "string" && body.alg.length > 0 ? body.alg.slice(0, 255) : null;
      if (!algset || algset.length > 32 || !caseKey || caseKey.length > 64) {
        res.status(400).json({ error: "algset and caseKey required" });
        return;
      }
      if (alg === null) {
        await execute(
          "DELETE FROM user_case_algs WHERE user_id = ? AND algset = ? AND case_key = ?",
          [user.id, algset, caseKey]
        );
      } else {
        await execute(
          `INSERT INTO user_case_algs (user_id, algset, case_key, alg)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE alg = VALUES(alg)`,
          [user.id, algset, caseKey, alg]
        );
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("case-algs error:", err);
    res.status(500).json({ error: "Internal error" });
  }
}
