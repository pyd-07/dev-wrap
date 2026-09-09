import { ArrowUpRight } from "lucide-react";
import { StreakMetric } from "@/types/github";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}

export function StreakCard({ streak }: { streak: StreakMetric }) {
  // Older cached reports do not have daily points yet; do not invent a chart.
  const chartDays = (streak.contributions ?? []).slice(-28);
  const maxDailyContributions = Math.max(
    1,
    ...chartDays.map((day) => day.count),
  );

  return (
    <section className="border border-border bg-card p-4 sm:p-8 transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-[#16161a]">
      <div className="flex items-start justify-between">
        <div>
          <Eyebrow>02 / Consistency matrix</Eyebrow>
          <h2 className="mt-3 text-xl tracking-[-0.03em]">Streak & activity</h2>
        </div>
        <ArrowUpRight
          size={18}
          className="text-emerald-500"
          aria-hidden="true"
        />
      </div>

      <div className="mt-8 flex gap-5 sm:gap-10">
        <div>
          <div className="font-mono text-4xl tracking-[-0.08em] sm:text-5xl">
            {streak.longestStreak}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Longest streak <span className="font-mono">/ days</span>
          </div>
        </div>
        <div className="border-l border-border pl-10">
          <div className="font-mono text-5xl tracking-[-0.08em]">
            {String(streak.currentStreak).padStart(2, "0")}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Current streak <span className="font-mono">/ days</span>
          </div>
        </div>
      </div>

      <div className="mt-10 border-t border-border pt-5">
        <div className="mb-3 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
          <span>Total Contributions</span>
          <span>{streak.totalContributions} units</span>
        </div>

        {chartDays.length > 0 ? (
          <>
            <svg
              viewBox="0 0 280 64"
              className="h-16 w-full overflow-visible"
              role="img"
              aria-label="Daily contributions for the last 28 days"
            >
              <title>Daily contributions for the last 28 days</title>
              <line x1="0" x2="280" y1="63.5" y2="63.5" stroke="currentColor" opacity="0.2" />
              {chartDays.map((day, index) => {
                const height = day.count === 0
                  ? 2
                  : Math.max(4, (day.count / maxDailyContributions) * 60);
                const x = index * 10 + 1;

                return (
                  <g key={day.date}>
                    <title>{`${day.date}: ${day.count} contribution${day.count === 1 ? "" : "s"}`}</title>
                    <rect
                      x={x}
                      y={63 - height}
                      width="8"
                      height={height}
                      rx="1"
                      className={day.count > 0 ? "fill-emerald-500" : "fill-zinc-800"}
                    />
                  </g>
                );
              })}
            </svg>
            <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
              <span>{chartDays[0].date}</span>
              <span>Last 28 days</span>
              <span>{chartDays.at(-1)?.date}</span>
            </div>
          </>
        ) : (
          <p className="py-5 text-xs text-muted-foreground">
            Daily contribution data will appear after the next audit.
          </p>
        )}
      </div>
    </section>
  );
}
