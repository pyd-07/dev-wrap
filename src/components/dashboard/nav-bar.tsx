"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Share2, ArrowRight, RotateCw } from "lucide-react";
import type { AuditStatus } from "@/hooks/useAuditStatus";

interface NavBarProps {
  onExport: () => void;
  isExporting: boolean;
  onSearch: (username: string) => void;
  onRefresh: () => void;
  status: AuditStatus;
  error: string | null;
  activeUsername: string | null;
  currentUsername?: string;
}

export function NavBar({
  onExport,
  isExporting,
  onSearch,
  onRefresh,
  status,
  error,
  activeUsername,
  currentUsername,
}: NavBarProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const isAuditing =
    status === "ENQUEUED" ||
    status === "PROCESSING" ||
    status === "REFRESHING";

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const username = searchQuery.trim().toLowerCase();
    // Searching is a "view" action: it only starts an audit when the handle has
    // no cached report yet (the API decides that).
    if (username && !isAuditing) {
      onSearch(username);
    }
  };

  return (
    <nav className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
      <button
        type="button"
        className="w-fit font-mono text-xs font-semibold tracking-[0.14em] cursor-pointer"
        onClick={() => router.push("/")}
      >
        DEVWRAPPED <span className="text-muted-foreground">{"// 2026"}</span>
      </button>

      <div className="flex flex-col gap-2 sm:items-end">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <form
            onSubmit={handleSearchSubmit}
            className="flex h-9 items-center gap-2 border border-border px-3 text-muted-foreground focus-within:border-foreground"
          >
            <Search size={14} aria-hidden="true" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isAuditing
                  ? status === "REFRESHING"
                    ? "Refreshing…"
                    : "Auditing…"
                  : "Search username"
              }
              disabled={isAuditing}
              className="min-w-0 w-full bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground sm:w-36"
            />
          </form>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isAuditing || !currentUsername}
            className="flex h-9 items-center justify-center gap-2 border border-border px-3 font-mono text-[10px] uppercase tracking-[0.12em] transition-all hover:border-amber-500/60 hover:bg-amber-500/10 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCw
              size={12}
              className={status === "REFRESHING" ? "animate-spin" : undefined}
              aria-hidden="true"
            />
            Refresh
          </button>

          <button
            onClick={onExport}
            disabled={isExporting}
            className="group flex h-9 items-center justify-center gap-2 border border-border px-3 font-mono text-[10px] uppercase tracking-[0.12em] transition-all hover:border-emerald-500/60 hover:bg-emerald-500/10 hover:shadow-[0_0_18px_rgba(16,185,129,0.12)] cursor-pointer"
          >
            <Share2 size={13} aria-hidden="true" />{" "}
            {isExporting ? "Exporting..." : "Export PNG"}{" "}
            <ArrowRight
              size={13}
              className="transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </button>
        </div>
        {isAuditing && (
          <p
            className={`font-mono text-[10px] ${
              status === "REFRESHING" ? "text-amber-400" : "text-emerald-400"
            }`}
          >
            {status === "REFRESHING" ? "Refreshing" : "Auditing"}
            {activeUsername ? ` @${activeUsername}` : ""}…
          </p>
        )}
        {status === "FAILED" && (
          <p className="max-w-64 font-mono text-[10px] text-rose-400">
            {error ?? "Could not start audit. Try again."}
          </p>
        )}
      </div>
    </nav>
  );
}
