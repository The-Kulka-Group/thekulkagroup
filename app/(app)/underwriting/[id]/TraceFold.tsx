import type { ReactNode } from "react";

/** A formula trace table folded closed by default, so the answers above it stay in view (LA-2055). */
export function TraceFold({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="underwriting-trace-fold">
      <summary>{title}</summary>
      {children}
    </details>
  );
}
