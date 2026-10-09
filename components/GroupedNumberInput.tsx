"use client";

import { useLayoutEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { caretAfterFormat, countSignificant, formatGroupedNumber, parseGroupedNumber } from "@/lib/format/grouped-number";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange" | "min" | "max" | "step"> & {
  /** Controlled: the plain number. Leave it out and pass defaultValue for a field read through FormData. */
  value?: number | string | null;
  defaultValue?: number | string | null;
  /** Receives the plain number as text ("2557800", "12.5", or ""), never the separators. */
  onValueChange?: (plain: string) => void;
};

// A text input that groups thousands as you type. While it has focus it holds what was typed, so "12." stays "12."
// after the caller turns the text into a number. The caret is put back after the same digits on each keystroke.
// A name goes on a hidden input that carries the plain number, so a form never submits the separators.
export function GroupedNumberInput({ value, defaultValue, onValueChange, onBlur, name, ...input }: Props) {
  const [own, setOwn] = useState(String(defaultValue ?? ""));
  const [draft, setDraft] = useState<string | null>(null);
  const element = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const plain = value === undefined ? own : String(value ?? "");
  const shown = draft ?? formatGroupedNumber(plain);

  useLayoutEffect(() => {
    if (caret.current !== null && element.current) {
      element.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [draft]);

  return (
    <>
      <input
        {...input}
        ref={element}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={shown}
        onChange={(event) => {
          const next = parseGroupedNumber(event.target.value);
          if (next === undefined) return;
          const formatted = formatGroupedNumber(next);
          caret.current = caretAfterFormat(formatted, countSignificant(event.target.value, event.target.selectionStart ?? event.target.value.length));
          setDraft(formatted);
          setOwn(next);
          onValueChange?.(next);
        }}
        onBlur={(event) => {
          setDraft(null);
          onBlur?.(event);
        }}
      />
      {name ? <input type="hidden" name={name} value={plain} /> : null}
    </>
  );
}
