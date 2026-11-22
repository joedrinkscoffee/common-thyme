import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/**
 * A Supabase client with the project's secret key. It skips row-level
 * security, so only the reminder job and signed email links use it, and
 * every query through it must name the household it is for.
 * Returns null until SUPABASE_SECRET_KEY is set.
 */
export function createAdminClient() {
  const env = supabaseEnv();
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env || !secret) return null;
  return createClient(env.url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
