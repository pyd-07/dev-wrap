# Architecture

## Overview

DevWrapped is a Next.js application that turns a GitHub username into a compact developer activity dashboard. The application has four main responsibilities:

1. Accept a GitHub username from the landing page.
2. Retrieve the user's GitHub profile, contribution, repository-language, pull-request, and review data through GitHub GraphQL.
3. Transform the raw GraphQL response into a small, UI-oriented metrics object.
4. Render those metrics as an editorial dashboard and allow the dashboard to be exported as a PNG.

A Redis cache sits between the API route and GitHub so repeated requests for the same username normally avoid another GitHub API call.

## Request flow

```text
Browser
  |
  | GET /<username>
  v
Next.js dynamic route
src/app/[username]/page.tsx
  |
  | fetch('/api/wrapped/<username>')
  v
Route handler
src/app/api/wrapped/[username]/route.ts
  |
  +--------------------------+
  |                          |
  | Redis GET                | cache miss
  v                          v
Cached DevWrappedStats   GitHub GraphQL
                               |
                               v
                         processGithubMetrics()
                               |
                               v
                         DevWrappedStats
                               |
                               v
                          Redis SETEX
                               |
                               v
                         JSON response
  |
  v
EditorialDasboard
  |
  +--> UserHero
  +--> LanguageCard
  +--> StreakCard
  +--> PREfficiencyCard
  +--> MomentumCard
  |
  +--> html-to-image PNG export
```

## Application structure

| Path | Responsibility |
| --- | --- |
| `src/app/page.tsx` | Landing page, username input, demo shortcuts, feature overview |
| `src/app/[username]/page.tsx` | Dynamic user page; fetches dashboard data and handles loading/error states |
| `src/app/api/wrapped/[username]/route.ts` | Server-side API endpoint, validation, Redis cache, GitHub fetch, response handling |
| `src/lib/github.ts` | GitHub GraphQL client and query definition |
| `src/lib/metrics.ts` | Converts raw GitHub data into application metrics |
| `src/lib/redis.ts` | Shared ioredis connection and environment-based connection settings |
| `src/types/github.ts` | Raw GraphQL and processed metric TypeScript contracts |
| `src/components/editorial-dasboard.tsx` | Dashboard composition and PNG export |
| `src/components/dashboard/*` | Individual dashboard cards and navigation |
| `next.config.ts` | Enables the React compiler and standalone production output |
| `Dockerfile` | Multi-stage production image |
| `docker-compose.yml` | Local/compose deployment with web + Redis services |

## Server/client boundary

The GitHub token is used only by server-side code in `src/lib/github.ts`. The browser never receives that token. The dynamic user page is a client component because it needs browser-side loading state and makes the request to the API route.

The dashboard is also a client component because PNG generation requires access to the DOM through `html-to-image`.

## GitHub data collection

`src/lib/github.ts` uses `@octokit/graphql` and a single GraphQL query. The query requests:

- profile identity and biography
- follower/following counts
- total contributions
- contribution calendar by day
- commit contributions
- pull-request contributions
- pull-request review contributions
- issue contributions
- recent pull requests and their state
- up to 50 owned, non-fork repositories
- the five largest language edges returned for each repository

The code requires `GITHUB_TOKEN` to be present and uses it to authenticate a bearer-token GraphQL request.

## Metric processing

`processGithubMetrics()` provides the application's central transformation layer.

### Languages

Language byte sizes are merged across the selected repositories. The result is sorted by byte size and limited to the top five languages. Percentages are calculated from the aggregate byte total.

The source data is repository language-size information, not a count of files, commits, or lines of code. The landing page calls this a byte-accurate language breakdown because that is what the implementation actually calculates.

### Pull requests

The processor counts the returned pull-request nodes by state and combines those counts with GitHub's `totalCount`. Merge rate is calculated as:

```text
merged pull requests / total pull requests * 100
```

The current query requests at most 100 pull-request nodes, so state counts are bounded by that node window even though `totalCount` represents GitHub's total matching count.

### Streaks

The contribution calendar is flattened and sorted chronologically.

The longest streak is calculated with a forward scan that increments on active days and resets on zero-contribution days.

The current streak is calculated with a backward scan from the newest calendar day. When the newest day has zero contributions, the algorithm first steps back one day, allowing a streak that runs through yesterday to remain active.

### Overview metrics

The final `DevWrappedStats.overview` contains GitHub's contribution totals for commits, pull requests created, pull requests reviewed, issues, and calendar contributions.

## Caching

The API route normalizes the username to lower case and uses this Redis key:

```text
user:stats:<normalized-username>
```

The cache TTL is 86,400 seconds (24 hours).

On a cache hit, the route returns the cached `DevWrappedStats` payload with `source: "cache"`.

On a miss, the route fetches and processes GitHub data, writes the resulting payload with `SETEX`, and returns `source: "api"`.

Redis failures are intentionally non-fatal. A Redis read error bypasses the cache and allows the request to continue to GitHub; a Redis write error is logged while the freshly processed response is still returned.

## HTTP behavior

`GET /api/wrapped/:username` currently follows these response paths:

| Condition | Status | Behavior |
| --- | ---: | --- |
| Missing/blank username | 400 | Returns `Invalid username parameter` |
| User absent from GitHub response | 404 | Returns a user-not-found error |
| GitHub rate-limit error detected | 429 | Returns a rate-limit message |
| Unexpected processing/fetch error | 500 | Returns the error message |
| Successful cache hit | 200 | Returns cached metrics |
| Successful cache miss | 200 | Returns freshly fetched metrics |

Successful responses include `Cache-Control` headers with a one-hour browser freshness value and a 24-hour shared-cache value.

## Rendering and export

The dynamic route renders `EditorialDasboard` after the API request succeeds. The dashboard assembles the profile hero, language composition, contribution streaks, pull-request metrics, and contribution overview cards.

The export action finds the `dashboard-export` element and calls `toPng()` with a 2x pixel ratio and a dark background. The generated file is named:

```text
devwrapped-<github-login>.png
```

## Deployment architecture

The repository is configured for a standalone Next.js build. `next.config.ts` sets `output: "standalone"`, and the Dockerfile copies the generated standalone server and static assets into a small Node 22 Alpine runtime image.

The production container runs as a dedicated non-root `nextjs` user.

For Docker Compose, the application uses two services:

- `web`: the Next.js production server on port `3000`
- `redis`: Redis 7 Alpine on port `6379`

Compose supplies the web container with `GITHUB_TOKEN` and a Redis URL pointing at the compose service name.

## Important implementation constraints

The application does not currently implement pagination for repository or pull-request nodes. The GraphQL query asks for 50 repositories and 100 pull requests. This means some metrics are intentionally based on bounded result windows while GitHub's aggregate contribution counters can cover the complete contribution history.

The language metric is therefore a composition of the returned repository window, not a guaranteed account-wide byte total over every repository owned by the user.

The current streak logic assumes the newest contribution-calendar day is either today or the latest day supplied by GitHub. It permits a streak ending yesterday when today is inactive, which is useful for an active streak interpretation.
