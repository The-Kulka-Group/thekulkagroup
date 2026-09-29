// LA-1336. A budget is a document Kulka hands a developer, so it names the
// person who recorded or corrected something, never their full address. The
// accounts carry no display name yet, so the name is the part of the address
// before the @. While sign-in is off (KULKA_AUTH_OPEN=1) the recording
// account is the placeholder "open-access@kulka.invalid", which reads as
// "open-access". A recorder that is already a name, such as "automated test",
// is shown as it is.

export function personName(recordedBy: string): string {
  return recordedBy.split("@")[0] || recordedBy;
}
