# API Reference

DevWrapped exposes a small HTTP API for viewing cached reports, starting audits, checking audit state, and reading completed results.

Endpoints:

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/audit` | Return a cached report, or start an initial/refresh audit |
| `GET` | `/api/audit/status/<username>` | Current audit state and completed report |
| `GET` | `/api/wrapped/<username>` | Direct JSON read of completed audit data |
| `GET` | `/api/health` | Diagnostic probe: Redis reachability and queue depths |

## Audit state machine

```text
                 POST /api/audit
                       |
          +------------+-------------+
          |                          |
   cached report,               no cached report,
   no refresh                   or refresh requested
          |                          |
          v                          v
      COMPLETED                  ENQUEUED
   (returned at once,                |
    nothing enqueued,                v
    nothing polled)              PROCESSING
                                     |
                                     v
                                REFRESHING  (only when a previous report exists)
                                  /       \
                                 /         \
                                v           v
                           COMPLETED      FAILED
                                |
                                v
                           /<username>
```

`ENQUEUED` is primarily a client-side state. The status endpoint reports `PROCESSING` while an audit lock exists and no previous report is available, or `REFRESHING` while an audit lock exists and a previous report can still be shown.

The browser stops polling on `COMPLETED`, `FAILED`, HTTP errors, or a 90-second timeout. `PROCESSING` and `REFRESHING` are both non-terminal states. A cache hit resolved by `POST /api/audit` never enters this polling loop.

Implementation note: the client sets its local status (`ENQUEUED`/`REFRESHING`) and schedules the first status poll when the submission is *started*, not after the submission response confirms acceptance. In the normal case the POST resolves well inside the initial 800 ms delay and the poll timer is cancelled by cleanup, but a slow submission response can allow the first poll to hit the status endpoint before the submission is acknowledged. The 90-second client timeout also starts when polling is scheduled, not when a job is confirmed enqueued.

## POST `/api/audit`

Answers with a cached report when one exists, and starts an asynchronous GitHub audit only when there is nothing cached or a refresh was explicitly requested. The handler never calls GitHub and never waits for a worker.

### Request

```http
POST /api/audit
Content-Type: application/json
```

```json
{
  "username": "torvalds",
  "refresh": false
}
```

`refresh` is optional and defaults to `false`. Without it, the request means "show me the report": if `stats:<username>` holds a valid report, that report is returned and no audit is started. Set it to `true` to request a new audit while still receiving any cached report immediately.

The username is trimmed, lowercased, and validated before the cache is read.

### Cached report (ordinary request)

When a valid cached report exists and `refresh` was not requested, the endpoint returns HTTP `200` immediately. This is checked **before** the audit lock, so an ordinary view request resolved from the cache never touches the queue even when another client is running an audit:

```json
{
  "status": "COMPLETED",
  "cached": true,
  "username": "torvalds",
  "data": {}
}
```

No job is enqueued, no lock is taken, and the client must not poll. The browser can navigate to `/<username>` immediately.

### Explicit refresh with a cached report

When `refresh` is `true` and a cached report exists, the endpoint enqueues a job (unless one is already active) and returns the cached report immediately with HTTP `200`:

```json
{
  "status": "REFRESHING",
  "cached": true,
  "jobId": "job_1760000000000_torvalds",
  "username": "torvalds",
  "pollUrl": "/api/audit/status/torvalds",
  "data": {}
}
```

The client keeps showing `data` and polls `pollUrl` until the audit reaches `COMPLETED` or `FAILED`. `data.fetchedAt` identifies the last completed report, never the result of the running audit.

### Initial audit accepted

With no cached report (or a refresh for a handle with no report), a newly accepted job returns HTTP `202`:

```json
{
  "status": "accepted",
  "jobId": "job_1760000000000_torvalds",
  "username": "torvalds",
  "pollUrl": "/api/audit/status/torvalds"
}
```

The exact timestamp in `jobId` varies per request.

### Duplicate request

The audit-lock check is only reached when a job would otherwise be enqueued: an explicit `refresh: true`, or a request with no cached report. On that path, if the same username already has an active audit lock, the endpoint does **not** enqueue another job and does not replace the running audit. It returns HTTP `200` with either the cached report or a processing state:

```json
{
  "status": "REFRESHING",
  "message": "Audit already in progress. Listening for results...",
  "username": "torvalds",
  "pollUrl": "/api/audit/status/torvalds",
  "data": {}
}
```

When no cached report exists, `status` is `processing` and `data` is omitted. Both shapes tell the client to watch the existing audit instead of starting a new one.

### Errors

| Condition | Status | Response |
| --- | ---: | --- |
| Missing username | `400` | `Username required` |
| Invalid username | `400` | `Invalid GitHub username` |
| Any handler exception (Redis unreachable, enqueue failure, malformed JSON body) | `500` | `Failed to enqueue task` |

Accounting details worth knowing:

- A cache-read failure is swallowed by the stats reader and treated as a cache miss, so a transient Redis problem during submission can cause an unnecessary job enqueue instead of serving a report that is still present.
- A malformed JSON request body is not a validation error in the current implementation: the parse throws inside the handler's catch-all, which answers HTTP `500` with `Failed to enqueue task` even though nothing was enqueued. The lock is deleted on that failure path only if this request acquired it.

## GET `/api/audit/status/<username>`

Returns the current state of an audit and, when complete, its processed metrics.

An invalid username returns HTTP `404` with `{ "status": "NOT_FOUND" }`. All other handled outcomes below return HTTP `200` (except the server-error case); terminality is a property of the state value, not the HTTP status.

### Refreshing

When `stats:<username>` contains a previous report and the audit lock is active, the endpoint returns HTTP `200` with that report as stale data:

```json
{
  "status": "REFRESHING",
  "message": "A newer audit is running. Showing the last completed report.",
  "data": {}
}
```

`REFRESHING` is not a terminal state. Clients should keep polling and should use `data.fetchedAt` to label the report as the last completed result, not the result of the running audit.

### Completion

When no audit is running and `stats:<username>` contains a valid report, the endpoint returns HTTP `200`:

```json
{
  "status": "COMPLETED",
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

The example data object is abbreviated; the actual response contains the processed `DevWrappedStats` fields.

### Processing

When no completed report exists but the audit lock is active:

```json
{
  "status": "PROCESSING",
  "message": "Audit in progress..."
}
```

### Failure

The Go worker writes a temporary failure marker for terminal errors. When no newer audit is running, the endpoint surfaces it as:

```json
{
  "status": "FAILED",
  "message": "GitHub audit failed for this user. The handle may not exist or the audit could not be completed.",
  "data": {}
}
```

If a previous successful report exists, it is included as `data` so the dashboard can keep showing it. The failure marker is cleared before a new audit is enqueued and after a subsequent successful audit, so a retry is not reported as failed. An active lock always takes precedence over a failure marker.

### Not found

If no completed report, failure marker, or active lock exists, the endpoint returns HTTP `404`:

```json
{
  "status": "NOT_FOUND"
}
```

### Unexpected server error

HTTP `500`:

```json
{
  "status": "ERROR",
  "message": "An error occurred while fetching the audit status.",
  "data": null
}
```

## GET `/api/health`

Deployment diagnostic endpoint (`force-dynamic`, not CDN-cacheable). Returns HTTP `200` with:

```json
{
  "status": "ok",
  "redis": "connected",
  "queueDepth": 0,
  "processingDepth": 0
}
```

`queueDepth` is the pending `queue:github-audit` length; `processingDepth` is the durable in-flight holding list. A queue that grows while no audit is active means no worker is consuming; a processing list that retains jobs after a crash is reclaimed on the next worker start. If Redis is unreachable, the endpoint returns HTTP `503`:

```json
{
  "status": "degraded",
  "redis": "unreachable",
  "hint": "Check REDIS_URL (must be rediss:// for Render Key Value) and that the worker service is deployed."
}
```

## GET `/api/wrapped/<username>`

This endpoint provides a direct JSON read of completed audit data.

It first reads `stats:<username>` and `lock:audit:<username>`.

- If a report exists and no audit is running, it returns HTTP `200` with `COMPLETED`.
- If a report exists and an audit is running, it returns HTTP `200` with `REFRESHING` and the previous report as stale `data`.
- If no report exists but an audit is running, it returns HTTP `202` with `PROCESSING`.

`COMPLETED` response:

```json
{
  "status": "COMPLETED",
  "data": {}
}
```

`REFRESHING` response:

```json
{
  "status": "REFRESHING",
  "message": "A newer audit is in progress. Showing the last completed report.",
  "data": {}
}
```

If no report exists and no audit is running, it returns HTTP `404`:

```json
{
  "status": "NOT_FOUND",
  "message": "No audited stats found for this user."
}
```

Unexpected errors return HTTP `500` with:

```json
{
  "error": "Failed to retrieve wrapped statistics"
}
```

Response-HTTP-caching note: `src/proxy.ts` stamps `/api/wrapped/<username>` with `public, s-maxage=30, stale-while-revalidate=60`. See [DEPLOYMENT.md](DEPLOYMENT.md) for the full caching policy.

## Username validation

The shared audit helper normalizes usernames with:

```text
trim -> lowercase
```

Validation accepts 1-39 characters consisting only of:

```text
A-Z a-z 0-9 -
```

The same normalized username is used to build Redis keys in both the Next.js and Go processes.

## Redis keys used by the API

| Key | API role |
| --- | --- |
| `lock:audit:<username>` | Indicates an active audit and prevents duplicate submissions |
| `queue:github-audit` | Receives new jobs from `POST /api/audit` |
| `stats:<username>` | Stores the completed report written by the Go worker |
| `failed:audit:<username>` | Stores a temporary terminal failure marker; cleared before a new audit is enqueued and after a later audit succeeds |

The worker also uses `queue:github-audit:processing` for in-flight job recovery.

## Client behavior

`useAuditStatus()` submits the request and stops at the submission response when it is a cache hit.

- A `COMPLETED` submission response is a cache hit: the hook stores the report and resolves immediately, normally before the first scheduled poll runs. No polling loop is entered.
- An `accepted`, `processing`, or `REFRESHING` submission response means a job is running (or already was), so the hook polls the status endpoint. The first poll is scheduled 800 ms after the request starts (see the implementation note above), the interval backs off by a factor of 1.5 to a 5-second cap, and there is a 90-second deadline measured from polling start.

Client-side terminal handling:

- `COMPLETED`: store `data`, stop polling, navigate or (on the same dashboard) trigger a server-component refresh.
- `FAILED`, or any HTTP error status including `404 NOT_FOUND` and `500 ERROR`: stop polling, keep any `data` that came with the failure, and surface the error message.
- `PROCESSING` / `REFRESHING`: non-terminal; keep polling. A `REFRESHING` response supplies the previous report, which stays on screen; it must not be treated as completion or navigation.
- A response the client cannot parse as the expected JSON shape is replaced by an internal `ERROR` payload; if the HTTP response was still `2xx`, the client keeps polling until the deadline rather than failing immediately.
- Polling/connection errors: fail immediately, except for aborted requests (new submission or unmount), which are silently dropped.

The dashboard navbar has an explicit Refresh action that submits `{ refresh: true }` for the displayed user. The cached dashboard stays mounted and labelled `REFRESHING` for the duration, and a completed refresh triggers a server-component refresh instead of a full page reload. Searching from the landing page or the dashboard navbar is a view action and does not request a refresh.

Starting a new audit aborts the previous submission/polling cycle via an `AbortController`, and component cleanup cancels pending timers and requests.
