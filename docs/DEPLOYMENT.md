# Deployment Guide

## Deployment topology

DevWrapped is a three-service application:

```text
                +-------------------+
                |   Next.js Web     |
                |   port 3000       |
                +---------+---------+
                          |
                          | Redis
                          |
             +------------+------------+
             |                         |
             v                         v
   +-------------------+     +-------------------+
   | Redis 7           |<----| Go Audit Engine   |
   | queue + state     |     | worker pool       |
   +-------------------+     +---------+---------+
                                       |
                                       |
                                       v
                                GitHub GraphQL API
```

The services have separate responsibilities:

- **Web:** accepts audit requests, exposes the status/read APIs, and renders dashboards.
- **Engine:** consumes audit jobs, calls GitHub GraphQL, calculates metrics, and writes completed reports.
- **Redis:** provides the queue, distributed audit locks, processing list, completed report cache, and failure markers.

## Docker images

There are two application images in the repository:

| Image | Dockerfile | Role |
| --- | --- | --- |
| Next.js | `./Dockerfile` | Web application |
| Go engine | `./go-engine/Dockerfile` | Background audit worker |

Redis is supplied as `redis:7-alpine` by Compose rather than built from repository source.

### Important: the root Dockerfile is not the whole application

The root `Dockerfile` builds only the Next.js service. It does not start the Go engine or Redis.

If a deployment platform is configured to build only `./Dockerfile`, the web application may start successfully while audit jobs remain queued because there is no worker consuming them.

The complete containerized topology is defined by `docker-compose.yml`.

## Docker Compose deployment

The repository's Compose file is the reference configuration for running all three services together:

```bash
docker compose up --build -d
```

Check the running services:

```bash
docker compose ps
```

Follow application logs:

```bash
docker compose logs -f web
```

Follow worker logs:

```bash
docker compose logs -f engine
```

Follow Redis logs:

```bash
docker compose logs -f redis
```

Stop the stack:

```bash
docker compose down
```

The Compose configuration exposes the web application on port `3000`. Redis is exposed on port `6379` for local inspection; application containers communicate with it internally through `redis:6379`.

## Required environment

The worker needs the GitHub token. Both the web process and worker need access to the same Redis instance.

```env
GITHUB_TOKEN=your_github_token
REDIS_URL=redis://redis:6379
QUEUE_NAME=queue:github-audit
WORKERS=5
```

`QUEUE_NAME` and `WORKERS` are worker settings. The web service needs `REDIS_URL`; `GITHUB_TOKEN` is consumed by the Go GitHub client. The current Compose file passes the token to the web container as well, but the Next.js code does not use it to query GitHub directly.

For a managed Redis provider, replace `REDIS_URL` with the provider's connection URL. The Go engine accepts `redis://` and `rediss://` URLs, while the Next.js client enables TLS when the URL starts with `rediss://`.

Do not commit secrets or expose `GITHUB_TOKEN` as a client-side environment variable.

## Persistent Redis state

Compose mounts the Redis data directory through the `redis_data` volume. This preserves queue/cache state across a normal container restart.

Removing the volume deletes the stored audit state:

```bash
docker compose down -v
```

Use this deliberately during local resets or when you need a completely clean Redis state.

## Health and smoke checks

After deployment, verify the following in order.

### 1. Web service is reachable

Open the application on its configured public URL.

### 2. Worker is running

Worker logs should include messages similar to:

```text
Booting worker pool [Workers: 5, Listening Queue: queue:github-audit]
Worker 1 started, waiting on queue queue:github-audit
```

The exact worker count depends on `WORKERS`.

### 3. Redis is reachable

The worker pings Redis during startup. If the connection cannot be established, the worker exits with a fatal Redis connection error.

### 4. Submit an audit

Use the landing page and submit a valid GitHub username.

The expected pipeline is:

```text
POST /api/audit
      -> queue:github-audit
      -> Go worker
      -> GitHub GraphQL
      -> stats:<username>
      -> COMPLETED
      -> /<username>
```

### 5. Inspect queue depth when debugging

```bash
redis-cli LLEN queue:github-audit
redis-cli LLEN queue:github-audit:processing
```

A queue that grows while the worker is healthy usually indicates a worker/queue configuration mismatch. A processing list that retains jobs after a worker crash is expected to be reclaimed when the worker starts again.

## Redis connection differences by environment

### Docker Compose

Use the service hostname:

```text
redis://redis:6379
```

`localhost` inside the web or engine container means that same container, not the Redis container.

### Single-container deployments

If a platform runs only the root Next.js Dockerfile, there is no Redis process inside that container and no Go worker process either. The localhost Redis fallback therefore cannot make the full audit pipeline work.

A complete deployment needs either:

- all three services on the same Docker/Compose-capable host; or
- separate web, worker, and Redis services connected through a reachable Redis URL.

## Graceful worker behavior

The Go worker listens for `SIGINT`/`SIGTERM` and stops accepting new work through the worker context. Jobs currently held in the processing list are designed to be recoverable after a subsequent worker startup.

The processing list is an intentional part of the deployment design rather than an error state by itself.

## Resource expectations

The Go engine defaults to five worker goroutines. Each worker may issue GitHub requests while processing an audit, so deployment resource limits and GitHub API limits should be considered when increasing `WORKERS`.

The Redis workload is small but must remain reachable by both application services. Completed reports expire after 24 hours, and failure markers expire after 10 minutes.

## Platform configuration checklist

When deploying to a platform that supports multiple services, configure:

### Web service

- Build from the repository root `Dockerfile`.
- Expose port `3000`.
- Provide the shared Redis connection through `REDIS_URL`.

### Worker service

- Build from `go-engine/Dockerfile` with `go-engine/` as the build context.
- Provide `GITHUB_TOKEN`.
- Provide the same `REDIS_URL` used by the web service.
- Set `QUEUE_NAME=queue:github-audit` unless intentionally changing the queue name.
- Set `WORKERS` according to the available resources.

### Redis service

- Provide a Redis-compatible endpoint reachable by both application services.
- Prefer private/internal networking where the platform supports it.
- Do not expose Redis publicly unless required for a specific operational reason.

The critical requirement is that the web service and Go worker use the **same Redis instance and queue name**.
