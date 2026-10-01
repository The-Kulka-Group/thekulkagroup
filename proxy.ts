import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { authConfiguration, verifiedAllowedEmail } from "@/lib/auth/policy";
import {
  AUTH_SECURITY_HEADERS,
  PUBLISHED_BUDGET_HEADERS,
  isAuthRoute,
  isPublicAuthRoute,
  isPublishedBudgetAsset,
  isPublishedBudgetRoute,
  publishedPdfRoute,
} from "@/lib/auth/routes";

function protectAuthResponse(response: NextResponse) {
  Object.entries(AUTH_SECURITY_HEADERS).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}

/** LA-1417: a published budget link, open to anyone who has it, before any auth handling. */
function publishedBudgetResponse(request: NextRequest) {
  const pdf = publishedPdfRoute(request.nextUrl.pathname);
  let response: NextResponse;
  if (pdf) {
    const url = request.nextUrl.clone();
    url.pathname = pdf;
    response = NextResponse.rewrite(url);
  } else {
    response = NextResponse.next({ request });
  }
  Object.entries(PUBLISHED_BUDGET_HEADERS).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}

export async function proxy(request: NextRequest) {
  if (isPublishedBudgetRoute(request.nextUrl.pathname)) {
    return publishedBudgetResponse(request);
  }
  if (isPublishedBudgetAsset(request.nextUrl.pathname)) {
    return NextResponse.next({ request });
  }
  if (process.env.KULKA_AUTH_OPEN === "1") {
    if (request.nextUrl.pathname === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }
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

  const publicAuthRoute = isPublicAuthRoute(request.nextUrl.pathname);
  const authRoute = isAuthRoute(request.nextUrl.pathname);
  const authorized = browserTest
    ? browserTestState !== "signed-out" && browserTestState !== "forbidden"
    : Boolean(user && configured && verifiedAllowedEmail(user, configured.allowedEmails));
  if (!authorized && !publicAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    const redirectResponse = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return protectAuthResponse(redirectResponse);
  }
  if (authRoute) {
    return protectAuthResponse(response);
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
