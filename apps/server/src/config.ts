import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(8787),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  WEB_ORIGIN: z.string().url().optional(),
  EXPERIENTIAL_LABS_BASE_URL: z.string().url().optional(),
  EXPERIENTIAL_LABS_API_KEY: z.string().optional(),
  EXPERIENTIAL_LABS_MODEL: z.string().default(""),
  GEMINI_BASE_URL: z.string().url().default("https://generativelanguage.googleapis.com"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),
  MAX_DOCUMENT_BYTES: z.coerce.number().default(10 * 1024 * 1024),
});

export const config = envSchema.parse(process.env);
export const supabaseKey = config.SUPABASE_PUBLISHABLE_KEY ?? config.SUPABASE_ANON_KEY;
export const hasSupabase = Boolean(config.SUPABASE_URL && supabaseKey);
