import Link from "next/link";

import { Sheet, Sep } from "@/components/Sheet";

import { CaseIntake } from "../CaseIntake";

export default function NewUnderwritingCasePage() {
  return (
    <Sheet
      number="U-NEW"
      title="New Underwriting Project"
      actions={<Link className="btn btn--secondary" href="/underwriting">Cancel</Link>}
      meta={
        <>
          <span>Ground-up multifamily</span>
          <Sep />
          <span>Internal Working Record</span>
        </>
      }
    >
      <CaseIntake />
    </Sheet>
  );
}
