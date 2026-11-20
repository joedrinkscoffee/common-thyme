/**
 * Supabase settings from the environment. Both values are safe to expose to
 * the browser; row-level security is what protects the data.
 * Returns null until the project is configured, so the app can still render
 * its sample week.
 */
export function supabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}
