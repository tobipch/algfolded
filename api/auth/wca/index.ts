import crypto from "crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { appendSetCookie } from "../../_lib/auth.js";

const WCA_AUTH_URL = "https://www.worldcubeassociation.org/oauth/authorize";

// Starts the WCA OAuth flow: set a state cookie and redirect to the WCA
// authorize page. The callback endpoint finishes the flow.
export default function handler(req: VercelRequest, res: VercelResponse): void {
  const clientId = process.env.WCA_CLIENT_ID;
  if (!clientId) {
    res.status(500).json({ error: "WCA OAuth is not configured" });
    return;
  }

  const redirectUri =
    process.env.WCA_REDIRECT_URI ?? `https://${req.headers.host}/api/auth/wca/callback`;

  const state = crypto.randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "public",
    state,
  });

  const stateCookie = [
    `wca_oauth_state=${state}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=600",
    ...(process.env.NODE_ENV !== "development" ? ["Secure"] : []),
  ].join("; ");
  appendSetCookie(res, stateCookie);
  res.redirect(302, `${WCA_AUTH_URL}?${params}`);
}
