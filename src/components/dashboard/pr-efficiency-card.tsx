import { GitPullRequest } from 'lucide-react';
import { PRMetric } from '@/types/github';

function Eyebrow({ children }: { children: React.ReactNode }) {
    return <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{children}</p>
}

export function PREfficiencyCard({ pullRequests }: { pullRequests: PRMetric }) {
    const stats = [
        [String(pullRequests.merged).padStart(2, '0'), 'Merged', 'text-emerald-400'],
        [String(pullRequests.closed).padStart(2, '0'), 'Closed', 'text-rose-400'],
        [String(pullRequests.open).padStart(2, '0'), 'Open', 'text-indigo-400']
    ] as const;

    return (
        <section className="border border-border bg-card p-4 sm:p-8 transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-[#16161a]">
            <div className="flex items-start justify-between">
                <div>
                <Eyebrow>03 / Pull request efficiency</Eyebrow>
                <h2 className="mt-3 text-xl tracking-[-0.03em]">Merge rate</h2>
                </div>
                <GitPullRequest size={18} className="text-muted-foreground" aria-hidden="true" />
            </div>

            <div className="mt-7 flex items-end gap-3">
                <span className="font-mono text-6xl tracking-[-0.1em]">{pullRequests.mergeRate}</span>
                <span className="mb-2 font-mono text-xl text-emerald-500">%</span>
            </div>

            <div className="mt-8 grid grid-cols-3 divide-x divide-border border-t border-border pt-5">
                {stats.map(([value, label, tone]) => (
                <div key={label} className="px-4 first:pl-0">
                    <div className={`font-mono text-xl ${tone}`}>{value}</div>
                    <div className={`mt-2 text-xs ${tone} opacity-80`}>{label}</div>
                </div>
                ))}
            </div>
        </section>
    )
}
