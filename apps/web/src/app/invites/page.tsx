import { redirect } from "next/navigation";

/** Invites moved into the Admin page. */
export default function OldInvitesPage() {
  redirect("/admin/invites");
}
