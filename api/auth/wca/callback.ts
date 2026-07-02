import type { VercelRequest, VercelResponse } from "@vercel/node";
import { execute, query } from "../../_lib/db.js";
import {
  appendSetCookie,
  createSession,
  parseCookies,
  serializeCookie,
  SESSION_COOKIE,
  SESSION_TTL_S,
} from "../../_lib/auth.js";

const WCA_TOKEN_URL = "https://www.worldcubeassociation.org/oauth/token";
const WCA_ME_URL = "https://www.worldcubeassociation.org/api/v0/me";

function fail(res: VercelResponse): void {
  res.redirect(302, "/?auth_error=1");
}

// OAuth callback: exchange the code for a token, fetch the WCA profile,
// upsert the user and open a session cookie.
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const code = typeof req.query.code === "string" ? req.query.code : null;
  if (!code || req.query.error) return fail(res);

  const state = typeof req.query.state === "string" ? req.query.state : null;
  const expectedState = parseCookies(req)["wca_oauth_state"];
  if (!state || !expectedState || state !== expectedState) return fail(res);

  const clientId = process.env.WCA_CLIENT_ID;
  const clientSecret = process.env.WCA_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail(res);

  const redirectUri =
    process.env.WCA_REDIRECT_URI ?? `https://${req.headers.host}/api/auth/wca/callback`;

  try {
    const tokenRes = await fetch(WCA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    });
    if (!tokenRes.ok) return fail(res);
    const { access_token } = (await tokenRes.json()) as { access_token: string };

    const meRes = await fetch(WCA_ME_URL, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!meRes.ok) return fail(res);
    const { me } = (await meRes.json()) as {
      me: {
        id: number;
        wca_id: string | null;
        name: string;
        avatar?: { thumb_url?: string; url?: string };
      };
    };

    const wcaAccountId = me.id;
    const wcaId = me.wca_id ?? null;
    const wcaName = me.name;
    const wcaAvatarUrl = me.avatar?.thumb_url ?? me.avatar?.url ?? null;

    let userId: number;
    const existing = await query<{ id: number }>(
      "SELECT id FROM users WHERE wca_account_id = ?",
      [wcaAccountId]
    );
    if (existing.length > 0) {
      userId = existing[0].id;
      await execute(
        "UPDATE users SET wca_id = COALESCE(?, wca_id), wca_name = ?, wca_avatar_url = ? WHERE id = ?",
        [wcaId, wcaName, wcaAvatarUrl, userId]
      );
    } else {
      const result = await execute(
        "INSERT INTO users (wca_account_id, wca_id, wca_name, wca_avatar_url) VALUES (?, ?, ?, ?)",
        [wcaAccountId, wcaId, wcaName, wcaAvatarUrl]
      );
      userId = result.insertId;
    }

    const token = await createSession(userId);
    appendSetCookie(res, serializeCookie(SESSION_COOKIE, token, SESSION_TTL_S));
    appendSetCookie(res, serializeCookie("wca_oauth_state", "", 0));
    res.redirect(302, "/");
  } catch (err) {
    console.error("WCA OAuth error:", err);
    fail(res);
  }
}
