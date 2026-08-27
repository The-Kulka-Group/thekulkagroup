import type { MetadataRoute } from "next";

// The app is on the open internet with no login, so crawlers are told to stay
// out. This is a request, not a lock: anyone holding the link still sees the
// site. Added 2026-08-26.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
