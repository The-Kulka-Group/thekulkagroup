// LA-2412 and LA-2413: the marks that sit inside a button. The go button's
// arrow disc, and the chevron on a control that opens a list.

export function GoArrow() {
  return (
    <span className="btn-go-arrow" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.25 15.5a.75.75 0 0 1-.75-.75V7.56L7.28 17.78a.75.75 0 0 1-1.06-1.06L16.44 6.5H9.25a.75.75 0 0 1 0-1.5h9a.75.75 0 0 1 .75.75v9a.75.75 0 0 1-.75.75Z" />
      </svg>
    </span>
  );
}

export function Chevron({ className = "btn-chev" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className}>
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
