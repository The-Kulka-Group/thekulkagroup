import { describe, expect, it, vi } from "vitest";
import { AutoSubmitSelect } from "./AutoSubmitSelect";

describe("AutoSubmitSelect", () => {
  it("submits its form when the choice changes", () => {
    const requestSubmit = vi.fn();
    const element = AutoSubmitSelect({ name: "applicationType" });

    element.props.onChange({ currentTarget: { form: { requestSubmit } } });

    expect(requestSubmit).toHaveBeenCalledOnce();
  });
});
