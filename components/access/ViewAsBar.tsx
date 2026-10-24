"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { startViewAs, stopViewAs } from "@/app/(app)/view-as-actions";

// LA-3047. The dark bar across the top while an Owner views the app as someone
// else, and the button that starts it.

export function ViewAsBar({ name, roleName, kind }: { name: string; roleName: string; kind: "person" | "role" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="view-as-bar" role="status">
      <span>
        <b>Viewing As {name}</b>
        {kind === "person" ? ` (${roleName})` : " (Role)"}. Kulka shows only what {kind === "person" ? "they" : "this role"} can open.
      </span>
      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={() => startTransition(async () => { await stopViewAs(); router.refresh(); })}
      >
        Switch Back
      </button>
    </div>
  );
}

export function ViewAsButton({ value, label, className = "btn btn--secondary" }: { value: string; label: string; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await startViewAs(value);
          if (result.ok) router.push("/");
        })
      }
    >
      {label}
    </button>
  );
}
