import Link from "next/link";

import { Sheet, Sep } from "@/components/Sheet";
import { authIsOpen, authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { readImpactData, readParameterHistory } from "@/lib/rom/parameters";

import { ParametersScreen } from "./ParametersScreen";
import "./parameters.css";

export const dynamic = "force-dynamic";

// LA-866: every engine parameter, its history, and a place to change it. The
// history and the saved runs the impact panel recomputes are read here; the
// screen computes everything else in the browser through the engine.

export default async function EngineParametersPage() {
  const auth = await authorizeRequest();
  const db = getDb();
  const [history, impact] = auth.ok
    ? await Promise.all([readParameterHistory(db), readImpactData(db)])
    : [[], { runs: [], snapshots: {} }];
  const openAccess = authIsOpen();

  return (
    <Sheet
      number="R-140"
      title="Engine Parameters"
      actions={
        <Link className="btn btn--secondary" href="/rom">
          Back to the Conceptual Budget
        </Link>
      }
      meta={
        <>
          <span>Every ROM reads these. A change applies to the next run. Saved runs keep the values they used.</span>
          {openAccess ? (
            <>
              <Sep />
              <span className="pm-who">
                <span className="pm-dot pm-dot--changed" />
                Sign-in is off. Changes are recorded as open-access.
              </span>
            </>
          ) : null}
        </>
      }
    >
      {auth.ok ? (
        <ParametersScreen history={history} impact={impact} />
      ) : (
        <p className="pm-muted">Sign in to see the engine parameters.</p>
      )}
    </Sheet>
  );
}
