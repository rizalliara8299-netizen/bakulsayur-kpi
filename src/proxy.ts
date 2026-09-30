import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

const legacyFeaturePrefixes = [
  "/production", "/inventory", "/orders", "/attendance", "/errors",
  "/ranking", "/reports", "/employees", "/settings", "/kpi",
  "/users", "/audit", "/admin",
];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublicPwa =
    path === "/manifest.webmanifest" ||
    path === "/sw.js" ||
    path === "/offline.html" ||
    path === "/kpi-app-icon.svg" ||
    path === "/kpi-icon-192.png" ||
    path === "/kpi-icon-512.png" ||
    path === "/bakul-sayur-logo.svg";

  // PWA resources must never be redirected to auth.
  if (isPublicPwa) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const isPublicAuth = path.startsWith("/login") || path.startsWith("/register") || path.startsWith("/auth/confirm");

  if (!data?.claims && !isPublicAuth) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (data?.claims && (path.startsWith("/login") || path.startsWith("/register"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (data?.claims && legacyFeaturePrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
