import { NextResponse, type NextRequest } from "next/server";

/**
 * This Next.js version registers edge middleware under the `proxy` convention
 * (see PROXY_FILENAME in next/dist/lib/constants.js) instead of the legacy
 * `middleware` filename.
 *
 * CDN caching policy, applied here because Server Components cannot mutate
 * response headers (next/headers is readonly):
 *
 *   - /[username] page HTML: short s-maxage with stale-while-revalidate — a
 *     repeat visit within the window is served from the CDN without invoking
 *     the app; a just-finished audit is picked up by the background SWR
 *     refresh. One round trip delivers a fully painted dashboard.
 *   - /api/wrapped/[username]: same idea for the JSON envelope.
 *   - /api/audit/status/[username]: NEVER cached — pollers must observe
 *     ENQUEUED → PROCESSING → COMPLETED transitions in real time.
 *   - /api/audit (POST), /api/health, /, /og: excluded by the branch logic.
 */
// Deliberately short: fallback HTML ("audit in progress" / "not found") is
// also cacheable at the CDN, and a user who peeked at /{username} before their
// audit finished must not keep seeing that fallback after it completes. 30s
// bounds that staleness; SWR keeps repeat visits fast in the background.
const PAGE_CACHE_CONTROL = "public, s-maxage=30, stale-while-revalidate=120";
const WRAPPED_CACHE_CONTROL = "public, s-maxage=30, stale-while-revalidate=60";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  if (pathname.startsWith("/api/wrapped/")) {
    response.headers.set("Cache-Control", WRAPPED_CACHE_CONTROL);
  } else if (
    pathname !== "/" &&
    !pathname.endsWith("/og") &&
    !pathname.startsWith("/api/")
  ) {
    // Single-segment /[username] page HTML (og image route excluded so social
    // crawlers always see fresh renders).
    response.headers.set("Cache-Control", PAGE_CACHE_CONTROL);
  }

  return response;
}

export const config = {
  matcher: ["/((?!api/audit|api/health|_next/|favicon.ico).*)"],
};
