import { STATUS_LABEL, type Status } from "@/lib/data";

// One treatment for every state: a bright tint, a Phosphor state glyph, and an
// ink label. Because the glyph differs per state, status survives greyscale.
export function StatusBlock({ status }: { status: Status }) {
  return (
    <span className={`status-block status-block--${status}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Chip({ status }: { status: Status }) {
  const kind = status === "open" ? "neutral" : status;
  return (
    <span className={`chip chip--${kind}`}>
      <span className="dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}
