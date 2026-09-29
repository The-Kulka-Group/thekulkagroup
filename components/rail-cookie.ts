/** LA-1330: the cookie that remembers Keep Open. The app layout reads it so a
 *  pinned rail renders pinned on the first paint instead of jumping open.
 *  It lives outside Rail.tsx because a server component cannot read a plain
 *  value out of a "use client" module. */
export const RAIL_COOKIE = "kulka-rail";
