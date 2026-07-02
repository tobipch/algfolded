import crypto from "crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { execute, query } from "./db.js";

export const SESSION_COOKIE = "wca_session";
export const SESSION_TTL_S = 30 * 24 * 60 * 60; // 30 days

export interface AuthUser {
  id: number;
  wcaAccountId: number;
  wcaId: string | null;
  name: string;
  avatarUrl: string | null;
}

export function parseCookies(req: VercelRequest): Record<string, string> {
  const header = req.headers.cookie;
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

export function serializeCookie(name: string, value: string, maxAgeSeconds: number): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`];
  if (process.env.NODE_ENV !== "development") parts.push("Secure");
  return parts.join("; ");
}

export function appendSetCookie(res: VercelResponse, cookie: string): void {
  const prev = res.getHeader("Set-Cookie");
  const list = prev == null ? [] : Array.isArray(prev) ? prev.map(String) : [String(prev)];
  res.setHeader("Set-Cookie", [...list, cookie]);
}

export async function createSession(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  // Opportunistic cleanup so the table doesn't accumulate dead sessions.
  await execute("DELETE FROM user_sessions WHERE expires_at < NOW()");
  await execute(
    "INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))",
    [token, userId, SESSION_TTL_S]
  );
  return token;
}

export async function deleteSession(token: string): Promise<void> {
  await execute("DELETE FROM user_sessions WHERE token = ?", [token]);
}

export async function getSessionUser(token: string): Promise<AuthUser | null> {
  const rows = await query<{
    id: number;
    wca_account_id: number;
    wca_id: string | null;
    wca_name: string;
    wca_avatar_url: string | null;
  }>(
    `SELECT u.id, u.wca_account_id, u.wca_id, u.wca_name, u.wca_avatar_url
       FROM user_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > NOW()`,
    [token]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    wcaAccountId: r.wca_account_id,
    wcaId: r.wca_id,
    name: r.wca_name,
    avatarUrl: r.wca_avatar_url,
  };
}

export async function getCurrentUser(req: VercelRequest): Promise<AuthUser | null> {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  return getSessionUser(token);
}
