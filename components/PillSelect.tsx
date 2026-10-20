"use client";

import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";

import { Chevron } from "@/components/ButtonMarks";
import "./pill-select.css";

// LA-2862. One choice from a list, as a pill with a chevron (LA-2413) in place
// of the browser's select. A pick applies at once. Inside a form, `name` keeps
// the value in a hidden input and `submitOnChange` sends the form, so filters
// stay in the URL. Long lists get a filter box at the top.

export type PillOption = { value: string; label: string };

export function PillSelect({
  label,
  value,
  options,
  onChange,
  name,
  submitOnChange = false,
  searchable = false,
  disabled = false,
  wide = false,
}: {
  /** What the control chooses, for screen readers: "Status", "Project". */
  label: string;
  value: string;
  options: PillOption[];
  onChange?: (value: string) => void;
  name?: string;
  submitOnChange?: boolean;
  searchable?: boolean;
  disabled?: boolean;
  /** Fill the width of its cell, as a filter does. */
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const id = useId();

  const current = options.find((one) => one.value === value) ?? options[0];
  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? options.filter((one) => one.label.toLowerCase().includes(term)) : options;
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    (searchable ? field.current : list.current)?.focus();
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, searchable]);

  // Keep the active row in view as the arrow keys move it.
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function show() {
    setQuery("");
    setActive(Math.max(0, options.findIndex((one) => one.value === value)));
    setOpen(true);
  }

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) button.current?.focus();
  }

  function pick(next: PillOption | undefined) {
    if (!next) return;
    close(true);
    if (next.value === value) return;
    if (hidden.current) hidden.current.value = next.value;
    onChange?.(next.value);
    if (submitOnChange) hidden.current?.form?.requestSubmit();
  }

  function onKey(event: KeyboardEvent) {
    const last = shown.length - 1;
    if (event.key === "ArrowDown") setActive((at) => (at >= last ? 0 : at + 1));
    else if (event.key === "ArrowUp") setActive((at) => (at <= 0 ? last : at - 1));
    else if (event.key === "Home") setActive(0);
    else if (event.key === "End") setActive(last);
    else if (event.key === "Enter") pick(shown[active]);
    else if (event.key === "Escape") close(true);
    else if (event.key === "Tab") close(false);
    else return;
    if (event.key !== "Tab") event.preventDefault();
  }

  return (
    <div className={wide ? "ps ps--wide" : "ps"} ref={root}>
      {name ? <input ref={hidden} type="hidden" name={name} value={value} readOnly /> : null}
      <button
        ref={button}
        type="button"
        className="btn btn--menu ps-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={`${label}: ${current?.label ?? ""}`}
        disabled={disabled}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={(event) => {
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !open) {
            event.preventDefault();
            show();
          }
        }}
      >
        <span className="ps-value">{current?.label}</span>
        <Chevron />
      </button>
      {open ? (
        <div className="popover ps-pop">
          {searchable ? (
            <input
              ref={field}
              className="input ps-filter"
              type="search"
              placeholder={`Find a ${label}`}
              aria-label={`Find a ${label}`}
              aria-controls={`${id}-list`}
              aria-activedescendant={shown[active] ? `${id}-${active}` : undefined}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onKey}
            />
          ) : null}
          <ul
            ref={list}
            id={`${id}-list`}
            className="ps-list"
            role="listbox"
            aria-label={label}
            tabIndex={searchable ? -1 : 0}
            aria-activedescendant={!searchable && shown[active] ? `${id}-${active}` : undefined}
            onKeyDown={searchable ? undefined : onKey}
          >
            {shown.length === 0 ? <li className="ps-empty">Nothing matches.</li> : null}
            {shown.map((one, index) => (
              <li
                key={one.value}
                id={`${id}-${index}`}
                data-index={index}
                role="option"
                aria-selected={one.value === value}
                className={index === active ? "ps-opt is-active" : "ps-opt"}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(one)}
              >
                <span>{one.label}</span>
                {one.value === value ? (
                  <svg viewBox="0 0 16 16" aria-hidden="true" className="ps-tick">
                    <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
