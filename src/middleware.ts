import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Handle OAuth callback directly in middleware so the session cookies
  // can be written to the redirect response (Server Components cannot).
  if (request.nextUrl.pathname === "/auth/callback") {
    const code = request.nextUrl.searchParams.get("code");
    const err = request.nextUrl.searchParams.get("error");
    const errDesc = request.nextUrl.searchParams.get("error_description");

    if (err) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?error=${encodeURIComponent(errDesc ?? err)}`;
      return NextResponse.redirect(url);
    }
    if (!code) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "?error=no_code";
      return NextResponse.redirect(url);
    }

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?error=${encodeURIComponent(error.message)}`;
      // Preserve any cookies that were cleared during the failed exchange
      const errResponse = NextResponse.redirect(url);
      response.cookies.getAll().forEach((c) => errResponse.cookies.set(c.name, c.value));
      return errResponse;
    }

    const dest = request.nextUrl.clone();
    dest.pathname = "/dashboard";
    dest.search = "";
    const redirectResponse = NextResponse.redirect(dest);
    // Copy the session cookies set by exchangeCodeForSession onto the redirect response
    response.cookies.getAll().forEach((c) => redirectResponse.cookies.set(c));
    return redirectResponse;
  }

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|icon.png).*)"],
};
