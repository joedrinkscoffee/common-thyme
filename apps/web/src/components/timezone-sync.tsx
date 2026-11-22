"use client";

import { useEffect } from "react";
import { saveTimezone } from "@/app/chef-actions";

/** Saves this browser's time zone once per visit, so reminder emails come at 7 PM / 9 AM local time. */
export function TimezoneSync() {
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return;
    try {
      if (sessionStorage.getItem("ct-tz") === tz) return;
      sessionStorage.setItem("ct-tz", tz);
    } catch {
      // Storage blocked: saving again is harmless.
    }
    void saveTimezone(tz);
  }, []);
  return null;
}
