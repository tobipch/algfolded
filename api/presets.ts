import type { VercelRequest, VercelResponse } from "@vercel/node";
import { execute, query } from "./_lib/db.js";
import { getCurrentUser } from "./_lib/auth.js";

// The user's named case selections ("presets"), one set of them per algset.
// GET returns every preset of one algset as name -> caseKey[]; PUT upserts a
// single preset; DELETE removes one. Presets belong to the account, so they
// follow the user from device to device.
const MAX_ALGSET = 32;
const MAX_NAME = 64;
const MAX_CASE_KEY = 64;
const MAX_CASES = 5000; // the largest algset has 1760 cases — plenty of headroom

// Keeps only well-formed case keys, so one broken entry can't reject the whole
// preset (and can't grow the stored blob without bound).
function sanitizeCases(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string" || v.length === 0 || v.length > MAX_CASE_KEY) continue;
    out.push(v);
    if (out.length >= MAX_CASES) break;
  }
  return out;
}

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
      const rows = await query<{ name: string; case_keys: string }>(
        "SELECT name, case_keys FROM user_presets WHERE user_id = ? AND algset = ?",
        [user.id, algset]
      );
      const presets: Record<string, string[]> = {};
      for (const r of rows) {
        // Stored as a JSON array. A row that somehow isn't parseable is skipped
        // rather than failing the whole load.
        try {
          const parsed: unknown = JSON.parse(r.case_keys);
          if (Array.isArray(parsed)) {
            presets[r.name] = parsed.filter((v): v is string => typeof v === "string");
          }
        } catch { /* skip this preset */ }
      }
      res.status(200).json({ presets });
      return;
    }

    if (req.method === "PUT") {
      const body = req.body as { algset?: unknown; name?: unknown; cases?: unknown } | undefined;
      const algset = typeof body?.algset === "string" ? body.algset : null;
      const name = typeof body?.name === "string" ? body.name : null;
      const cases = sanitizeCases(body?.cases);
      if (!algset || algset.length > MAX_ALGSET || !name || name.length === 0 || name.length > MAX_NAME || cases === null) {
        res.status(400).json({ error: "algset, name and cases required" });
        return;
      }
      await execute(
        `INSERT INTO user_presets (user_id, algset, name, case_keys)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE case_keys = VALUES(case_keys)`,
        [user.id, algset, name, JSON.stringify(cases)]
      );
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === "DELETE") {
      const body = req.body as { algset?: unknown; name?: unknown } | undefined;
      const algset = typeof body?.algset === "string" ? body.algset : null;
      const name = typeof body?.name === "string" ? body.name : null;
      if (!algset || algset.length > MAX_ALGSET || !name || name.length === 0 || name.length > MAX_NAME) {
        res.status(400).json({ error: "algset and name required" });
        return;
      }
      await execute(
        "DELETE FROM user_presets WHERE user_id = ? AND algset = ? AND name = ?",
        [user.id, algset, name]
      );
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("presets error:", err);
    res.status(500).json({ error: "Internal error" });
  }
}
