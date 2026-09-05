# Development Guide

## Prerequisites

The project is a Next.js application using TypeScript. The Dockerfile currently builds and runs it on Node.js 22 Alpine.

For local development, install a current Node.js release compatible with the repository dependencies and npm. The repository already includes `package-lock.json`, so use `npm ci` for a clean dependency installation.

Redis is required for normal local execution because the server module creates an ioredis client. The client defaults to `redis://localhost:6379` when `REDIS_URL` is not supplied.

## Environment variables

Create a local environment file that is not committed to Git:

```env
GITHUB_TOKEN=your_github_token
REDIS_URL=redis://localhost:6379
```

`GITHUB_TOKEN` is mandatory for the GitHub GraphQL integration. Without it, requests to the wrapped-data API fail before the GraphQL request is made.

`REDIS_URL` is optional in the sense that the code has a localhost default, but a reachable Redis instance must still exist if the API route is executed.

Do not expose `GITHUB_TOKEN` in client-side code or `NEXT_PUBLIC_*` variables.

## Install dependencies

```bash
npm ci
```

## Start Redis locally

The simplest development option is Docker:

```bash
docker run --name devwrap-redis -p 6379:6379 -d redis:7-alpine
```

Or use the repository's Compose setup:

```bash
docker compose up --build
```

The Compose file starts both the Next.js application and Redis. The web container listens on port `3000` and the Redis container listens on port `6379`.

## Run the Next.js development server

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

The landing page accepts a GitHub username and navigates to `/<username>`.

## Useful npm scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run build` | Produce a production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |

There is currently no dedicated automated test script in `package.json`.

## Application routes

### Landing page

```text
GET /
```

Implemented in `src/app/page.tsx`.

The form lowercases the entered handle and navigates to the dynamic user route. The page also includes quick-select handles for demos.

### User dashboard

```text
GET /<username>
```

Implemented in `src/app/[username]/page.tsx`.

This is a client component. It resolves the dynamic route parameter, requests the API endpoint, displays a loading state while the request is running, and renders an error state when the request fails.

### Wrapped-data API

```text
GET /api/wrapped/<username>
```

Implemented in `src/app/api/wrapped/[username]/route.ts`.

A successful response follows this shape:

```json
{
  "source": "api",
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

`source` is `cache` when the response was served from Redis and `api` when GitHub data was fetched and processed during the request.

## Working on the GitHub query

The GraphQL query lives in `src/lib/github.ts`.

When changing the query, update the matching TypeScript interfaces in `src/types/github.ts` and then update `processGithubMetrics()` if the new field needs transformation.

Keep raw GitHub response types and UI-facing metric types separate. The application intentionally converts a relatively large API response into a compact `DevWrappedStats` object before passing data to the dashboard.

## Working on metrics

`src/lib/metrics.ts` is the main place for derived analytics.

A good workflow for metric changes is:

1. Add or modify the raw field in `src/types/github.ts`.
2. Add the field to the GraphQL query.
3. Transform it inside `processGithubMetrics()`.
4. Add the resulting property to `DevWrappedStats` when the UI needs it.
5. Update the appropriate dashboard card.

Be explicit about the population represented by a metric. For example, repository language composition is calculated from the first 50 owned non-fork repositories returned by the query, while contribution totals come from GitHub's aggregate contribution fields.

## Working on the dashboard

`src/components/editorial-dasboard.tsx` composes the dashboard from focused cards:

```text
NavBar
UserHero
LanguageCard
StreakCard
PREfficiencyCard
MomentumCard
```

Keep data calculation out of the visual components whenever possible. The cards should receive already-processed values from `DevWrappedStats`.

The export control depends on the `dashboard-export` element ID. Avoid removing or renaming that element without updating `handleExportPng()`.

## Error handling

The API route deliberately treats Redis as a best-effort cache. A Redis read failure should not prevent a GitHub request, and a Redis write failure should not replace a successful API response with an error.

The outer route handler converts GitHub rate-limit failures into HTTP 429 and unexpected failures into HTTP 500.

When adding new error cases, preserve useful server logs while returning a safe, readable message to the browser.

## Docker development and production

The Dockerfile uses three stages:

1. `deps`: installs dependencies with `npm ci`.
2. `builder`: copies the source and creates the Next.js production build.
3. `runner`: copies the standalone output and static assets into a minimal Node 22 Alpine image.

The runtime image runs as a non-root `nextjs` user. This should be preserved when modifying the image.

The Next.js config sets:

```ts
output: "standalone"
```

Do not remove that setting without also changing the production Dockerfile, because the runtime stage expects the standalone server output.

## Linting and build verification

Before opening a pull request, run:

```bash
npm run lint
npm run build
```

For a Docker-focused change, also run:

```bash
docker compose build
```

For API changes, exercise at least one valid GitHub username and one invalid/non-existent username through `/api/wrapped/<username>`.

## Pull request expectations

Documentation or feature PRs should explain what changed and why. For implementation changes, describe the affected request path and the metrics or UI behavior that changed.

Keep changes focused. If a cleanup is unrelated to the feature or documentation task, put it in a separate PR.
