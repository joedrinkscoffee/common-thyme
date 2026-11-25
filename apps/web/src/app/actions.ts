"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/household";
import { requestOrigin } from "@/lib/request-origin";

export type ActionResult = { error?: string; inviteUrl?: string } | null;

export async function createHousehold(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 80) return { error: "Give your household a name (up to 80 characters)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_household", { household_name: name });
  if (error) return { error: "Couldn't create the household. Try again?" };
  refresh();
  return null;
}

export async function createInvite(): Promise<ActionResult> {
  const viewer = await getViewer();
  if (viewer.kind !== "signed-in" || !viewer.household) return { error: "Sign in and create a household first." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("household_invites")
    .insert({ household_id: viewer.household.id })
    .select("token")
    .single();
  if (error || !data) return { error: "Couldn't make an invite link. Try again?" };

  return { inviteUrl: `${await requestOrigin()}/invite/${data.token}` };
}

export async function acceptInvite(token: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_household_invite", { invite_token: token });
  if (error) return { error: "That invite has expired or was already used. Ask for a new link." };
  redirect("/");
}
