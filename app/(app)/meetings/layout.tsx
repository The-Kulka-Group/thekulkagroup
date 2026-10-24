import type { ReactNode } from "react";

import { ToolGate } from "@/components/access/ToolGate";

// LA-3047: every page in this folder opens only as far as the viewer's level for "meetings".
export default function Layout({ children }: { children: ReactNode }) {
  return <ToolGate tool="meetings">{children}</ToolGate>;
}
