"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { DevWrappedStats } from "@/types/github";
import { EditorialDashboard } from "@/components/editorial-dashboard";

const ZERO_OVERVIEW = {
  totalContributions: 0,
  totalCommits: 0,
  totalPRsCreated: 0,
  totalPRsReviewed: 0,
  totalIssuesCreated: 0,
};

const ZERO_STREAK = {
  currentStreak: 0,
  longestStreak: 0,
  totalContributions: 0,
};

const ZERO_PRS = {
  total: 0,
  merged: 0,
  closed: 0,
  open: 0,
  mergeRate: 0,
};

interface WrappedResponse {
  status?: string;
  message?: string;
  error?: string;
  data?: unknown;
}

/** Fill gaps in partial worker payloads so the dashboard never dereferences undefined. */
function normalizeStats(raw: unknown): DevWrappedStats | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<DevWrappedStats>;
  if (!s.user || typeof s.user.login !== "string") return null;

  return {
    user: {
      name: s.user.name ?? s.user.login,
      login: s.user.login,
      avatarUrl: s.user.avatarUrl ?? "",
      bio: s.user.bio ?? null,
      followers: s.user.followers ?? 0,
      following: s.user.following ?? 0,
    },
    overview: { ...ZERO_OVERVIEW, ...(s.overview ?? {}) },
    languages: Array.isArray(s.languages) ? s.languages : [],
    streak: { ...ZERO_STREAK, ...(s.streak ?? {}) },
    pullRequests: { ...ZERO_PRS, ...(s.pullRequests ?? {}) },
    fetchedAt:
      typeof s.fetchedAt === "string" ? s.fetchedAt : new Date().toISOString(),
  };
}

export default function WrappedUserPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;

  const [stats, setStats] = useState<DevWrappedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isSubscribed = true;

    // Fetch the user's stats
    async function fetchStats() {
      try {
        setLoading(true);
        setNotice(null);
        setError(null);

        const res = await fetch("/api/wrapped/" + encodeURIComponent(username));
        const json: WrappedResponse | null = await res
          .json()
          .catch(() => null);

        if (!isSubscribed) return;

        if (res.status === 202) {
          // Audit still running — recoverable state, not an error
          setNotice(json?.message || "Audit in progress. Check back shortly.");
          setStats(null);
          return;
        }

        if (!res.ok || json?.status === "NOT_FOUND" || !json?.data) {
          throw new Error(
            json?.message || json?.error || "User not found or audit incomplete"
          );
        }

        const normalized = normalizeStats(json.data);
        if (!normalized) {
          throw new Error("Received malformed stats for this user");
        }

        setStats(normalized);
        setNotice(null);
      } catch (err) {
        if (!isSubscribed) return;
        setError(
          err instanceof Error ? err.message : "An unknown error occurred"
        );
        setStats(null);
      } finally {
        if (isSubscribed) setLoading(false);
      }
    }

    fetchStats();

    return () => {
      isSubscribed = false;
    };
  }, [username]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center font-mono text-xs">
        <span className="animate-pulse">
          COMPILING DEVWRAPPED FOR @{username.toUpperCase()}...
        </span>
      </div>
    );
  }

  if (error || !stats) {
    const isPending = !error && Boolean(notice);
    const title = error
      ? "ERROR"
      : "USER NOT FOUND OR AUDIT INCOMPLETE";
    const message =
      error ??
      (isPending
        ? notice
        : "No audited stats exist for this handle yet. Run an audit from the search page to generate them.");

    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center font-mono text-xs px-4">
        <div className="border border-zinc-800/50 bg-zinc-950 px-8 py-8 space-y-4 max-w-md text-center">
          <p
            className={`uppercase tracking-[0.18em] ${
              error ? "text-rose-500" : "text-amber-500"
            }`}
          >
            {title}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {error ? `@${username}: ${message}` : message}
          </p>
          <div className="flex items-center justify-center gap-4 pt-2">
            <Link href="/" className="text-emerald-500 underline">
              Return to search
            </Link>
            {isPending && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="text-muted-foreground underline"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return <EditorialDashboard stats={stats} />;
}
