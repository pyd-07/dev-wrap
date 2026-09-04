import { Users } from "lucide-react";
import { DevWrappedStats } from "@/types/github";

function Eyebrow({ children }: { children: React.ReactNode }) {
    return <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{children}</p>
}

export function MomentumCard({ overview }: { overview: DevWrappedStats['overview'] }) {
    const items = [
        [String(overview.totalPRsReviewed).padStart(2, '0'), 'PRs review provided', '+100%'],
        [String(overview.totalIssuesCreated).padStart(2, '0'), 'Issues created', '+100%'],
    ] as const;

    return (
        <section className="border border-border bg-card p-4 sm:p-8 transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-[#16161a]">
            <div className="flex items-start justify-between">
                <div>
                <Eyebrow>04 / Collaboration velocity</Eyebrow>
                <h2 className="mt-3 text-xl tracking-[-0.03em]">Shared momentum</h2>
                </div>
                <Users size={18} className="text-muted-foreground" aria-hidden="true" />
            </div>

            <div className="mt-8 grid divide-y divide-border border-y border-border">
                {items.map(([value, label, trend]) => (
                <div key={label} className="flex items-center justify-between py-5">
                    <div>
                    <div className="text-sm">{label}</div>
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground">Compared to last year</div>
                    </div>
                    <div className="flex items-center gap-5">
                    <span className="font-mono text-3xl tracking-[-0.06em]">{value}</span>
                    <span className="font-mono text-[10px] text-emerald-500">{trend}</span>
                    </div>
                </div>
                ))}
            </div>
        </section>
    )
}