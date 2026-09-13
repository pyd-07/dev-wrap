# Development Guide

## Prerequisites

DevWrapped consists of a Next.js web application, a Go audit worker, and Redis.

For local development, install:

- Node.js and npm
- Go 1.25 for running or modifying the worker
- Docker, if using the recommended Compose setup
- A GitHub token for the GraphQL API

The repository includes `package-lock.json` and `go.sum`, so use the lockfiles when installing dependencies.

## Environment variables

The Next.js process uses:

```env
GITHUB_TOKEN=your_github_token
REDIS_URL=redis://localhost:6379
```

The Go engine uses:

```env
GITHUB_TOKEN=your_github_token
REDIS_URL=redis://localhost:6379
QUEUE_NAME=queue:github-audit
WORKERS=5
```

Defaults in the Go engine are:

| Variable | Default | Purpose |
| --- | --- | --- |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `QUEUE_NAME` | `queue:github-audit` | Audit queue consumed by workers |
| `WORKERS` | `5` | Number of concurrent worker goroutines |
| `GITHUB_TOKEN` | none | GitHub GraphQL authentication; required |

`REDIS_URL` is only optional syntactically because the code supplies a localhost fallback. A reachable Redis instance is still required for the audit pipeline.

For Docker Compose, the application containers use:

```text
redis://redis:6379
```

because `redis` is the Compose service hostname.

Never expose `GITHUB_TOKEN` through `NEXT_PUBLIC_*` variables or browser code.

## Recommended local setup

The complete application is easiest to run through Docker Compose:

```bash
docker compose up --build
```

This starts:

```text
web     -> Next.js production server -> :3000
engine  -> Go audit worker
redis   -> Redis 7                    -> :6379
```

The web and engine services wait for Redis to pass its health check before starting.

Open:

```text
http://localhost:3000
```

Stop the stack with:

```bash
docker compose down
```

To remove the persisted Redis volume as well:

```bash
docker compose down -v
```

## Running the web application directly

Start Redis first:

```bash
docker run --name devwrap-redis -p 6379:6379 -d redis:7-alpine
```

Install dependencies:

```bash
npm ci
```

Start the development server:

```bash
npm run dev
```

The Next.js development server listens on port `3000` by default.

## Running the Go engine directly

The worker lives under `go-engine/`.

Install/download Go dependencies:

```bash
cd go-engine
go mod download
```

Run the worker:

```bash
go run .
```

With the default local environment, the worker connects to `redis://localhost:6379` and listens to `queue:github-audit` with five workers.

To run a different number of workers:

```bash
WORKERS=2 go run .
```

On Windows PowerShell, set the variable before running the command instead:

```powershell
$env:WORKERS="2"
go run .
```

## Useful npm scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run build` | Produce a production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |

There is currently no dedicated automated test script in the root `package.json`.

For Go code, use the standard Go tooling:

```bash
cd go-engine
go test ./...
go build ./...
```

## Application flow during development

A normal audit follows this sequence:

1. The landing page calls `POST /api/audit`.
2. Next.js validates the username and acquires `lock:audit:<username>`.
3. Next.js pushes a JSON job to `queue:github-audit`.
4. The Go worker moves the job to `queue:github-audit:processing`.
5. The worker fetches GitHub data and calculates `DevWrappedStats`.
6. The worker stores the result in `stats:<username>` for 24 hours and releases the lock.
7. The browser polls `GET /api/audit/status/<username>` until it receives `COMPLETED`.
8. The browser navigates to `/<username>`, where the server reads the completed report from Redis.

If the worker is not running, the audit request can still be accepted into Redis, but it will remain unprocessed until a worker consumes it. The browser eventually stops polling after its 90-second timeout.

## Redis inspection

When debugging the pipeline, inspect these keys:

```text
lock:audit:<username>
queue:github-audit
queue:github-audit:processing
stats:<username>
failed:audit:<username>
```

Useful Redis commands include:

```bash
redis-cli LLEN queue:github-audit
redis-cli LLEN queue:github-audit:processing
redis-cli GET lock:audit:<username>
redis-cli GET stats:<username>
redis-cli GET failed:audit:<username>
```

The lock key uses a colon between `audit` and the username:

```text
lock:audit:<username>
```

The processing list is intentionally separate from the pending queue so an in-flight job can be reclaimed after a worker crash.

## Working on the audit API

### `POST /api/audit`

The request body is:

```json
{
  "username": "octocat"
}
```

The endpoint normalizes the handle to lowercase, validates it, acquires the per-user lock, and enqueues the job.

A newly accepted job returns HTTP `202` with a job ID and polling URL. If another audit for the same username is already active, the endpoint reports that the audit is already processing rather than enqueueing a duplicate.

### `GET /api/audit/status/<username>`

The endpoint checks, in order:

1. completed stats;
2. the terminal failure marker; and
3. the active audit lock.

This ordering ensures completed and failed audits are terminal states from the browser's perspective.

### `GET /api/wrapped/<username>`

This endpoint provides a direct JSON read of completed stats. It returns `COMPLETED` when a valid cached report exists, `PROCESSING` while the audit lock is active, and `NOT_FOUND` when neither exists.

## Working on the GitHub query

The worker's GraphQL query lives in `go-engine/infra/github_client.go`.

When changing the query:

1. Update the corresponding Go response structures.
2. Update the metric transformation code.
3. Verify the resulting `DevWrappedStats` payload.
4. Update [`METRICS.md`](METRICS.md) if the definition or limitation of a metric changes.
5. Check the dashboard cards that consume the affected fields.

Keep GitHub transport types separate from the UI-facing processed structure.

## Working on metrics

Metric calculation is performed by the Go engine. The main transformation logic lives with the audit service/domain implementation.

When adding a metric, document:

- its GitHub source field;
- whether the source is an aggregate or bounded node list;
- the exact calculation;
- its units and rounding rules; and
- any pagination or result-window limitation.

The repository currently requests up to 50 repositories for language analysis and up to 100 pull-request nodes for state analysis.

## Working on the dashboard

`src/components/editorial-dashboard.tsx` composes the dashboard from focused components, including:

```text
NavBar
UserHero
LanguageCard
StreakCard
PREfficiencyCard
MomentumCard
```

Keep data calculation out of visual components whenever possible. The dashboard should consume the processed `DevWrappedStats` object.

The PNG export depends on the `dashboard-export` element ID. If that element changes, update the export handler at the same time.

## Error handling and failure recovery

The audit pipeline distinguishes several failure cases:

- Redis unavailable during submission: the job cannot be enqueued.
- GitHub fetch failure: the worker writes a temporary failure marker and releases the lock.
- Worker crash during execution: the processing-list entry can be reclaimed on the next worker startup.
- Malformed job payload: the worker removes it from the processing list instead of retrying it forever.
- Status polling timeout: the browser reports that the worker may be unavailable after 90 seconds.

Preserve useful server-side logs while returning safe messages to the browser.

## Docker development and production images

There are two Dockerfiles:

### Root `Dockerfile`

Builds the Next.js application in three stages:

1. dependency installation with `npm ci`;
2. Next.js production build; and
3. a minimal Node 22 Alpine runtime using standalone output.

The runtime runs as the non-root `nextjs` user.

### `go-engine/Dockerfile`

Builds the Go worker into a static Linux binary and copies it into a small Alpine runtime image.

### Compose

`docker-compose.yml` combines both images with Redis. It is the complete three-service local topology; the root Dockerfile alone is only the web application image.

## Verification checklist

Before opening a pull request, run:

```bash
npm run lint
npm run build

docker compose build
```

For Go changes:

```bash
cd go-engine
go test ./...
go build ./...
```

For audit/API changes, exercise:

- a valid GitHub username;
- an invalid username;
- an already-processing username;
- a successful completion; and
- a worker/GitHub failure path where practical.

## Pull request expectations

Keep documentation and implementation changes focused. For implementation changes, describe the affected request/worker path and any metric or UI behavior that changed.

Documentation changes should keep commands, routes, key names, environment variables, and architecture diagrams synchronized with the current implementation.
