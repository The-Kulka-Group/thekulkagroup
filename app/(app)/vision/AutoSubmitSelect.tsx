"use client";

import type { ComponentProps } from "react";

type Props = Omit<ComponentProps<"select">, "onChange">;

/** Select filters apply as soon as the choice changes. */
export function AutoSubmitSelect(props: Props) {
  return (
    <select
      {...props}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
    />
  );
}
