import { ArrowUpRight } from "lucide-react";
import { StreakMetric } from "@/types/github";

function Eyebrow({ children }: { children: React.ReactNode }) {
    return <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{children}</p>;
}

export function StreakCard({ streak }: { streak: StreakMetric }) {
    return (
        <section className="border border-border bg-card p-4 sm:p-8 transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-[#16161a]">
            <div className="flex items-start justify-between">
                <div>
                <Eyebrow>02 / Consistency matrix</Eyebrow>
                <h2 className="mt-3 text-xl tracking-[-0.03em]">Streak & activity</h2>
                </div>
                <ArrowUpRight size={18} className="text-emerald-500" aria-hidden="true" />
            </div>

            <div className="mt-8 flex gap-5 sm:gap-10">
                <div>
                <div className="font-mono text-4xl tracking-[-0.08em] sm:text-5xl">{streak.longestStreak}</div>
                <div className="mt-2 text-xs text-muted-foreground">Longest streak <span className="font-mono">/ days</span></div>
                </div>
                <div className="border-l border-border pl-10">
                <div className="font-mono text-5xl tracking-[-0.08em]">{String(streak.currentStreak).padStart(2, '0')}</div>
                <div className="mt-2 text-xs text-muted-foreground">Current streak <span className="font-mono">/ days</span></div>
                </div>
            </div>

            <div className="mt-10 border-t border-border pt-5">
                <div className="mb-3 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                <span>Total Contributions</span>
                <span>{streak.totalContributions} units</span>
                </div>

                <div className="flex items-end space-x-1 h-12 pt-2">
                {Array.from({ length: 40 }).map((_, i) => (
                    <div
                    key={i}
                    className="flex-1 rounded-t-sm bg-emerald-500/20 hover:bg-emerald-400 transition"
                    style={{ height: `${Math.max(15, (i * 7 + 13) % 100)}%` }}
                    />
                ))}
                </div>
            </div>
            </section>
    )
}