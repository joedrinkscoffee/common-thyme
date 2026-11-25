import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanCode } from "@/lib/access-links";

/**
 * Where an invite link sends people after Google sign-in. Puts their Google
 * email on the access list (the database checks the link), then opens Chef.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/join/[code]/claim">) {
  const code = cleanCode((await ctx.params).code);
  const origin = request.nextUrl.origin;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return NextResponse.redirect(new URL(`/join/${code}`, origin));

  const { error } = await supabase.rpc("redeem_access_link", { link_code: code });
  if (error) {
    const back = new URL(`/join/${code}`, origin);
    back.searchParams.set("error", "invalid");
    return NextResponse.redirect(back);
  }
  return NextResponse.redirect(new URL("/", origin));
}
