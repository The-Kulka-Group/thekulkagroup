"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { useCanEdit } from "@/components/access/ToolLevel";

import { bumpReviewEpoch } from "./review-epoch";
import type { ReviewSectionKey, UnderwritingReview } from "@/lib/underwriting/presentation";

// LA-2054. The Needs Your Review list: calculation issues on top, then one row per input, grouped by section.
// Each group is a native details element, so it starts collapsed and opens from the keyboard with Enter or Space.

export function ReviewList({ caseId, caseRevision, review }: { caseId: string; caseRevision: number; review: UnderwritingReview }) {
  const router = useRouter();
  const canEdit = useCanEdit();
  const [saving, setSaving] = useState<ReviewSectionKey | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [refreshing, startRefresh] = useTransition();
  const awaiting = useRef<ReviewSectionKey | undefined>(undefined);

  // The refreshed page has arrived when the transition ends. Only then do the editors mount again.
  useEffect(() => {
    if (!refreshing && awaiting.current) {
      bumpReviewEpoch(awaiting.current);
      awaiting.current = undefined;
    }
  }, [refreshing]);

  async function markDone(section: ReviewSectionKey) {
    setSaving(section);
    setError(undefined);
    try {
      const response = await fetch(`/api/underwriting/cases/${caseId}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: caseRevision, section }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => undefined) as { error?: string } | undefined;
        setError(response.status === 409
          ? "The project changed in another session. Refresh the page, then try again."
          : body?.error ?? "The section could not be marked done.");
        return;
      }
      awaiting.current = section;
      startRefresh(() => router.refresh());
    } catch {
      setError("The section could not be marked done. Check the connection and try again.");
    } finally {
      setSaving(undefined);
    }
  }

  return (
    <>
      {review.calculation.length > 0 ? (
        <div className="underwriting-issues">
          {review.calculation.map((item) => (
            <div className={`underwriting-issue underwriting-issue--${item.severity}`} key={item.id}>
              <span className="dot" aria-hidden="true" />
              <span>{item.message}</span>
            </div>
          ))}
        </div>
      ) : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="underwriting-review-groups">
        {review.groups.map((group) => (
          <div className="underwriting-review-group" key={group.key}>
            <details>
              <summary>
                <span className="underwriting-review-title">{group.title}</span>
                <span className="chip chip--neutral"><span className="dot" /><span className="num">{group.rows.length}</span> need review</span>
              </summary>
              <div className="underwriting-issues">
                {group.rows.map((row) => (
                  <div className="underwriting-issue underwriting-issue--waiting" key={row.id}>
                    <span className="dot" aria-hidden="true" />
                    <span>{row.message}</span>
                  </div>
                ))}
              </div>
            </details>
            {group.workingCount > 0 && canEdit ? (
              <button
                type="button"
                className="btn btn--secondary"
                disabled={saving !== undefined}
                aria-label={`Mark ${group.title} Done`}
                onClick={() => void markDone(group.key)}
              >
                {saving === group.key ? "Saving" : "Mark Section Done"}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}
