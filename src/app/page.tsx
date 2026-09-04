'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Share2, ArrowRight, Code2, Flame, GitPullRequest, GitCommitHorizontal, Sparkles } from 'lucide-react'

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{children}</p>
}

function FeatureCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-[#16161a] ${className}`}>
      {children}
    </section>
  )
}

export default function LandingPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    router.push(`/${searchQuery.trim().toLowerCase()}`)
  }

  const handleQuickSelect = (handle: string) => {
    router.push(`/${handle}`)
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground selection:bg-emerald-500 selection:text-zinc-950">
      <div className="mx-auto max-w-[1320px] px-4 py-5 sm:px-8 lg:px-12 lg:py-8 space-y-12">
        
        {/* Top NavBar */}
        <nav className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
          <div className="font-mono text-xs font-semibold tracking-[0.14em]">
            DEVWRAPPED <span className="text-muted-foreground">// 2026</span>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <form onSubmit={handleSearchSubmit} className="flex h-9 items-center gap-2 border border-border px-3 text-muted-foreground focus-within:border-foreground">
              <Search size={14} aria-hidden="true" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search username"
                className="min-w-0 w-full bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground sm:w-44"
              />
            </form>

            <button
              type="button"
              onClick={() => router.push('/pyd-07')}
              className="group flex h-9 items-center justify-center gap-2 border border-border px-3 font-mono text-[10px] uppercase tracking-[0.12em] transition-all hover:border-emerald-500/60 hover:bg-emerald-500/10 hover:shadow-[0_0_18px_rgba(16,185,129,0.12)] cursor-pointer"
            >
              <Share2 size={13} aria-hidden="true" /> View Demo <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          </div>
        </nav>

        {/* Main Landing Hero */}
        <section className="grid gap-8 border-b border-border pb-12 pt-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:gap-16 lg:py-16">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 border border-emerald-500/30 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-400">
              <Sparkles size={12} className="animate-pulse" />
              <span>Annual Developer Intelligence Audit</span>
            </div>

            <h1 className="text-4xl font-medium tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              Your year in code, <br />
              <span className="text-muted-foreground">distilled & audited.</span>
            </h1>

            <p className="max-w-xl text-base text-muted-foreground leading-relaxed">
              DevWrapped connects directly to your GitHub activity to calculate byte-accurate language breakdowns, 52-week streak consistency matrix, pull request efficiency, and team collaboration velocity.
            </p>

            {/* Central Search Form */}
            <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row items-stretch gap-3 pt-2 max-w-lg">
              <div className="flex h-12 items-center gap-3 border border-border px-4 text-muted-foreground focus-within:border-foreground flex-1">
                <Search size={16} aria-hidden="true" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter GitHub handle (e.g. pyd-07)"
                  className="w-full bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>

              <button
                type="submit"
                disabled={!searchQuery.trim()}
                className="flex h-12 items-center justify-center gap-2 border border-border bg-foreground px-6 font-mono text-xs uppercase tracking-[0.14em] text-background transition-all hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
              >
                <span>Unwrap</span>
                <ArrowRight size={14} />
              </button>
            </form>

            {/* Quick Handles */}
            <div className="pt-2 flex flex-wrap items-center gap-2 text-xs font-mono text-muted-foreground">
              <span>Try auditing:</span>
              {['pyd-07', 'torvalds', 'gaearon', 'sundercai'].map((handle) => (
                <button
                  key={handle}
                  type="button"
                  onClick={() => handleQuickSelect(handle)}
                  className="border border-border px-2 py-0.5 hover:border-zinc-500 hover:text-foreground transition cursor-pointer"
                >
                  @{handle}
                </button>
              ))}
            </div>
          </div>

          {/* Minimalist Executive Preview Box */}
          <div className="border border-border bg-card p-6 space-y-6 font-mono text-xs">
            <Eyebrow>Executive Summary Sample</Eyebrow>
            <div className="space-y-4 border-y border-border py-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Audit Target:</span>
                <span className="text-foreground font-bold">@pyd-07</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Primary Stack:</span>
                <span className="text-emerald-400">TypeScript (52.4%)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Merge Rate:</span>
                <span className="text-foreground">60.6% Efficiency</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Longest Streak:</span>
                <span className="text-foreground">13 Consecutive Days</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Cached instantly with Upstash Redis TLS & evaluated with zero API key configuration required.
            </p>
          </div>
        </section>

        {/* Feature Breakdown Grid */}
        <div className="grid gap-5 lg:grid-cols-3">
          <FeatureCard>
            <div className="flex items-start justify-between">
              <Eyebrow>01 / Analytics</Eyebrow>
              <Code2 size={18} className="text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg tracking-[-0.03em]">Byte-Accurate Stack</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Aggregates raw repository language byte sizes across your entire account into concise composition metrics.
            </p>
          </FeatureCard>

          <FeatureCard>
            <div className="flex items-start justify-between">
              <Eyebrow>02 / Consistency</Eyebrow>
              <Flame size={18} className="text-emerald-500" />
            </div>
            <h3 className="mt-4 text-lg tracking-[-0.03em]">Timezone-Aware Streaks</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Evaluates calendar contribution activity using backward and forward passes to guarantee active daily streak precision.
            </p>
          </FeatureCard>

          <FeatureCard>
            <div className="flex items-start justify-between">
              <Eyebrow>03 / Efficiency</Eyebrow>
              <GitPullRequest size={18} className="text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg tracking-[-0.03em]">Pull Request Merge Rate</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Calculates your pull request merge velocity alongside issue creation and code review contribution ratios.
            </p>
          </FeatureCard>
        </div>

        {/* Footer */}
        <footer className="flex flex-col gap-2 border-t border-border pt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:flex-row sm:justify-between">
          <span>DevWrapped // 2026 Engine</span>
          <span className="flex items-center gap-2">
            <GitCommitHorizontal size={12} aria-hidden="true" /> Built for developers
          </span>
        </footer>

      </div>
    </main>
  )
}