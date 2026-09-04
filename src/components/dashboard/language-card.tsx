import { Code2 } from "lucide-react";
import { LanguageMetric } from "@/types/github";

function Eyebrow({ children }: { children: React.ReactNode }) {
    return <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{children}</p>;
}

export function LanguageCard({ languages }: { languages: LanguageMetric[] }) {
    const formatBytes = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        const kb = bytes / 1024;
        if (kb < 1024) return `${kb.toFixed(1)} KB`;
        const mb = kb / 1024;
        if (mb < 1024) return `${mb.toFixed(1)} MB`;
        const gb = mb / 1024;
        return `${gb.toFixed(2)} GB`;
    }

    return (
        <section className="border border-border bg-card p-4 sm:p-8 transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-[#16161a]">
            <div className="flex items-start justify-between">
                <div>
                <Eyebrow>01 / Language composition</Eyebrow>
                <h2 className="mt-3 text-xl tracking-[-0.03em]">Where the bytes went</h2>
                </div>
                <Code2 size={18} className="text-muted-foreground" aria-hidden="true" />
            </div>

            <div className="mt-10 hidden h-3 w-full overflow-hidden bg-secondary sm:flex" aria-label="Language composition chart">
                {languages.map((language) => (
                <div key={language.name} style={{ width: `${language.percentage}%`, backgroundColor: language.color }} title={`${language.name}: ${language.percentage}%`} />
                ))}
            </div>

            <div className="mt-8 flex flex-col gap-4 sm:hidden">
                {languages.map((language) => (
                <div key={language.name} className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-3">
                    <span className="truncate text-xs">{language.name}</span>
                    <div className="h-2 overflow-hidden bg-secondary">
                    <div className="h-full" style={{ width: `${language.percentage}%`, backgroundColor: language.color }} />
                    </div>
                    <span className="text-right font-mono text-[10px]">{language.percentage}%</span>
                </div>
                ))}
            </div>

            <div className="mt-8 hidden grid-cols-2 gap-x-6 gap-y-5 sm:grid">
                {languages.map((language) => (
                <div key={language.name} className="flex items-start gap-3">
                    <span className="mt-1.5 size-2 shrink-0 rounded-sm" style={{ backgroundColor: language.color }} />
                    <div className="min-w-0">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span>{language.name}</span>
                        <span className="font-mono text-xs">{language.percentage}%</span>
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground">{formatBytes(language.size)}</div>
                    </div>
                </div>
                ))}
            </div>
        </section>
    )
}