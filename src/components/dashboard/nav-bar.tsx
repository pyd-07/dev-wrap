"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Share2, ArrowRight } from "lucide-react";
import { useAuditStatus } from "@/hooks/useAuditStatus";

interface NavBarProps {
  onExport: () => void;
  isExporting: boolean;
}

export function NavBar({ onExport, isExporting }: NavBarProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const { status, error, startAudit, completedUsername } = useAuditStatus();
  const isAuditing = status === "ENQUEUED" || status === "PROCESSING";

  useEffect(() => {
    if (status === "COMPLETED" && completedUsername) {
      router.push(`/${encodeURIComponent(completedUsername)}`);
    }
  }, [completedUsername, router, status]);

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const username = searchQuery.trim().toLowerCase();
    if (username) {
      startAudit(username);
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
              placeholder={isAuditing ? "Auditing…" : "Search username"}
              disabled={isAuditing}
              className="min-w-0 w-full bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground sm:w-36"
            />
          </form>

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
          <p className="font-mono text-[10px] text-emerald-400">
            Auditing @{searchQuery.trim().toLowerCase()}…
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
