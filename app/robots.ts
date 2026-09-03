import type { MetadataRoute } from "next";

// Authentication protects the app. This also asks crawlers not to index the
// login route or any page that might appear in a redirect chain.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
