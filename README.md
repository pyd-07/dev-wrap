# DevWrapped

DevWrapped turns a GitHub username into an editorial-style developer activity dashboard. It collects GitHub contribution data through a Go worker, stores the completed audit in Redis, and renders the result as a shareable dashboard.

> **Status:** early-stage personal project. The implementation is functional, but some analytics use bounded GitHub result windows. See [`docs/METRICS.md`](docs/METRICS.md) for the exact definitions and limitations.

## What it shows

For a GitHub user, DevWrapped currently presents:

- Profile information, follower/following counts, and biography
- Total contributions, commits, pull requests created, pull requests reviewed, and issues
- Top language composition based on aggregated repository language bytes
- Current and longest contribution streaks
- Pull-request totals, state counts, and merge rate
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
   | acquire lock + LPUSH
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

For the Next.js application:

```env
GITHUB_TOKEN=your_github_token
REDIS_URL=redis://localhost:6379
```

For the Go engine:

```env
GITHUB_TOKEN=your_github_token
REDIS_URL=redis://localhost:6379
QUEUE_NAME=queue:github-audit
WORKERS=5
```

`GITHUB_TOKEN` is required by the Go GitHub client. `REDIS_URL` defaults to `redis://localhost:6379` in both application layers when omitted. `QUEUE_NAME` defaults to `queue:github-audit`, and `WORKERS` defaults to `5` in the Go engine.

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

Then create your environment file and run the Next.js application:

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
3. The Next.js server normalizes and validates the username, acquires a Redis lock, and enqueues an audit job.
4. The Go worker consumes the job from Redis and queries GitHub GraphQL.
5. The worker calculates the dashboard metrics and stores them under `stats:<username>` for 24 hours.
6. The browser polls `/api/audit/status/<username>` with adaptive backoff.
7. When the status becomes `COMPLETED`, the browser navigates to `/<username>`.
8. The user page reads the completed stats from Redis and renders the dashboard server-side.

A failed audit gets a temporary `failed:audit:<username>` marker so the browser can stop polling instead of waiting for the lock to expire.

## API routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/` | Landing page and audit controls |
| `GET` | `/<username>` | Render a completed dashboard or an audit-state fallback |
| `POST` | `/api/audit` | Enqueue an asynchronous audit job |
| `GET` | `/api/audit/status/<username>` | Return the current audit status and completed data |
| `GET` | `/api/wrapped/<username>` | Read completed audit data through a direct JSON endpoint |

See [`docs/API.md`](docs/API.md) for request/response contracts and status behavior.

## Redis state

The audit pipeline uses a small, shared Redis key scheme:

| Key | Purpose | TTL |
| --- | --- | --- |
| `lock:audit:<username>` | Prevent duplicate audits for the same username | 120 seconds |
| `queue:github-audit` | Pending audit jobs | Persistent list |
| `queue:github-audit:processing` | Jobs currently being executed | Persistent list |
| `stats:<username>` | Completed `DevWrappedStats` payload | 24 hours |
| `failed:audit:<username>` | Terminal failure marker | 10 minutes |

The Go worker moves jobs atomically from the queue into the processing list. On startup it reclaims jobs left there by a previous crash or redeploy, providing at-least-once job handling.

## Metrics and data limitations

The exact formulas are documented in [`docs/METRICS.md`](docs/METRICS.md).

Important implementation limits include:

- Up to 50 owned, non-fork repositories are considered for language composition.
- Up to five language entries are considered per selected repository.
- Up to 100 pull-request nodes are requested for state counts.
- GitHub aggregate contribution counters are used for contribution totals and are not subject to those node-window limits.

Language composition is therefore based on the repository sample returned by the current GraphQL query, not necessarily every repository in a user's account. Pull-request state counts can also cover a smaller node window than GitHub's total matching count.

## Caching and failure behavior

Redis is a required part of the audit pipeline: `/api/audit` needs it to acquire the distributed lock and enqueue jobs, and the Go engine needs it to consume jobs and write results.

The dashboard read path is more defensive. A missing, malformed, or unreadable stats payload is treated as unavailable, allowing the user page to show an audit-incomplete or processing state instead of crashing.

Completed audit results expire after 24 hours. Running the same username after expiry creates a fresh audit.

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
