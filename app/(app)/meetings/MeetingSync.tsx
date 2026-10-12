"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// LA-2280: there is no Sync button. Opening the page pulls in any meeting
// Fireflies' webhook missed, at most once every ten minutes per browser, and
// refreshes the list when something new arrived.

const KEY = "kulka-meetings-synced-at";
const EVERY_MS = 10 * 60 * 1000;

export function MeetingSync() {
  const router = useRouter();
  useEffect(() => {
    let last = 0;
    try {
      last = Number(localStorage.getItem(KEY)) || 0;
    } catch {}
    if (Date.now() - last < EVERY_MS) return;
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {}
    fetch("/api/meetings/sync", { method: "POST", body: "{}" })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { added?: number } | null) => {
        if (result?.added) router.refresh();
      })
      .catch(() => {});
  }, [router]);
  return null;
}
