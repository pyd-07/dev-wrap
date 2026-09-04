'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DevWrappedStats } from "@/types/github";
import { Search, Share2, ArrowRight } from "lucide-react";

export function NavBar({ stats }: { stats: DevWrappedStats}) {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');

    const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            router.push(`/${encodeURIComponent(searchQuery)}`);
        }
    };

    function exportReport() {
        const report = `DEVWRAPPED // 2026\n${stats.user.name} (${stats.user.login})\n\n` +
            `${stats.overview.totalContributions} contributions | `+
            `${stats.overview.totalCommits} commits | `+
            `${stats.overview.totalPRsCreated} PRs created | `+
            `Longest streak: ${stats.streak.longestStreak} days | `+
            `Current streak: ${stats.streak.currentStreak} days | ` +
            `Merge rate: ${stats.pullRequests.mergeRate}%`;
        const blob = new Blob([report], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${stats.user.login}_devwrapped_report.txt`;
        anchor.click();
        URL.revokeObjectURL(url);
    }

    return (
        <nav className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
            <div className="font-mono text-xs font-semibold tracking-[0.14em]"
                onClick={() => router.push('/')}
                onMouseOver={(e) => (e.currentTarget.style.cursor = 'pointer')}
            >
                DEVWRAPPED <span className="text-muted-foreground">// 2026</span>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <form onSubmit={handleSearchSubmit} className="flex h-9 items-center gap-2 border border-border px-3 text-muted-foreground focus-within:border-foreground">
                <Search size={14} aria-hidden="true" />
                <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search username"
                    className="min-w-0 w-full bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground sm:w-36"
                />
                </form>

                <button
                onClick={exportReport}
                className="group flex h-9 items-center justify-center gap-2 border border-border px-3 font-mono text-[10px] uppercase tracking-[0.12em] transition-all hover:border-emerald-500/60 hover:bg-emerald-500/10 hover:shadow-[0_0_18px_rgba(16,185,129,0.12)] cursor-pointer"
                >
                <Share2 size={13} aria-hidden="true" /> Export report <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </button>
            </div>
        </nav>
    )
}