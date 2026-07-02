import type { VercelRequest, VercelResponse } from "@vercel/node";
import { execute } from "./_lib/db.js";
import { getCurrentUser } from "./_lib/auth.js";

const MAX_BATCH = 200;
const MAX_MS = 60 * 60 * 1000; // one hour; anything above is garbage data

interface SolveInput {
  clientId: string;
  algset: string;
  caseKey: string;
  ms: number;
  scramble: string | null;
  algUsed: string | null;
  source: string;
  solvedAt: string | null;
}

function sanitize(raw: unknown): SolveInput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.clientId !== "string" || s.clientId.length === 0 || s.clientId.length > 36) return null;
  if (typeof s.algset !== "string" || s.algset.length === 0 || s.algset.length > 32) return null;
  if (typeof s.caseKey !== "string" || s.caseKey.length === 0 || s.caseKey.length > 64) return null;
  if (typeof s.ms !== "number" || !Number.isFinite(s.ms) || s.ms <= 0 || s.ms > MAX_MS) return null;
  const str = (v: unknown, max: number) =>
    typeof v === "string" && v.length > 0 ? v.slice(0, max) : null;
  return {
    clientId: s.clientId,
    algset: s.algset,
    caseKey: s.caseKey,
    ms: Math.round(s.ms),
    scramble: str(s.scramble, 255),
    algUsed: str(s.algUsed, 255),
    source: s.source === "smartcube" ? "smartcube" : "timer",
    solvedAt: str(s.solvedAt, 32),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      res.status(401).json({ error: "Not logged in" });
      return;
    }

    if (req.method === "POST") {
      const body = req.body as { solves?: unknown[] } | undefined;
      const raw = Array.isArray(body?.solves) ? body!.solves!.slice(0, MAX_BATCH) : [];
      const solves = raw.map(sanitize).filter((s): s is SolveInput => s !== null);
      let saved = 0;
      for (const s of solves) {
        const solvedAt = s.solvedAt ? new Date(s.solvedAt) : new Date();
        // INSERT IGNORE + unique (user_id, client_id) makes retries idempotent.
        const r = await execute(
          `INSERT IGNORE INTO solves
             (user_id, client_id, algset, case_key, ms, scramble, alg_used, source, solved_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            user.id,
            s.clientId,
            s.algset,
            s.caseKey,
            s.ms,
            s.scramble,
            s.algUsed,
            s.source,
            isNaN(solvedAt.getTime()) ? new Date() : solvedAt,
          ]
        );
        saved += r.affectedRows;
      }
      res.status(200).json({ ok: true, saved, received: solves.length });
      return;
    }

    if (req.method === "DELETE") {
      const body = req.body as { clientId?: unknown } | undefined;
      const clientId = typeof body?.clientId === "string" ? body.clientId : null;
      if (!clientId) {
        res.status(400).json({ error: "clientId required" });
        return;
      }
      const r = await execute("DELETE FROM solves WHERE user_id = ? AND client_id = ?", [
        user.id,
        clientId,
      ]);
      res.status(200).json({ ok: true, deleted: r.affectedRows });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("solves error:", err);
    res.status(500).json({ error: "Internal error" });
  }
}
