"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useCanEdit } from "@/components/access/ToolLevel";

// LA-2280: there is no Sync button. Opening the page pulls in any meeting
// Fireflies' webhook missed, at most once every ten minutes per browser, and
// refreshes the list when something new arrived. A View Only viewer skips it,
// since the sync is a write and would answer 403 (LA-3112).

const KEY = "kulka-meetings-synced-at";
const EVERY_MS = 10 * 60 * 1000;

export function MeetingSync() {
  const router = useRouter();
  const canEdit = useCanEdit();
  useEffect(() => {
    if (!canEdit) return;
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
      .then((result: { added?: number; briefed?: number } | null) => {
        if (result?.added || result?.briefed) router.refresh();
      })
      .catch(() => {});
  }, [router, canEdit]);
  return null;
}
