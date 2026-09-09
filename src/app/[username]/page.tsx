import { DevWrappedStats } from "@/types/github";
import { EditorialDashboard } from "@/components/editorial-dashboard";
import { RetryButton, BackLink } from "@/components/user-page-actions";
import { getDevWrappedStats } from "@/lib/github";
import { auditLockKey, normalizeUsername } from "@/lib/audit";
import redis from "@/lib/redis";

// Stats are cache-keyed per user; this route must never be statically
// prerendered. CDN caching (s-maxage / stale-while-revalidate) is applied to
// the HTML response in proxy.ts — response headers cannot be mutated from a
// Server Component because next/headers is readonly.
export const dynamic = "force-dynamic";

function FallbackCard({
  title,
  message,
  username,
  tone,
  showRetry,
}: {
  title: string;
  message: string;
  username: string;
  tone: "amber" | "rose";
  showRetry: boolean;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center font-mono text-xs px-4">
      <div className="border border-zinc-800/50 bg-zinc-950 px-8 py-8 space-y-4 max-w-md text-center">
        <p
          className={`uppercase tracking-[0.18em] ${
            tone === "rose" ? "text-rose-500" : "text-amber-500"
          }`}
        >
          {title}
        </p>
        <p className="text-muted-foreground leading-relaxed">
          {username ? `@${username}: ${message}` : message}
        </p>
        <div className="flex items-center justify-center gap-4 pt-2">
          <BackLink />
          {showRetry && <RetryButton />}
        </div>
      </div>
    </div>
  );
}

export default async function WrappedUserPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = await params;
  const username = normalizeUsername(resolvedParams.username);

  // 1. Cache HIT: the whole dashboard is painted server-side in the same
  // round trip that delivers the HTML — no shell, no hydrate-then-fetch.
  let stats: DevWrappedStats | null = null;
  try {
    stats = await getDevWrappedStats(username);
  } catch {
    stats = null;
  }

  if (stats) {
    return <EditorialDashboard stats={stats} />;
  }

  // 2. Cache MISS: distinguish "audit still running" from "never audited".
  let isProcessing = false;
  try {
    isProcessing = Boolean(await redis?.get(auditLockKey(username)));
  } catch {
    isProcessing = false;
  }

  if (isProcessing) {
    return (
      <FallbackCard
        username={username}
        title="AUDIT IN PROGRESS"
        message="Compiling this handle's DevWrapped stats right now. Give it a moment, then retry."
        tone="amber"
        showRetry
      />
    );
  }

  return (
    <FallbackCard
      username={username}
      title="USER NOT FOUND OR AUDIT INCOMPLETE"
      message="No audited stats exist for this handle yet. Run an audit from the search page to generate them."
      tone="amber"
      showRetry={false}
    />
  );
}
