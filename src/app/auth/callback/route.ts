import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";

  // Handle error passed back from Supabase
  const errorParam = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  if (errorParam) {
    console.error("[auth/callback] Supabase error:", errorParam, errorDescription);
    return NextResponse.redirect(
      `${url.origin}/login?error=${encodeURIComponent(errorDescription ?? errorParam)}`
    );
  }

  if (code) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${url.origin}${next}`);
    }

    console.error("[auth/callback] exchange error:", error);
    return NextResponse.redirect(`${url.origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(`${url.origin}/login?error=no_code`);
}
