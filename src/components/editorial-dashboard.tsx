"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toPng } from "html-to-image";
import { DevWrappedStats } from "@/types/github";
import { useAuditStatus } from "@/hooks/useAuditStatus";
import { NavBar } from "./dashboard/nav-bar";
import { UserHero } from "./dashboard/user-hero";
import { LanguageCard } from "./dashboard/language-card";
import { StreakCard } from "./dashboard/streak-card";
import { PREfficiencyCard } from "./dashboard/pr-efficiency-card";
import { MomentumCard } from "./dashboard/momentum-card";

import { GitCommitHorizontal } from "lucide-react";
import { formatFetchedAt } from "@/lib/format";

export function EditorialDashboard({
  stats,
  isRefreshing = false,
  refreshError = null,
}: {
  stats: DevWrappedStats;
  isRefreshing?: boolean;
  refreshError?: string | null;
}) {
  const router = useRouter();
  const [isExporting, setIsExporting] = useState(false);
  const [refreshRequested, setRefreshRequested] = useState(false);
  const { status, error, startAudit, activeUsername, completedUsername } =
    useAuditStatus();

  // `isRefreshing` comes from the server-rendered lock state; a refresh started
  // from this dashboard is tracked locally. Both mean "this user's audit is
  // running while the cached report stays on screen".
  const isRefreshingCurrent = isRefreshing || status === "REFRESHING";

  useEffect(() => {
    if (status !== "COMPLETED" || !completedUsername) return;

    // Refreshing the dashboard we are already on: re-render the server
    // component so the newly completed report replaces the cached one.
    if (completedUsername === stats.user.login.toLowerCase()) {
      router.refresh();
      return;
    }

    router.push(`/${encodeURIComponent(completedUsername)}`);
  }, [completedUsername, router, stats.user.login, status]);

  const handleExportPng = async () => {
    const node = document.getElementById("dashboard-export");
    if (!node) return;

    try {
      setIsExporting(true);
      const dataUrl = await toPng(node, {
        cacheBust: true,
        backgroundColor: "#09090b",
        pixelRatio: 2,
        style: {
          padding: "32px",
          margin: "0",
          width: "100%",
        },
      });

      const link = document.createElement("a");
      link.download = `devwrapped-${stats.user.login}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error("Error exporting PNG:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSearch = (username: string) => {
    setRefreshRequested(false);
    // View intent: the API returns a cached report immediately when one
    // exists, and only enqueues an audit when the handle has no report yet.
    startAudit(username);
  };

  const handleRefresh = () => {
    setRefreshRequested(true);
    startAudit(stats.user.login, { refresh: true });
  };

  const refreshFailure =
    refreshRequested && status === "FAILED" ? error : null;
  const refreshBannerError = refreshFailure ?? refreshError;

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground selection:bg-emerald-500 selection:text-zinc-950">
      <div className="mx-auto max-w-[1320px] px-4 py-5 sm:px-8 lg:px-12 lg:py-8 space-y-5">
        <NavBar
          onExport={handleExportPng}
          isExporting={isExporting}
          onSearch={handleSearch}
          onRefresh={handleRefresh}
          status={status}
          error={error}
          activeUsername={activeUsername}
          currentUsername={stats.user.login}
        />
        {(isRefreshingCurrent || refreshBannerError) && (
          <div
            className={`border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] ${
              isRefreshingCurrent
                ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                : "border-rose-500/40 bg-rose-500/10 text-rose-400"
            }`}
          >
            {isRefreshingCurrent
              ? `Refreshing audit… showing the report from ${formatFetchedAt(stats.fetchedAt)}`
              : `${refreshBannerError} Showing the report from ${formatFetchedAt(stats.fetchedAt)}.`}
          </div>
        )}
        <div
          id="dashboard-export"
          className="space-y-5 bg-[#09090b] p-6 sm:p-8 border border-zinc-800/50"
        >
          <UserHero stats={stats} isRefreshing={isRefreshingCurrent} />
          <div className="grid gap-5 lg:grid-cols-2">
            <LanguageCard languages={stats.languages} />
            <StreakCard streak={stats.streak} />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <PREfficiencyCard pullRequests={stats.pullRequests} />
            <MomentumCard overview={stats.overview} />
          </div>

          <footer className="flex flex-col gap-2 border-t border-border pt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:flex-row sm:justify-between">
            <span>Generated for @{stats.user.login}</span>
            <span className="flex items-center gap-2">
              <GitCommitHorizontal size={12} aria-hidden="true" /> A year in
              commits
            </span>
          </footer>
        </div>
      </div>
    </main>
  );
}
