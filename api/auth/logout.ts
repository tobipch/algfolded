import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  appendSetCookie,
  deleteSession,
  parseCookies,
  serializeCookie,
  SESSION_COOKIE,
} from "../_lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (token) await deleteSession(token);
    appendSetCookie(res, serializeCookie(SESSION_COOKIE, "", 0));
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("auth/logout error:", err);
    res.status(500).json({ error: "Internal error" });
  }
}
