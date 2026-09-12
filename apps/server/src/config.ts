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
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
  GEMINI_MODELS: z.string().optional(),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(25000),
  GEMINI_RETRIES_PER_MODEL: z.coerce.number().int().min(0).max(3).default(1),
  GEMINI_TOTAL_TIMEOUT_MS: z.coerce.number().int().min(10000).max(180000).default(120000),
  GEMINI_RETRY_BASE_MS: z.coerce.number().int().min(100).max(10000).default(1000),
  AI_MAX_CONCURRENT: z.coerce.number().int().min(1).max(8).default(2),
  AI_MAX_QUEUE: z.coerce.number().int().min(1).max(100).default(20),
  AI_MAX_QUEUE_PER_USER: z.coerce.number().int().min(1).max(10).default(2),
  AI_QUEUE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  MAX_DOCUMENT_BYTES: z.coerce.number().default(10 * 1024 * 1024),
});

export const config = envSchema.parse(process.env);
export const supabaseKey = config.SUPABASE_PUBLISHABLE_KEY ?? config.SUPABASE_ANON_KEY;
export const hasSupabase = Boolean(config.SUPABASE_URL && supabaseKey);
