import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hourIn, todayIn } from "./chef/dates";
import { dueReminder, unmarked } from "./chef/check-in";
import { buildReminderEmail } from "./chef/reminder-email";
import { SupabaseChefStore } from "./chef/supabase-store";
import { signCheckIn } from "./check-in-link";

export function appUrl(): string {
  const explicit = process.env.APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

export type ReminderReport = { checked: number; sent: number; skipped: number; errors: string[] };

async function sendEmail(to: string, email: { subject: string; html: string; text: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Chef <onboarding@resend.dev>", to: [to], subject: email.subject, html: email.html, text: email.text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/**
 * Runs every hour. For each person in each household, works out their local
 * time; on Thursday from 7 PM and Sunday from 9 AM it sends that week's
 * check-in once, but only if some dinners are still unmarked.
 */
export async function runReminders(admin: SupabaseClient, secret: string, now = new Date()): Promise<ReminderReport> {
  const report: ReminderReport = { checked: 0, sent: 0, skipped: 0, errors: [] };
  const [{ data: settings, error }, { data: members }, { data: profiles }, { data: access, error: accessError }] = await Promise.all([
    admin.from("household_settings").select("household_id, timezone"),
    admin.from("household_members").select("household_id, user_id"),
    admin.from("profiles").select("id, display_name, timezone"),
    admin.from("app_access").select("email"),
  ]);
  if (error) throw new Error(`read households: ${error.message}`);
  // Invite-only: never email someone who has been taken off the access list.
  if (accessError) throw new Error(`read access list: ${accessError.message}`);
  const allowed = new Set((access ?? []).map((a) => (a.email as string).toLowerCase()));
  const profileOf = new Map((profiles ?? []).map((p) => [p.id as string, p as { display_name: string | null; timezone: string | null }]));
  const households = (settings ?? []).map((s) => ({
    id: s.household_id as string,
    timezone: (s.timezone as string) || "America/New_York",
    members: (members ?? []).filter((m) => m.household_id === s.household_id).map((m) => m.user_id as string),
  }));
  const base = appUrl();

  for (const h of households) {
    for (const userId of h.members) {
      const m = { user_id: userId };
      report.checked += 1;
      const profile = profileOf.get(userId);
      const tz = profile?.timezone || h.timezone;
      const due = dueReminder(todayIn(tz, now), hourIn(tz, now));
      if (!due) continue;

      const { data: already } = await admin
        .from("check_in_emails")
        .select("id")
        .eq("user_id", m.user_id)
        .eq("kind", due.kind)
        .eq("week_start", due.weekStart)
        .maybeSingle();
      if (already) continue;

      try {
        const store = new SupabaseChefStore(admin, h.id, m.user_id);
        const week = await store.dinners(due.weekStart, due.through);
        const left = unmarked(week, due.weekStart, due.through);
        // Claim the slot first, so two overlapping runs can't both send.
        const { error: claimError } = await admin
          .from("check_in_emails")
          .insert({ household_id: h.id, user_id: m.user_id, kind: due.kind, week_start: due.weekStart, sent: left.length > 0 });
        if (claimError) continue; // another run got it
        if (!left.length) {
          report.skipped += 1;
          continue;
        }

        const { data: user } = await admin.auth.admin.getUserById(m.user_id);
        const to = user?.user?.email;
        if (!to || !allowed.has(to.toLowerCase())) continue;
        const catalog = await store.catalog();
        const title = (id: string) => catalog.find((r) => r.id === id)?.title ?? "A dinner";
        const email = buildReminderEmail({
          kind: due.kind,
          firstName: profile?.display_name?.split(" ")[0] ?? null,
          weekStart: due.weekStart,
          dinners: left.map((d) => ({ id: d.id, date: d.date, title: title(d.recipeId) })),
          link: (dinnerId, action) => `${base}/check-in?t=${signCheckIn({ dinnerId, userId: m.user_id, action }, secret, now.getTime())}`,
          homeUrl: base,
        });
        try {
          await sendEmail(to, email);
          report.sent += 1;
        } catch (e) {
          // Let the next hourly run try again.
          await admin.from("check_in_emails").delete().eq("user_id", m.user_id).eq("kind", due.kind).eq("week_start", due.weekStart);
          throw e;
        }
      } catch (e) {
        report.errors.push(e instanceof Error ? e.message : String(e));
      }
    }
  }
  return report;
}
