/**
 * The Thursday and Sunday check-in emails. Plain HTML with inline styles so
 * it renders the same in Gmail, Apple Mail and Outlook.
 */
import { dayName, shortDate, weekRangeLabel } from "./dates";
import { ACTION_LABEL, type CheckInAction } from "./check-in";

export type ReminderDinner = { id: string; date: string; title: string };

export type ReminderEmail = { subject: string; html: string; text: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function reminderActions(kind: "thursday" | "sunday"): CheckInAction[] {
  // On Sunday the week is over, so "later this week" doesn't apply.
  return kind === "thursday" ? ["cooked", "later", "next_week", "skip"] : ["cooked", "next_week", "skip"];
}

export function buildReminderEmail(opts: {
  kind: "thursday" | "sunday";
  firstName: string | null;
  weekStart: string;
  dinners: ReminderDinner[];
  link: (dinnerId: string, action: CheckInAction) => string;
  homeUrl: string;
}): ReminderEmail {
  const { kind, dinners } = opts;
  const n = dinners.length;
  const hi = opts.firstName ? `Hi ${opts.firstName},` : "Hi,";
  const subject =
    kind === "thursday"
      ? n === 1
        ? `Did you make ${dinners[0].title}?`
        : `Quick check-in: ${n} meals this week`
      : n === 1
        ? `Before I plan next week: did you make ${dinners[0].title}?`
        : `Before I plan next week: did you make these ${n}?`;
  const intro =
    kind === "thursday"
      ? `Here's what's still unmarked from this week. Tap what happened and I'll keep the plan honest.`
      : `I'm about to plan next week. Tap what happened to these. Anything you don't mark, I'll carry into next week first, while the fresh things are still good.`;
  const actions = reminderActions(kind);

  const button = (href: string, label: string, primary: boolean) =>
    `<a href="${esc(href)}" style="display:inline-block;margin:0 6px 8px 0;padding:9px 14px;border:2px solid #1F1A17;border-radius:999px;` +
    `background:${primary ? "#E0442F" : "#FFFFFF"};color:${primary ? "#FFFFFF" : "#1F1A17"};font-weight:700;font-size:14px;text-decoration:none">${esc(label)}</a>`;

  const rows = dinners
    .map(
      (d) =>
        `<tr><td style="padding:14px 16px;border:2px solid #1F1A17;border-radius:16px;background:#FFFFFF">` +
        `<div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#6B625B">${esc(dayName(d.date).toUpperCase())} · ${esc(shortDate(d.date))}</div>` +
        `<div style="margin:4px 0 10px;font-size:18px;font-weight:800;color:#1F1A17">${esc(d.title)}</div>` +
        actions.map((a, i) => button(opts.link(d.id, a), ACTION_LABEL[a], i === 0)).join("") +
        `</td></tr><tr><td style="height:12px"></td></tr>`,
    )
    .join("");

  const html =
    `<!doctype html><html><body style="margin:0;padding:0;background:#FFF8EC">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8EC"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:Inter,Helvetica,Arial,sans-serif;color:#1F1A17">` +
    `<tr><td style="padding-bottom:6px;font-size:22px;font-weight:800">Chef · Common Thyme</td></tr>` +
    `<tr><td style="padding-bottom:4px;font-size:13px;color:#6B625B">Week of ${esc(weekRangeLabel(opts.weekStart))}</td></tr>` +
    `<tr><td style="padding:14px 0 18px;font-size:16px;line-height:1.5">${esc(hi)}<br>${esc(intro)}</td></tr>` +
    rows +
    `<tr><td style="padding-top:6px;font-size:14px;line-height:1.5;color:#6B625B">One tap does it, with no sign-in, and you can undo it after. ` +
    `Or <a href="${esc(opts.homeUrl)}" style="color:#1F1A17;font-weight:700">open Chef</a> to sort it out there.</td></tr>` +
    `</table></td></tr></table></body></html>`;

  const text = [
    hi,
    intro,
    "",
    ...dinners.flatMap((d) => [
      `${dayName(d.date)}, ${shortDate(d.date)}: ${d.title}`,
      ...actions.map((a) => `  ${ACTION_LABEL[a]}: ${opts.link(d.id, a)}`),
      "",
    ]),
    `Open Chef: ${opts.homeUrl}`,
  ].join("\n");

  return { subject, html, text };
}
