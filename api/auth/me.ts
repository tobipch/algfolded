import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCurrentUser } from "../_lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const user = await getCurrentUser(req);
    res.status(200).json({ user });
  } catch (err) {
    console.error("auth/me error:", err);
    res.status(500).json({ error: "Internal error" });
  }
}
