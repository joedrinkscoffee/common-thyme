import "server-only";
import { createClient } from "@/lib/supabase/server";
import { chefCost, type Usage } from "@/lib/chef-cost";

export type AdminMember = { name: string | null; email: string; joinedAt: string; lastSignInAt: string | null };

export type AdminHousehold = {
  id: string;
  name: string;
  createdAt: string;
  members: AdminMember[];
  recipes: number;
  mealsPlanned: number;
  chefToday: number;
  chefWeek: number;
  chefMonth: number;
  /** Rough Anthropic spend for the last 30 days, in dollars. */
  costMonth: number;
  lastActive: string | null;
};

type Row = {
  id: string;
  name: string;
  created_at: string;
  members: { name: string | null; email: string; joined_at: string; last_sign_in_at: string | null }[] | null;
  recipes: number;
  meals_planned: number;
  chef_today: number;
  chef_week: number;
  chef_month: number;
  usage_month: Usage | null;
  last_active: string | null;
};

/** Every household, as counts and dates. The database returns nothing unless the caller is an admin. */
export async function loadAdminHouseholds(): Promise<AdminHousehold[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_households");
  if (error) {
    console.error("admin households", error.message);
    return [];
  }
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    members: (r.members ?? []).map((m) => ({ name: m.name, email: m.email, joinedAt: m.joined_at, lastSignInAt: m.last_sign_in_at })),
    recipes: r.recipes,
    mealsPlanned: r.meals_planned,
    chefToday: r.chef_today,
    chefWeek: r.chef_week,
    chefMonth: r.chef_month,
    costMonth: chefCost(r.usage_month),
    lastActive: r.last_active,
  }));
}

export const DEFAULT_CHEF_DAILY_LIMIT = 80;

/** Messages one household can send Chef in 24 hours. Set on the Admin page. */
export async function chefDailyLimit(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("chef_daily_limit").maybeSingle();
  return data?.chef_daily_limit ?? DEFAULT_CHEF_DAILY_LIMIT;
}
