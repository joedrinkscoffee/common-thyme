import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { runReminders } from "@/lib/reminders";

export const maxDuration = 60;

function authorized(request: Request, secret: string) {
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * The hourly check-in job. Supabase Cron calls it with the CRON_SECRET;
 * it sends each person's Thursday 7 PM and Sunday 9 AM reminder once, in
 * their own time zone.
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorized(request, secret)) return Response.json({ ok: false }, { status: 401 });
  const admin = createAdminClient();
  if (!admin || !process.env.RESEND_API_KEY) {
    return Response.json({ ok: false, error: "Set SUPABASE_SECRET_KEY and RESEND_API_KEY first." }, { status: 503 });
  }
  const report = await runReminders(admin, secret);
  if (report.errors.length) console.error("check-in reminders", report.errors);
  return Response.json({ ok: true, ...report });
}

export const GET = handle;
export const POST = handle;
