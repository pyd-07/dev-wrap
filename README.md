# DevWrapped

DevWrapped turns a GitHub username into an editorial-style developer activity dashboard. It retrieves GitHub contribution and repository data, derives a small set of developer metrics, caches the processed result in Redis, and presents the result as a shareable dashboard.

> **Status:** early-stage personal project. The implementation is functional, but some analytics currently use bounded GitHub result windows. See the [metrics reference](docs/METRICS.md) for the exact definitions and limitations.

## What it shows

For a GitHub user, DevWrapped currently presents:

- Profile information, follower/following counts, and biography
- Total contributions, commits, pull requests created, pull requests reviewed, and issues
- Top language composition based on aggregated repository language bytes
- Current and longest contribution streaks
- Pull-request totals, state counts, and merge rate
- A client-side PNG export of the dashboard

The landing page describes the experience as an annual developer intelligence audit; the underlying implementation is a GitHub-data dashboard rather than a full historical analytics warehouse.

## How it works

```text
GitHub username
      |
      v
Next.js /<username>
      |
      v
GET /api/wrapped/<username>
      |
      +--> Redis cache hit ------> processed metrics
      |
      +--> cache miss --> GitHub GraphQL
                              |
                              v
                       metric processing
                              |
                              +--> Redis SETEX (24h)
                              |
                              v
                        processed metrics
                              |
                              v
                       editorial dashboard
```

The server authenticates to GitHub with `GITHUB_TOKEN`. Redis is treated as a best-effort cache: read/write failures are logged but do not replace a successful GitHub response with a cache error.

## Tech stack

- Next.js 16 App Router
- React 19 + TypeScript
- GitHub GraphQL API via `@octokit/graphql`
- Redis via `ioredis`
- Tailwind CSS 4
- Recharts and Framer Motion for UI presentation
- `html-to-image` for dashboard PNG export
- Docker / Docker Compose for containerized execution

The repository uses Next.js standalone output for the production Docker image. See [`next.config.ts`](next.config.ts) and [`Dockerfile`](Dockerfile).

## Local development

### Prerequisites

Install Node.js and npm, and make Redis available on `localhost:6379`.

### Environment

Create a local environment file with:

```env
GITHUB_TOKEN=your_github_token
REDIS_URL=redis://localhost:6379
```

`GITHUB_TOKEN` is required by the GitHub GraphQL integration. `REDIS_URL` defaults to `redis://localhost:6379` when omitted.

Never expose `GITHUB_TOKEN` through client-side variables such as `NEXT_PUBLIC_*`.

### Install and run

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

For a local Redis instance using Docker:

```bash
docker run --name devwrap-redis -p 6379:6379 -d redis:7-alpine
```

Or start the application and Redis together:

```bash
docker compose up --build
```

### Available scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

There is currently no dedicated automated test command in `package.json`.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Search for a GitHub username and open its dashboard |
| `/<username>` | Fetch and render one user's DevWrapped dashboard |
| `/api/wrapped/<username>` | Return the processed metrics JSON, using Redis when available |

A successful API response looks like:

```json
{
  "source": "cache",
  "data": {
    "user": {},
    "overview": {},
    "languages": [],
    "streak": {},
    "pullRequests": {},
    "fetchedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

`source` is `cache` for a Redis hit and `api` when fresh GitHub data was fetched during that request.

## Project structure

```text
src/
├── app/
│   ├── page.tsx                         # landing page
│   ├── [username]/page.tsx              # user dashboard route
│   └── api/wrapped/[username]/route.ts  # JSON API
├── components/
│   ├── editorial-dasboard.tsx            # dashboard composition + PNG export
│   └── dashboard/                       # dashboard cards and navigation
├── lib/
│   ├── github.ts                        # GitHub GraphQL query/client
│   ├── metrics.ts                       # derived metrics
│   ├── redis.ts                          # Redis client
│   └── utils.ts
└── types/
    └── github.ts                        # raw and processed data contracts
```

The spelling `editorial-dasboard.tsx` is retained from the current repository path for compatibility.

## Metrics and data limitations

The exact formulas are documented in [`docs/METRICS.md`](docs/METRICS.md).

Two important limits are built into the current GraphQL query:

- Up to 50 owned, non-fork repositories are considered for language composition.
- Up to 100 pull-request nodes are requested for state counts.

As a result, language composition should be interpreted as a composition of the returned repository window, not necessarily every repository in the user's account. Pull-request state counts can also differ from the total count because `totalCount` and node results come from different parts of the query.

Contribution totals such as commits, issues, pull-request contributions, reviews, and total calendar contributions come from GitHub's aggregate contribution fields.

## Caching

Results are stored in Redis under:

```text
user:stats:<normalized-username>
```

The TTL is 24 hours. The API also sends a one-hour client freshness value and a 24-hour shared-cache value through `Cache-Control`.

The cache is an optimization, not a dependency for correctness. Redis read failures fall through to GitHub; Redis write failures do not prevent a successful response.

## Docker

The repository includes a multi-stage Dockerfile that:

1. installs dependencies with `npm ci`
2. creates the Next.js production build
3. runs the standalone server in Node 22 Alpine
4. runs the production process as a non-root `nextjs` user

Compose defines a `web` service on port `3000` and a `redis` service on port `6379`.

## Development workflow

Before submitting a change:

```bash
npm run lint
npm run build
```

For Docker changes, also run:

```bash
docker compose build
```

For API changes, verify at least one valid username and one invalid username against `/api/wrapped/<username>`.

See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for the detailed development workflow and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the system design.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — request flow, application structure, server/client boundary, caching, deployment, and implementation constraints
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — local setup, environment variables, commands, routes, and contribution workflow
- [`docs/METRICS.md`](docs/METRICS.md) — metric definitions, formulas, source fields, freshness, and limitations

## License

No license file is currently present in the repository, so the project should be treated as **all rights reserved** unless the repository owner adds a license.
