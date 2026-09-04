'use client';

import { DevWrappedStats } from "@/types/github";
import { NavBar } from "./dashboard/nav-bar";
import { UserHero } from "./dashboard/user-hero";
import { LanguageCard } from "./dashboard/language-card";
import { StreakCard } from "./dashboard/streak-card";
import { PREfficiencyCard } from "./dashboard/pr-efficiency-card";
import { MomentumCard } from "./dashboard/momentum-card";

import { GitCommitHorizontal } from "lucide-react";

export  function EditorialDasboard({ stats }: { stats: DevWrappedStats }) {
    return (
        <main className="min-h-screen overflow-x-hidden bg-background text-foreground selection:bg-emerald-500 selection:text-zinc-950">
            <div className="mx-auto max-w-[1320px] px-4 py-5 sm:px-8 lg:px-12 lg:py-8 space-y-5">
                <NavBar stats={stats} />
                <UserHero stats={stats} />

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
                    <GitCommitHorizontal size={12} aria-hidden="true" /> A year in commits
                </span>
                </footer>
            </div>
        </main>
    )
}