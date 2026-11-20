"use client";

import { useState, useTransition } from "react";
import { createInvite } from "@/app/actions";

export function InvitePartner() {
  const [pending, start] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function makeLink() {
    start(async () => {
      const result = await createInvite();
      if (result?.inviteUrl) {
        setUrl(result.inviteUrl);
        try {
          await navigator.clipboard.writeText(result.inviteUrl);
          setMessage("Copied. Send it to your partner; it works once and lasts 14 days.");
        } catch {
          setMessage("Send this link to your partner; it works once and lasts 14 days.");
        }
      } else {
        setMessage(result?.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="text-base text-muted">
      <p className="m-0">
        Your partner hasn&apos;t joined yet.{" "}
        <button type="button" onClick={makeLink} disabled={pending} className="font-semibold text-tomato-dark underline">
          {pending ? "Making a link…" : url ? "Make a new link" : "Copy an invite link"}
        </button>{" "}
        and they can ask me for things too.
      </p>
      {url && (
        <input
          readOnly
          value={url}
          aria-label="Invite link"
          onFocus={(e) => e.currentTarget.select()}
          className="mt-2 w-full rounded-full border-2 border-dash bg-paper px-4 py-2 text-sm text-ink"
        />
      )}
      <p role="status" className="mt-1 min-h-5 text-sm">
        {message}
      </p>
    </div>
  );
}
