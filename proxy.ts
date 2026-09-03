import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { authConfiguration, normalizeEmail, temporaryAuthBypass } from "@/lib/auth/policy";

export async function proxy(request: NextRequest) {
  // LA-173: remove KULKA_AUTH_BYPASS from Vercel and redeploy to restore LA-13.
  if (temporaryAuthBypass(process.env.KULKA_AUTH_BYPASS)) {
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
          setAll: (items) => {
            items.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          },
        },
      },
    );
    const result = await supabase.auth.getUser();
    user = result.data.user;
  }

  const isLogin = request.nextUrl.pathname === "/login";
  const authorized = browserTest
    ? browserTestState !== "signed-out" && browserTestState !== "forbidden"
    : Boolean(user?.email && configured?.allowedEmails.has(normalizeEmail(user.email)));
  if (!authorized && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
