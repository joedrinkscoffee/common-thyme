"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/household";

export type LinkResult = { ok: true; url: string } | { ok: false; error: string };

const PEOPLE = new Set([1, 5, 25]);
const DAYS = new Set([7, 14, 30]);

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/** Makes an invite link. Only admins can (row-level security checks too). */
export async function createAccessLink(input: { label: string; people: number; days: number }): Promise<LinkResult> {
  const viewer = await getViewer();
  if (viewer.kind !== "signed-in" || !viewer.isAdmin) return { ok: false, error: "Only admins can make invite links." };
  const label = input.label.trim().slice(0, 80) || null;
  const people = PEOPLE.has(input.people) ? input.people : 1;
  const days = DAYS.has(input.days) ? input.days : 14;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("access_links")
    .insert({ label, max_uses: people, expires_at: new Date(Date.now() + days * 86_400_000).toISOString() })
    .select("code")
    .single();
  if (error || !data) return { ok: false, error: "Couldn't make a link. Try again?" };
  refresh();
  return { ok: true, url: `${await origin()}/join/${data.code}` };
}

export async function revokeAccessLink(id: string): Promise<void> {
  const viewer = await getViewer();
  if (viewer.kind !== "signed-in" || !viewer.isAdmin) return;
  const supabase = await createClient();
  await supabase.from("access_links").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null);
  refresh();
}

/** Takes someone off the list. Their household's data stays, but they can't open it. */
export async function removeAccess(email: string): Promise<void> {
  const viewer = await getViewer();
  if (viewer.kind !== "signed-in" || !viewer.isAdmin) return;
  const supabase = await createClient();
  await supabase.from("app_access").delete().eq("email", email.toLowerCase());
  refresh();
}

export type LimitResult = { ok: true; limit: number } | { ok: false; error: string };

/** The most messages one household can send Chef in 24 hours. */
export async function setChefDailyLimit(limit: number): Promise<LimitResult> {
  const viewer = await getViewer();
  if (viewer.kind !== "signed-in" || !viewer.isAdmin) return { ok: false, error: "Only admins can change this." };
  const n = Math.round(Number(limit));
  if (!Number.isFinite(n) || n < 1 || n > 1000) return { ok: false, error: "Pick a number from 1 to 1,000." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_settings")
    .update({ chef_daily_limit: n, updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("chef_daily_limit")
    .single();
  if (error || !data) return { ok: false, error: "Couldn't save that. Try again?" };
  refresh();
  return { ok: true, limit: data.chef_daily_limit };
}
