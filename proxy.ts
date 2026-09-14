import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { authConfiguration, normalizeEmail } from "@/lib/auth/policy";

function protectAuthResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("CDN-Cache-Control", "no-store");
  response.headers.set("Vercel-CDN-Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function proxy(request: NextRequest) {
  const browserTest = process.env.NODE_ENV !== "production" && process.env.KULKA_BROWSER_TEST === "1";
  const browserTestState = request.cookies.get("kulka-test-auth")?.value;
  let response = NextResponse.next({ request });
  const configured = authConfiguration(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.KULKA_AUTH_ALLOWED_EMAILS,
  );
  let user = null;

  if (configured && !browserTest) {
    const supabase = createServerClient(
      configured.url,
      configured.publishableKey,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (items, headers) => {
            items.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
            Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
          },
        },
      },
    );
    const result = await supabase.auth.getUser();
    user = result.data.user;
  }

  const isPublicAuthRoute = request.nextUrl.pathname === "/login"
    || request.nextUrl.pathname === "/forgot-password"
    || request.nextUrl.pathname === "/auth/continue";
  const isAuthPage = isPublicAuthRoute || request.nextUrl.pathname === "/update-password";
  const authorized = browserTest
    ? browserTestState !== "signed-out" && browserTestState !== "forbidden"
    : Boolean(user?.email && configured?.allowedEmails.has(normalizeEmail(user.email)));
  if (!authorized && !isPublicAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    const redirectResponse = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return protectAuthResponse(redirectResponse);
  }
  if (isAuthPage) {
    return protectAuthResponse(response);
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
