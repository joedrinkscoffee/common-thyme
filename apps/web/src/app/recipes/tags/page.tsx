import { redirect } from "next/navigation";

/** Tags moved to Settings. */
export default function TagsPage() {
  redirect("/settings/tags");
}
