import Link from "next/link";
import { DevWrappedStats } from "@/types/github";

export function UserHero({ stats }: { stats: DevWrappedStats }) {
    const metrics = [
        [stats.overview.totalContributions, "Contributions"],
        [stats.overview.totalCommits, "Commits"],
        [stats.overview.totalPRsCreated, "PRs created"],
    ] as const;

    return (
        <header className="grid gap-8 border-b border-border py-8 sm:py-10 lg:grid-cols-[1.1fr_1fr] lg:items-end lg:gap-16 lg:py-14">
            <div className="flex min-w-0 items-start gap-3 sm:gap-5">
                <div className="flex size-14 shrink-0 items-center justify-center border border-zinc-700 bg-secondary font-mono text-lg text-muted-foreground grayscale contrast-125 sm:size-24 sm:text-3xl overflow-hidden">
                {stats.user.avatarUrl ? (
                    <Link href={`https://github.com/${stats.user.login}`} target="_blank" rel="noopener noreferrer">
                        <img src={stats.user.avatarUrl} alt={stats.user.login} className="size-full object-cover" />
                    </Link>
                ) : (
                    stats.user.login.slice(0, 2).toUpperCase()
                )}
                </div>

                <div className="space-y-3">
                <div className="inline-flex border border-border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                    Annual engineering audit
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <h1 className="text-3xl font-medium tracking-[-0.04em] sm:text-5xl">{stats.user.name || stats.user.login}</h1>
                    <span className="inline-flex items-center gap-2 border border-emerald-500/30 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-emerald-400">
                    <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" /> Audit complete
                    </span>
                </div>

                <p className="font-mono text-xs text-muted-foreground">@{stats.user.login}</p>
                <p className="max-w-md text-sm leading-6 text-muted-foreground">{stats.user.bio}</p>
                </div>
            </div>

            <div className="grid grid-cols-3 divide-x divide-border border-y border-border py-4">
                {metrics.map(([value, label]) => (
                <div key={label} className="px-4 first:pl-0 last:pr-0 sm:px-6">
                    <div className="font-mono text-2xl tracking-[-0.06em] sm:text-3xl">{value}</div>
                    <div className="mt-2 text-[11px] leading-4 text-muted-foreground">{label}</div>
                </div>
                ))}
            </div>
        </header>
    )
}