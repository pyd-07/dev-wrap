"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Share2,
  ArrowRight,
  Code2,
  Flame,
  GitPullRequest,
  GitCommitHorizontal,
  Sparkles,
  Loader2,
  Terminal,
  AlertCircle,
} from "lucide-react";
import { useAuditStatus } from "@/hooks/useAuditStatus";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}

function FeatureCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-[#16161a] ${className}`}
    >
      {children}
    </section>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const { status, data, error, startAudit, completedUsername } = useAuditStatus();

  // Handle Form Submission: Trigger async audit via hook
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const handle = searchQuery.trim().toLowerCase();
    if (!handle) return;
    startAudit(handle);
  };

  // Handle Quick Select Buttons
  const handleQuickSelect = (handle: string) => {
    setSearchQuery(handle);
    startAudit(handle);
  };

  // Auto-navigate to user route once Go engine completes task
  useEffect(() => {
    if (status === "COMPLETED" && completedUsername) {
      router.push(`/${encodeURIComponent(completedUsername)}`);
    }
  }, [status, completedUsername, router]);

  const isProcessing = status === "ENQUEUED" || status === "PROCESSING";

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground selection:bg-emerald-500 selection:text-zinc-950">
      <div className="mx-auto max-w-[1320px] px-4 py-5 sm:px-8 lg:px-12 lg:py-8 space-y-12">
        {/* Top NavBar */}
        <nav className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
          <div className="font-mono text-xs font-semibold tracking-[0.14em]">
            DEVWRAPPED <span className="text-muted-foreground">{"// 2026"}</span>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <form
              onSubmit={handleSearchSubmit}
              className="flex h-9 items-center gap-2 border border-border px-3 text-muted-foreground focus-within:border-foreground"
            >
              <Search size={14} aria-hidden="true" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search username"
                disabled={isProcessing}
                className="min-w-0 w-full bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground sm:w-44 disabled:opacity-50"
              />
            </form>

            <button
              type="button"
              onClick={() => handleQuickSelect("pyd-07")}
              className="group flex h-9 items-center justify-center gap-2 border border-border px-3 font-mono text-[10px] uppercase tracking-[0.12em] transition-all hover:border-emerald-500/60 hover:bg-emerald-500/10 hover:shadow-[0_0_18px_rgba(16,185,129,0.12)] cursor-pointer"
            >
              <Share2 size={13} aria-hidden="true" /> View Demo{" "}
              <ArrowRight
                size={13}
                className="transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </button>
          </div>
        </nav>

        {/* Main Landing Hero */}
        <section className="grid gap-8 border-b border-border pb-12 pt-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:gap-16 lg:py-16">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 border border-emerald-500/30 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-400">
              <Sparkles size={12} className="animate-pulse" />
              <span>Annual Developer Intelligence Audit</span>
            </div>

            <h1 className="text-4xl font-medium tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              Your year in code, <br />
              <span className="text-muted-foreground">
                distilled & audited.
              </span>
            </h1>

            <p className="max-w-xl text-base text-muted-foreground leading-relaxed">
              DevWrapped connects directly to your GitHub activity to calculate
              byte-accurate language breakdowns, 52-week streak consistency
              matrix, pull request activity, and team collaboration metrics.
            </p>

            {/* Central Search Form */}
            <form
              onSubmit={handleSearchSubmit}
              className="flex flex-col sm:flex-row items-stretch gap-3 pt-2 max-w-lg"
            >
              <div className="flex h-12 items-center gap-3 border border-border px-4 text-muted-foreground focus-within:border-foreground flex-1">
                <Search size={16} aria-hidden="true" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter GitHub handle (e.g. pyd-07)"
                  disabled={isProcessing}
                  className="w-full bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
                />
              </div>

              <button
                type="submit"
                disabled={!searchQuery.trim() || isProcessing}
                className="flex h-12 items-center justify-center gap-2 border border-border bg-foreground px-6 font-mono text-xs uppercase tracking-[0.14em] text-background transition-all hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Auditing</span>
                  </>
                ) : (
                  <>
                    <span>Unwrap</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </form>

            {/* Terminal Ingestion Log Overlay */}
            {isProcessing && (
              <div className="max-w-lg border border-border bg-card/90 p-4 font-mono text-xs space-y-2">
                <div className="flex items-center gap-2 border-b border-border pb-2 text-[10px] uppercase text-muted-foreground">
                  <Terminal size={12} className="text-emerald-400" />
                  <span>Go Engine Pipeline Ingestion</span>
                </div>
                <div className="space-y-1 text-emerald-400">
                  <p>► Enqueued job to Redis: queue:github-audit</p>
                  <p className="text-foreground animate-pulse">
                    ► Executing GitHub v4 GraphQL AST query...
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Calculating streaks, repository languages, and PR metrics...
                  </p>
                </div>
              </div>
            )}

            {/* Failure Alert */}
            {status === "FAILED" && (
              <div className="max-w-lg border border-red-500/40 bg-red-500/10 p-3 font-mono text-xs text-red-400 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>
                  {error ||
                    "Audit execution failed on worker. Please try again."}
                </span>
              </div>
            )}

            {/* Quick Handles */}
            <div className="pt-2 flex flex-wrap items-center gap-2 text-xs font-mono text-muted-foreground">
              <span>Try auditing:</span>
              {["pyd-07", "torvalds", "gaearon", "sundercai"].map((handle) => (
                <button
                  key={handle}
                  type="button"
                  disabled={isProcessing}
                  onClick={() => handleQuickSelect(handle)}
                  className="border border-border px-2 py-0.5 hover:border-zinc-500 hover:text-foreground transition cursor-pointer disabled:opacity-40"
                >
                  @{handle}
                </button>
              ))}
            </div>
          </div>

          {/* Minimalist Executive Preview Box */}
          <div className="border border-border bg-card p-6 space-y-6 font-mono text-xs">
            <Eyebrow>Executive Summary Sample</Eyebrow>
            <div className="space-y-4 border-y border-border py-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Audit Target:</span>
                <span className="text-foreground font-bold">
                  {data?.user?.login ? `@${data.user.login}` : "@pyd-07"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Primary Stack:</span>
                <span className="text-emerald-400">
                  {data?.languages?.[0]
                    ? `${data.languages[0].name} (${data.languages[0].percentage}%)`
                    : "TypeScript (52.4%)"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Longest Streak:</span>
                <span className="text-foreground">
                  {data?.streak?.longestStreak !== undefined
                    ? `${data.streak.longestStreak} Consecutive Days`
                    : "13 Consecutive Days"}
                </span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Cached instantly with Redis TLS & evaluated with zero API key
              configuration required.
            </p>
          </div>
        </section>

        {/* Feature Breakdown Grid */}
        <div className="grid gap-5 lg:grid-cols-3">
          <FeatureCard>
            <div className="flex items-start justify-between">
              <Eyebrow>01 / Analytics</Eyebrow>
              <Code2 size={18} className="text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg tracking-[-0.03em]">
              Byte-Accurate Stack
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Aggregates raw repository language byte sizes across your entire
              account into concise composition metrics.
            </p>
          </FeatureCard>

          <FeatureCard>
            <div className="flex items-start justify-between">
              <Eyebrow>02 / Consistency</Eyebrow>
              <Flame size={18} className="text-emerald-500" />
            </div>
            <h3 className="mt-4 text-lg tracking-[-0.03em]">
              Timezone-Aware Streaks
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Evaluates calendar contribution activity using backward and
              forward passes to guarantee active daily streak precision.
            </p>
          </FeatureCard>

          <FeatureCard>
            <div className="flex items-start justify-between">
              <Eyebrow>03 / Pull requests</Eyebrow>
              <GitPullRequest size={18} className="text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg tracking-[-0.03em]">
              Pull Request Activity
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Summarizes pull request, issue, and code review contributions
              from your GitHub activity.
            </p>
          </FeatureCard>
        </div>

        {/* Footer */}
        <footer className="flex flex-col gap-2 border-t border-border pt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:flex-row sm:justify-between">
          <span>DevWrapped // 2026 Engine</span>
          <span className="flex items-center gap-2">
            <GitCommitHorizontal size={12} aria-hidden="true" /> Built for
            developers
          </span>
        </footer>
      </div>
    </main>
  );
}
