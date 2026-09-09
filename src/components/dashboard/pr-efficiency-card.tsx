import { GitPullRequest } from "lucide-react";
import { PRMetric } from "@/types/github";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}

export function PREfficiencyCard({ pullRequests }: { pullRequests: PRMetric }) {
  const stateCounts = [
    [pullRequests.merged, "Merged", "text-emerald-400"],
    [pullRequests.closed, "Closed", "text-rose-400"],
    [pullRequests.open, "Open", "text-indigo-400"],
  ] as const;
  // Cached audit payloads generated before this field existed remain usable
  // until their TTL expires.
  const mergedOrganizations = pullRequests.mergedOrganizations ?? [];
  const organizationChips = mergedOrganizations.slice(0, 6);
  const remainingOrganizations = mergedOrganizations.length - organizationChips.length;

  return (
    <section className="border border-border bg-card p-4 sm:p-8 transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-[#16161a]">
      <div className="flex items-start justify-between">
        <div>
          <Eyebrow>03 / Pull requests</Eyebrow>
          <h2 className="mt-3 text-xl tracking-[-0.03em]">Merge rate</h2>
        </div>
        <GitPullRequest
          size={18}
          className="text-muted-foreground"
          aria-hidden="true"
        />
      </div>

      <div className="mt-7 flex items-end gap-3">
        <span className="font-mono text-6xl tracking-[-0.1em]">
          {pullRequests.mergeRate}
        </span>
        <span className="mb-2 font-mono text-xl text-emerald-500">%</span>
      </div>

      <div className="mt-8 grid grid-cols-3 divide-x divide-border border-t border-border pt-5">
        {stateCounts.map(([value, label, tone]) => (
          <div key={label} className="px-4 first:pl-0">
            <div className={`font-mono text-xl ${tone}`}>{String(value).padStart(2, "0")}</div>
            <div className={`mt-2 text-xs ${tone} opacity-80`}>{label}</div>
          </div>
        ))}
      </div>

      {organizationChips.length > 0 && (
        <div className="mt-6 border-t border-border pt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Merged into organizations
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {organizationChips.map((organization) => (
              <span
                key={organization.login}
                className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-mono text-[10px] text-emerald-300"
              >
                {organization.login} <span className="text-emerald-100">{organization.count}</span>
              </span>
            ))}
            {remainingOrganizations > 0 && (
              <span className="rounded-full border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground">
                +{remainingOrganizations} more
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
