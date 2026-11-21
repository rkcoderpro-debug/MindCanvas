import type { NextFunction, Request, Response } from "express";
import { config, hasSupabase, supabaseKey } from "./config.js";

declare global { namespace Express { interface Request { userId?: string; userEmail?: string; accessToken?: string; } } }

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  // Protected PDF/AI routes must fail closed. Otherwise a production deploy
  // missing its Supabase variables could expose the server-side provider quota.
  if (!hasSupabase) return res.status(503).json({ error: "Supabase authentication is not configured." });
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Missing Supabase session." });
  try {
    const response = await fetch(`${config.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: supabaseKey!, Authorization: `Bearer ${token}` } });
    if (!response.ok) return res.status(401).json({ error: "Invalid Supabase session." });
    const user = await response.json() as { id?: string; email?: string };
    if (!user.id) return res.status(401).json({ error: "Session has no user id." });
    req.userId = user.id; req.userEmail = user.email; req.accessToken = token; next();
  } catch { return res.status(503).json({ error: "Unable to validate session." }); }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!config.ADMIN_EMAIL || !config.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: "Admin service is not configured." });
  return requireUser(req, res, () => {
    if ((req.userEmail ?? "").trim().toLocaleLowerCase() !== config.ADMIN_EMAIL!.trim().toLocaleLowerCase()) {
      return res.status(403).json({ error: "Admin access is required." });
    }
    return next();
  });
}
