# DevWrapped

DevWrapped turns a GitHub username into an editorial-style developer activity dashboard. It collects GitHub contribution data through a Go worker, stores the completed audit in Redis, and renders the result as a shareable dashboard.

> **Status:** early-stage personal project. The implementation is functional, but some analytics use bounded GitHub result windows. See [`docs/METRICS.md`](docs/METRICS.md) for the exact definitions and limitations.

## What it shows

For a GitHub user, DevWrapped currently presents:

- Profile information, follower/following counts, and biography
- Total contributions, commits, pull requests created, pull requests reviewed, and issues
- Top language composition based on aggregated repository language bytes
- Current and longest contribution streaks
- Pull-request totals, state counts, merge rate, and merged-organization breakdown
- A client-side PNG export of the dashboard

The landing page describes the experience as an annual developer intelligence audit. The implementation is an asynchronous GitHub-data pipeline rather than a full historical analytics warehouse.

## Architecture at a glance

```text
Browser
   |
   | POST /api/audit
   v
Next.js API
   |
   | read stats:<username>
   |   cached + no refresh --> return report at once (no lock, no job)
   |
   | acquire lock + clear marker + LPUSH
   v
Redis queue: queue:github-audit
   |
   | BLMove
   v
Go audit engine
   |
   | GitHub GraphQL
   v
GitHub API
   |
   | process metrics
   v
Redis stats: stats:<username>
   |
   | GET /api/audit/status/<username>
   v
Browser
   |
   | navigate after COMPLETED
   v
/<username>
   |
   | read cached stats
   v
Editorial dashboard
```

The Go engine is a separate process from the Next.js server. Redis is both the job queue and the shared store for completed audit results and pipeline state.

## Tech stack

- Next.js 16 App Router
- React 19 + TypeScript
- Go 1.25 worker engine using `shurcooL/githubv4`
- Redis 7 via `ioredis` (Next.js) and `go-redis/v9` (Go)
- Tailwind CSS 4
- `html-to-image` for dashboard PNG export
- Docker / Docker Compose

The Next.js application uses standalone output for its production Docker image. The Go engine has its own Dockerfile under `go-engine/`.

## Local development

### Prerequisites

You need:

- Node.js and npm
- Go 1.25 if running the worker directly
- Redis, either locally or through Docker
- A GitHub token with the access required by the GraphQL queries

### Environment variables

The Next.js process requires a reachable Redis instance for the audit endpoints:

```env
REDIS_URL=redis://localhost:6379
```

The Go engine uses:

```env
GITHUB_TOKEN=your_github_token
REDIS_URL=redis://localhost:6379
QUEUE_NAME=queue:github-audit
WORKERS=5
```

`GITHUB_TOKEN` is required by the Go GitHub client. The root Compose file also passes the token to the web container, but GitHub authentication for the audit fetch itself happens in the Go engine. `REDIS_URL` defaults to `redis://localhost:6379` in both application layers when omitted. `QUEUE_NAME` defaults to `queue:github-audit`, and `WORKERS` defaults to `5` in the Go engine.

Never expose `GITHUB_TOKEN` through client-side variables such as `NEXT_PUBLIC_*`.

### Option 1: run the complete stack with Docker Compose

This is the simplest way to run the same three-process architecture locally:

```bash
docker compose up --build
```

Compose starts:

| Service | Container | Purpose |
| --- | --- | --- |
| `web` | `devwrap-web` | Next.js production server on port `3000` |
| `engine` | `devwrap-engine` | Go audit worker consuming `queue:github-audit` |
| `redis` | `devwrap-redis` | Redis 7 queue/cache on port `6379` |

The two application containers connect to Redis through the Compose hostname `redis`.

Open `http://localhost:3000` after the stack starts.

### Option 2: run Redis and Next.js separately

Start Redis:

```bash
docker run --name devwrap-redis -p 6379:6379 -d redis:7-alpine
```

Then install dependencies and run the Next.js application:

```bash
npm ci
npm run dev
```

If you use this mode, the Go engine is not running unless you start it separately. A complete audit requires the worker to be running and connected to the same Redis instance.

### Running the Go engine directly

From `go-engine/`:

```bash
go mod download
go run .
```

The engine starts a worker pool and waits for jobs on `queue:github-audit`.

## User flow

1. Enter a GitHub username on `/`.
2. The browser sends `POST /api/audit`.
3. The Next.js server normalizes and validates the username, then reads `stats:<username>`.
4. If a valid report is cached and no refresh was requested, the server returns it immediately (HTTP `200`, `COMPLETED`). Nothing is enqueued and nothing is polled; the browser navigates straight to `/<username>`.
5. Only when no report is cached, or when the request asks for a refresh, does the server acquire the Redis lock and enqueue an audit job. A refresh with a cached report returns that report immediately with `REFRESHING` while the job runs in the background.
6. The Go worker consumes the job from Redis and queries GitHub GraphQL.
7. The worker calculates the dashboard metrics and stores them under `stats:<username>` for 24 hours.
8. While an audit runs, the browser polls `/api/audit/status/<username>` with adaptive backoff. The cached report stays on screen and the status endpoint never presents it as the result of the running audit.
9. When the status becomes `COMPLETED` or `FAILED`, the browser stops polling. `COMPLETED` triggers navigation to `/<username>`, or a server-component refresh when the user is already on that dashboard.
10. The user page reads the completed stats from Redis and renders the dashboard server-side.

A failed audit gets a temporary `failed:audit:<username>` marker so the browser can stop polling instead of waiting for the lock to expire. The marker is cleared before a new audit is enqueued and after a subsequent audit succeeds, so a retry is not reported as failed.

## API routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/` | Landing page and audit controls |
| `GET` | `/<username>` | Render a completed dashboard or an audit-state fallback |
| `POST` | `/api/audit` | Serve a cached report, or explicitly enqueue an asynchronous audit job |
| `GET` | `/api/audit/status/<username>` | Return the current audit status and completed data |
| `GET` | `/api/wrapped/<username>` | Read completed audit data through a direct JSON endpoint |
| `GET` | `/api/health` | Diagnostic endpoint: Redis reachability and queue/processing depth |

See [`docs/API.md`](docs/API.md) for request/response contracts and status behavior.

## Redis state

The audit pipeline uses a small, shared Redis key scheme:

| Key | Purpose | TTL |
| --- | --- | --- |
| `lock:audit:<username>` | Prevent duplicate audits for the same username | 120 seconds |
| `queue:github-audit` | Pending audit jobs | Persistent list |
| `queue:github-audit:processing` | Jobs currently being executed | Persistent list |
| `stats:<username>` | Completed `DevWrappedStats` payload | 24 hours |
| `failed:audit:<username>` | Most recent terminal failure marker; cleared before a new audit is enqueued and after it succeeds | 10 minutes |

The Go worker moves jobs atomically from the queue into the processing list. On startup it reclaims jobs left there by a previous crash or redeploy, providing at-least-once job handling.

## Metrics and data limitations

The exact formulas are documented in [`docs/METRICS.md`](docs/METRICS.md).

Important implementation limits include:

- Up to 50 owned, non-fork repositories are considered for language composition.
- Up to 10 language entries are returned per selected repository before aggregation.
- Pull requests are fetched in pages of 100 until GitHub reports no further pages.
- GitHub aggregate contribution counters are used for overview totals and are not derived from the repository or pull-request node windows.

Language composition is therefore based on the repository/language sample returned by the current GraphQL query, not necessarily every repository or language associated with a user's account.

## Caching and failure behavior

Redis is a required part of the audit pipeline: `/api/audit` needs it to acquire the distributed lock and enqueue jobs, and the Go engine needs it to consume jobs and write results.

The dashboard read path is more defensive. A missing, malformed, or unreadable stats payload is treated as unavailable, allowing the user page to show an audit-incomplete or processing state instead of crashing.

Submissions are cache-first. An ordinary `POST /api/audit` with a valid `stats:<username>` report returns that report immediately and enqueues nothing, so a cache hit never waits on GitHub or the worker. An explicit refresh (`{ "refresh": true }`) returns the cached report immediately, then starts a new audit through the queue; while it runs, the status endpoint reports `REFRESHING` with the previous report as stale data and never labels the old report as the result of the new audit. The browser keeps the dashboard visible and continues polling until `COMPLETED` or `FAILED`. A refresh for a handle with no cached report behaves like an initial audit.

Completed audit results expire after 24 hours. A successful refresh overwrites the previous report and resets that TTL. If a refresh fails, the previous report is preserved: the status endpoint returns `FAILED` together with the last successful report, and the dashboard keeps showing it with its original `fetchedAt` value.

## Docker

The repository has two independent Docker images:

- Root `Dockerfile`: builds and runs the Next.js web application.
- `go-engine/Dockerfile`: builds and runs the Go audit worker.

`docker-compose.yml` combines both images with Redis into the complete application stack. The root `Dockerfile` by itself does **not** start Redis or the Go worker.

For a Compose deployment, use the Compose file rather than treating the root Dockerfile as the complete stack.

## Development workflow

Before submitting a change:

```bash
npm run lint
npm run build
docker compose build
```

For Go changes, also run:

```bash
cd go-engine
go test ./...
go build ./...
```

For API changes, verify at least one valid username, one invalid username, and the processing/completed audit paths.

See:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system design and request/worker flow
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — local development and contribution workflow
- [`docs/API.md`](docs/API.md) — HTTP contracts and audit state machine
- [`docs/METRICS.md`](docs/METRICS.md) — metric definitions and limitations
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Docker and deployment topology

## License

No license file is currently present in the repository, so the project should be treated as **all rights reserved** unless the repository owner adds a license.
