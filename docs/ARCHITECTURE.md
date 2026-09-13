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
  | POST /api/audit { username }
  v
Next.js API route
  |
  +--> normalize + validate username
  |
  +--> SET lock:audit:<username> NX EX 120
  |
  +--> LPUSH queue:github-audit
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
  +--> PROCESSING
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
| `src/app/api/audit/route.ts` | Validates requests, acquires the audit lock, and enqueues jobs |
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

The landing page is a client component because it owns the audit form, polling state, and automatic navigation after completion. The user dashboard route is a server component and reads completed stats directly from Redis before rendering `EditorialDashboard`.

The dashboard itself remains a client component because PNG generation through `html-to-image` requires browser DOM access.

## Audit pipeline

### 1. Submission

`POST /api/audit` accepts a JSON body containing `username`.

The route normalizes the username to lowercase and validates it against GitHub's login character constraints used by the application: 1-39 characters containing only letters, numbers, and hyphens.

Before enqueueing, the route attempts an atomic Redis lock:

```text
SET lock:audit:<username> processing EX 120 NX
```

If the lock already exists, the request returns an `already in progress` response instead of adding a duplicate job.

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

The worker calls GitHub GraphQL through `go-engine/infra/github_client.go`. The returned data is transformed into the application's `DevWrappedStats` structure and saved to Redis under:

```text
stats:<username>
```

The completed report has a 24-hour TTL.

### 5. Completion and failure

On success, the worker removes the user's audit lock after saving the report.

On a terminal error, the worker writes:

```text
failed:audit:<username>
```

with a 10-minute TTL and releases the audit lock. This gives the browser an explicit terminal state instead of making it poll until the lock's 120-second TTL expires.

The processing-list entry is removed after the job has been handled. If a worker dies before removal, the next worker process can reclaim it during startup.

## Browser polling

`useAuditStatus()` starts polling after a successful enqueue. The polling interval begins at 800 ms, increases by a factor of 1.5, and is capped at 5 seconds.

Polling stops when:

- completed stats are returned;
- the worker reports `FAILED`;
- the status endpoint returns an HTTP error; or
- 90 seconds have elapsed without completion.

Abort controllers and timer cleanup prevent stale polling loops when the user starts another audit or the component unmounts.

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
- pull requests and their states;
- up to 50 owned, non-fork repositories; and
- up to five largest language entries per selected repository.

The engine requires `GITHUB_TOKEN` and authenticates the GraphQL request with that token.

## Metric processing

`processGithubMetrics()` is the central transformation layer.

### Languages

Language byte sizes are merged across the selected repositories. The aggregate is sorted and reduced to the top five languages. Percentages are based on the aggregate bytes returned by GitHub.

This is a repository-language-byte metric, not a count of files, commits, or lines of code.

### Pull requests

The query requests at most 100 pull-request nodes. The processor counts the returned nodes by `MERGED`, `CLOSED`, and `OPEN` state while using GitHub's `totalCount` for the overall total when available.

Merge rate is:

```text
merged / total * 100
```

Because the state counts are bounded by the node window while `totalCount` is not, the resulting percentage is not guaranteed to represent every matching pull request.

### Streaks

The contribution calendar is flattened and sorted chronologically.

The longest streak scans forward, incrementing on active days and resetting on inactive days. The current streak scans backward from the newest day; if that day is inactive, the algorithm first steps back one day so a streak ending yesterday remains active.

## Redis state model

| Key | Written by | Read by | TTL | Purpose |
| --- | --- | --- | --- | --- |
| `lock:audit:<username>` | Next.js / worker | Next.js | 120s | Duplicate-audit protection and processing state |
| `queue:github-audit` | Next.js | Go worker | List | Pending audit jobs |
| `queue:github-audit:processing` | Go worker | Go worker | List | In-flight jobs for crash recovery |
| `stats:<username>` | Go worker | Next.js | 24h | Completed dashboard data |
| `failed:audit:<username>` | Go worker | Next.js | 10m | Terminal failure marker |

The Next.js and Go implementations intentionally share the same username normalization and Redis key formats.

## HTTP behavior

The browser-facing audit state endpoint uses these states:

| State | Meaning |
| --- | --- |
| `PROCESSING` | An audit lock exists and the worker has not produced a completed report yet |
| `FAILED` | The worker recorded a terminal failure |
| `COMPLETED` | Valid cached stats are available |
| `NOT_FOUND` | No completed stats or active audit exists |
| `ERROR` | The status endpoint encountered an unexpected server error |

See [`API.md`](API.md) for the full request and response contract.

## Rendering and export

`src/app/[username]/page.tsx` reads completed stats on the server. A missing report is distinguished from an active audit so the user can retry after processing begins.

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

- Repository language data is capped at 50 owned, non-fork repositories.
- Each selected repository contributes at most five language entries.
- Pull-request state counts are capped at 100 returned nodes.
- Aggregate contribution counters come from GitHub's contribution fields and do not share those node limits.
- Completed stats expire after 24 hours.
- The audit lock expires after 120 seconds.
- Failure markers expire after 10 minutes.
- The worker uses at-least-once processing; a job may be retried after a worker crash.
- Redis is required for the audit pipeline. Without a reachable Redis instance, requests cannot enqueue work and the worker cannot consume it.
