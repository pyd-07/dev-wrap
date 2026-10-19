# Architecture

## Overview

DevWrapped is an asynchronous GitHub audit application. A Next.js application accepts an audit request and exposes the browser-facing API, while a separate Go worker performs the GitHub GraphQL fetch and metric processing. Redis connects the two processes and stores both pipeline state and completed reports.

The system has four primary responsibilities:

1. Accept and validate a GitHub username from the landing page.
2. Enqueue an audit job and expose its processing status to the browser.
3. Fetch GitHub data, calculate metrics, and persist the completed report.
4. Render the completed report as an editorial dashboard and export it as a PNG.

This separation keeps the potentially slow GitHub operation out of the Next.js request lifecycle.

## End-to-end request flow

```text
Browser
  |
  | POST /api/audit { username, refresh? }
  v
Next.js API route
  |
  +--> normalize + validate username
  |
  +--> GET stats:<username>
  |
  +--> cached report and no refresh? --> 200 COMPLETED (returned at once)
  |
  +--> SET lock:audit:<username> NX EX 120
  |
  +--> DEL failed:audit:<username>
  |
  +--> LPUSH queue:github-audit
  |
  +--> cached report? --> 200 REFRESHING + cached report
  |
  v
Redis
  |
  | BLMove queue -> queue:github-audit:processing
  v
Go worker pool
  |
  | FetchUserStats()
  v
GitHub GraphQL API
  |
  | raw data
  v
Metric processing
  |
  +--> SET stats:<username> EX 24h
  +--> DEL lock:audit:<username>
  |
  v
Browser polls GET /api/audit/status/<username>
  |
  +--> PROCESSING (no previous report)
  +--> REFRESHING + previous report
  +--> FAILED
  +--> COMPLETED + data
              |
              v
         /<username>
              |
              v
      Redis stats read
              |
              v
    EditorialDashboard
```

## Application structure

| Path | Responsibility |
| --- | --- |
| `src/app/page.tsx` | Landing page, username input, quick handles, audit status UI |
| `src/app/[username]/page.tsx` | Server-rendered user dashboard and audit-state fallbacks |
| `src/app/api/audit/route.ts` | Serves cached reports and enqueues audits only for initial or explicit-refresh requests |
| `src/app/api/audit/status/[username]/route.ts` | Reports processing, failure, completion, or not-found state |
| `src/app/api/wrapped/[username]/route.ts` | Direct JSON read of completed audit data |
| `src/hooks/useAuditStatus.ts` | Submits audits and polls status with adaptive backoff and timeout |
| `src/lib/audit.ts` | Shared username validation and Redis key definitions |
| `src/lib/github.ts` | Defensive reader for completed stats from Redis |
| `src/lib/redis.ts` | Shared ioredis connection for the Next.js process |
| `src/types/github.ts` | Raw GitHub and processed metric TypeScript contracts |
| `src/components/editorial-dashboard.tsx` | Dashboard composition and PNG export |
| `src/components/dashboard/*` | Individual dashboard cards and navigation |
| `go-engine/main.go` | Worker process entry point |
| `go-engine/config/config.go` | Worker configuration and defaults |
| `go-engine/infra/github_client.go` | GitHub GraphQL client and query |
| `go-engine/infra/queue_consumer.go` | Redis queue consumer and worker pool |
| `go-engine/infra/redis.go` | Redis repository for stats, locks, and failures |
| `go-engine/service/audit_service.go` | Audit orchestration and failure cleanup |
| `go-engine/domain/*` | Worker domain contracts and metric structures |
| `Dockerfile` | Next.js production image |
| `go-engine/Dockerfile` | Go worker production image |
| `docker-compose.yml` | Full local stack: web + engine + Redis |

## Server/client boundary

The GitHub token is used by the Go engine when calling GitHub GraphQL and is never intentionally exposed to the browser. The Next.js API only handles audit orchestration and reads completed results from Redis.

The landing page is a client component because it owns the audit form, polling state, and automatic navigation after completion. Its submission is cache-first: an existing report resolves without starting an audit, so navigation to the dashboard happens immediately. The user dashboard route is a server component and reads completed stats directly from Redis before rendering `EditorialDashboard`; that page still paints the cached report without waiting for any running audit.

`EditorialDashboard` owns the dashboard's audit lifecycle. Searching from its navbar is a view action, and its explicit Refresh action submits a refresh for the displayed user while keeping the cached dashboard mounted.

The dashboard itself remains a client component because PNG generation through `html-to-image` requires browser DOM access.

## Audit pipeline

### 1. Submission

`POST /api/audit` accepts a JSON body containing `username` and an optional `refresh` flag (default `false`).

The route normalizes the username to lowercase and validates it against GitHub's login character constraints used by the application: 1-39 characters containing only letters, numbers, and hyphens.

It then reads `stats:<username>`:

- A valid cached report with no `refresh` request is returned immediately as `COMPLETED`. No lock is taken, no job is enqueued, and nothing polls afterwards.
- A cached report with `refresh: true` is returned immediately as `REFRESHING` while a background audit is enqueued.
- No cached report falls through to an initial audit.

Before enqueueing, the route attempts an atomic Redis lock:

```text
SET lock:audit:<username> processing EX 120 NX
```

If the lock already exists, the request returns the cached report (if any) as `REFRESHING`, or a `processing` response, instead of adding a duplicate job. A stale `failed:audit:<username>` marker is cleared before the job is pushed, so a failure from an earlier run cannot terminate polling for the new audit. The lock is released on request failure only if this request acquired it.

### 2. Queue

Jobs are JSON objects containing:

```json
{
  "job_id": "job_<timestamp>_<username>",
  "username": "github-login"
}
```

They are pushed to `queue:github-audit`.

### 3. Worker consumption

The Go worker pool uses Redis `BLMove` to atomically move a job from the pending queue to:

```text
queue:github-audit:processing
```

This gives each active job a durable location while it is being executed.

The worker pool defaults to five workers and uses bounded reconnect backoff when Redis operations fail. On startup, it checks the processing list and moves stranded jobs back to the pending queue, providing at-least-once handling across worker crashes or redeploys.

### 4. GitHub fetch and processing

The worker calls GitHub GraphQL through `go-engine/infra/github_client.go`, then transforms the raw response into the `DevWrappedStats` structure and saves it to Redis under:

```text
stats:<username>
```

The completed report has a 24-hour TTL. The transformation itself also lives in `go-engine/infra/github_client.go` (`FetchUserStats`); there is no separate metrics module.

The GitHub client is bounded: the OAuth2 transport has a 45-second HTTP timeout, and each GraphQL fetch runs under a 30-second child context so a slow GitHub response fails the job instead of pinning a worker goroutine.

### 5. Completion and failure

On success, the worker removes the user's audit lock after saving the report and clears any previous failure marker. A previously completed report stays visible as stale data while a new audit runs; the status endpoint reports `REFRESHING` in that case.

On a terminal error (including a panic), the worker writes:

```text
failed:audit:<username>
```

with a 10-minute TTL and releases the audit lock. This gives the browser an explicit terminal state instead of making it poll until the lock's 120-second TTL expires. If a previous report exists, it is returned alongside `FAILED` and is not deleted. Acceptance clears the failure marker before a job is enqueued so a retry cannot be reported as failed by a marker from the earlier run.

The processing-list entry is removed after the job has been handled. If a worker dies before removal, the next worker process can reclaim it during startup.

Lock ownership caveats that the implementation actually has:

- The lock is a plain `SET NX EX` string with no owner token. The worker releases it by username, so a job that outlives the 120-second TTL can delete a lock that a newer submission acquired. A long audit can therefore race a subsequent audit for the same handle; the later report wins because it is written later, but the earlier client may already have been told the audit completed.
- If no worker is consuming, a queued job does not hold the audit state: after the lock TTL expires, the status endpoint reports the last cached report as `COMPLETED` even though the requested audit never ran. The job stays in the queue and may be processed much later.
- At-least-once applies to execution, not exactly-once: a worker crash mid-job leaves the job in the processing list, and the reclaiming boot re-executes it from scratch. GitHub is re-queried and the report is simply overwritten.

## Browser polling

`useAuditStatus()` polls only when a job appears to have been started. A cache-hit submission resolves immediately with the cached report and normally never enters the polling loop. For a started audit, the polling interval begins at 800 ms, increases by a factor of 1.5, and is capped at 5 seconds.

Implementation note: the polling effect binds when the submission begins (status `ENQUEUED`/`REFRESHING`, active username set), not after the POST confirms acceptance. So the first poll can reach the status endpoint before a slow submission response arrives. In practice the POST resolves in milliseconds — a cache hit terminates the polling effect through cleanup — and the poll schedule continues harmlessly otherwise, but the client cannot guarantee that its first status read follows an acknowledged enqueue.

Polling stops when:

- the current audit completes with `COMPLETED`;
- the worker reports `FAILED`;
- the status endpoint returns an HTTP error; or
- 90 seconds have elapsed without completion.

`PROCESSING` and `REFRESHING` are non-terminal. During `REFRESHING`, the previous report remains on screen and the client continues polling; it does not navigate until the current audit reaches `COMPLETED`. On the dashboard route, an explicit refresh is started from the navbar and the cached dashboard stays visible; a completed refresh triggers a server-component refresh so the new report replaces the stale one. A failed refresh leaves the last successful report visible.

Abort controllers and timer cleanup prevent stale polling loops when the user starts another audit, switches to a new handle, or the component unmounts. A status response that is not recognizable JSON, or one with an unexpected `status` field, does not terminate polling; the client keeps backing off until the deadline.

## GitHub data collection

The Go engine performs a GitHub v4 GraphQL query requesting:

- profile identity and biography;
- follower/following counts;
- total contributions;
- contribution calendar by day;
- commit contributions;
- pull-request contributions;
- pull-request review contributions;
- issue contributions;
- up to 50 owned, non-fork repositories ordered by stargazers (`repositories(first: 50, ownerAffiliations: OWNER, isFork: false, orderBy: STARGAZERS DESC)`);
- up to 10 largest language entries per selected repository (`languages(first: 10, orderBy: SIZE DESC)`); and
- pull requests in pages of 100 with their states and repository owners, paginated while GitHub reports `hasNextPage`.

The engine requires `GITHUB_TOKEN` and authenticates the GraphQL request with that token. See [`METRICS.md`](METRICS.md) for exact metric definitions and windows.

## Metric processing

The transformation from raw GraphQL data to `DevWrappedStats` lives in `go-engine/infra/github_client.go` (`FetchUserStats`) and runs in the worker, not in the Next.js process.

### Languages

Language byte sizes are merged across the selected repositories into one entry per language name. The aggregate is sorted by byte size descending and kept in full (there is no top-N truncation of the language list itself); percentages are computed from the aggregate bytes returned by GitHub and truncated to one decimal place.

This is a repository-language-byte metric, not a count of files, commits, or lines of code.

### Pull requests

Pull requests are fetched page by page (100 per page) until GitHub reports no further pages. The processor counts the returned nodes by `MERGED`, `CLOSED`, and `OPEN` state; `total` is the number of nodes returned across all pages (no `totalCount` is used).

Merge rate is computed over resolved pull requests:

```text
merged / (merged + closed) * 100
```

truncated to one decimal place. For merges into organization-owned repositories, the worker counts the destination organization per merged pull request and sorts the breakdown by count. See [`METRICS.md`](METRICS.md).

### Streaks

The contribution calendar is flattened in the order GitHub returns it (weeks and days).

The longest streak scans forward, incrementing on active days and resetting on inactive days. The current streak is kept only when the forward run reaches the last calendar day; if the latest returned day has no contributions, the current streak is `0`. The implementation makes no allowance for a streak that ended yesterday.

## Redis state model

| Key | Written by | Read by | TTL | Purpose |
| --- | --- | --- | --- | --- |
| `lock:audit:<username>` | Next.js / worker | Next.js | 120s | Duplicate-audit protection and processing state |
| `queue:github-audit` | Next.js | Go worker | List | Pending audit jobs |
| `queue:github-audit:processing` | Go worker | Go worker | List | In-flight jobs for crash recovery |
| `stats:<username>` | Go worker | Next.js | 24h | Completed dashboard data |
| `failed:audit:<username>` | Go worker | Next.js | 10m | Most recent terminal failure marker; cleared before a new audit is enqueued and after it succeeds |

The Next.js and Go implementations intentionally share the same username normalization and Redis key formats.

## HTTP behavior

The browser-facing audit state endpoint uses these states:

| State | Meaning |
| --- | --- |
| `PROCESSING` | An audit lock exists, no previous report is available, and the worker has not completed yet |
| `REFRESHING` | An audit lock exists and a previous completed report is available as stale data |
| `FAILED` | No newer audit is running and the worker recorded a terminal failure; a previous report may be included as `data` |
| `COMPLETED` | No newer audit is running and valid cached stats are available |
| `NOT_FOUND` | No completed stats or active audit exists |
| `ERROR` | The status endpoint encountered an unexpected server error |

The active lock takes precedence over both cached stats and a failure marker. All handled states are returned as HTTP `200` except `NOT_FOUND` (404) and `ERROR` (500). The browser continues polling during `PROCESSING` and `REFRESHING`; the fact that a state is HTTP `200` does not make it terminal.

See [`API.md`](API.md) for the full request and response contract.

## HTTP and CDN caching

`src/proxy.ts` (the Next.js proxy/middleware convention in this version) sets response headers, not the applicative Redis cache:

| Route family | `Cache-Control` | Behavior |
| --- | --- | --- |
| `/[username]` page HTML | `public, s-maxage=30, stale-while-revalidate=120` | A repeat visit within 30 s is served by a CDN/proxy without invoking the app; SWR refreshes it in the background for up to 120 s |
| `/api/wrapped/[username]` | `public, s-maxage=30, stale-while-revalidate=60` | Same idea for the JSON envelope |
| `/api/audit` (POST), `/api/audit/status/*`, `/api/health`, `/og` | none set by the proxy | Status reads are never cached so pollers observe live transitions; `og` is deliberately fresh for crawlers; `/` gets no header and `/favicon.ico` is excluded by the matcher |

Three distinct caching layers must not be conflated: the applicative Redis cache (`stats:<username>`, 24 h), CDN/reverse-proxy caching of HTML and `/api/wrapped` responses (30 s + SWR), and browser behavior. Caveat: the proxy only sets headers; whether a CDN actually honors `s-maxage`/SWR depends on the hosting platform, which cannot be confirmed from this repository. It runs behind Render (see `metadataBase` and the Redis TLS notes) and the comment in `src/proxy.ts` documents the intended CDN semantics.

## Rendering and export

`src/app/[username]/page.tsx` reads completed stats on the server. A cache hit renders the dashboard in the same round trip, independent of any running audit. If a newer audit is running, the page still renders the last completed dashboard but labels it as refreshing and shows its original `fetchedAt` time. The dashboard navbar can start an explicit refresh without unmounting the cached report. A missing report is distinguished from an active audit so the user can retry after processing begins.

`EditorialDashboard` composes the profile hero, language composition, streaks, pull-request metrics, and contribution overview. The export action finds the `dashboard-export` element and uses `html-to-image` to create a 2x PNG named:

```text
devwrapped-<github-login>.png
```

## Deployment topology

There are two application containers plus Redis:

```text
+-------------------+       +-------------------+
| Next.js web       |       | Go audit engine   |
| root Dockerfile   |       | go-engine/        |
+---------+---------+       +---------+---------+
          |                           |
          |                           |
          +-----------+---------------+
                      |
                 +----v----+
                 |  Redis  |
                 +---------+
```

The root `Dockerfile` builds only the Next.js web service. Redis and the Go engine are separate services in `docker-compose.yml`. Therefore, deploying only the root Dockerfile does not deploy the complete audit pipeline.

For local or Docker-based deployments, use `docker compose up --build` to start all three services together.

## Important implementation constraints

- Repository language data is sampled from up to 50 owned, non-fork repositories.
- Each selected repository contributes at most 10 language entries to the aggregation.
- Pull requests are paginated in batches of 100 until GitHub reports no further pages; the PR activity metric is not limited to a single page.
- GitHub transport is bounded by a 45-second HTTP timeout and a 30-second per-fetch deadline.
- Aggregate contribution counters come from GitHub's contribution fields and do not share those node limits.
- Completed stats expire after 24 hours.
- The audit lock expires after 120 seconds and carries no ownership token; release is by username.
- Failure markers expire after 10 minutes.
- The worker uses at-least-once processing: a job may be re-executed after a worker crash. Exactly-once execution is not guaranteed.
- Redis is required for the audit pipeline. Without a reachable Redis instance, requests cannot enqueue work and the worker cannot consume it.
