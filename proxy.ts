import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { authConfiguration, normalizeEmail } from "@/lib/auth/policy";

export async function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== "production" && process.env.KULKA_BROWSER_TEST === "1") {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const configured = authConfiguration(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.KULKA_AUTH_ALLOWED_EMAILS,
  );
  let user = null;

  if (configured) {
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
  const authorized = Boolean(
    user?.email && configured?.allowedEmails.has(normalizeEmail(user.email)),
  );
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
