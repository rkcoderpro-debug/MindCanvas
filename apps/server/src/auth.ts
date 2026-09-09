import type { NextFunction, Request, Response } from "express";
import { config, hasSupabase, supabaseKey } from "./config.js";

declare global { namespace Express { interface Request { userId?: string; } } }

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!hasSupabase) { req.userId = "demo-user"; return next(); }
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Missing Supabase session." });
  try {
    const response = await fetch(`${config.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: supabaseKey!, Authorization: `Bearer ${token}` } });
    if (!response.ok) return res.status(401).json({ error: "Invalid Supabase session." });
    const user = await response.json() as { id?: string };
    if (!user.id) return res.status(401).json({ error: "Session has no user id." });
    req.userId = user.id; next();
  } catch { return res.status(503).json({ error: "Unable to validate session." }); }
}
