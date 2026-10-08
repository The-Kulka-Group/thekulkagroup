/** The message beside a Save button names the first field that failed, so nobody hunts a long form for it (LA-1944). */
export function saveMessage(lead: string, issues: ReadonlyArray<{ message: string }>) {
  return issues.length > 0 ? `${lead} ${issues[0].message}` : lead;
}
