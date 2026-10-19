# API Reference

DevWrapped exposes a small HTTP API for starting an audit, checking its state, and reading completed results.

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

When a valid cached report exists and `refresh` was not requested, the endpoint returns HTTP `200` in a single Redis round trip:

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

If the same username already has an active audit lock, the endpoint does not enqueue another job and does not replace the running audit. It returns HTTP `200` with either the cached report or a processing state:

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
| Redis/enqueue failure | `500` | `Failed to enqueue task` |

## GET `/api/audit/status/<username>`

Returns the current state of an audit and, when complete, its processed metrics.

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

`useAuditStatus()` submits the request and only polls when an audit actually started.

- A `COMPLETED` submission response is a cache hit: the hook stores the report and resolves immediately, with no polling and no navigation delay.
- An `accepted`, `processing`, or `REFRESHING` submission response means a job is running (or already was), so the hook polls the status endpoint. Polling starts after 800 ms, backs off by a factor of 1.5, and is capped at 5 seconds.

`PROCESSING` and `REFRESHING` are non-terminal: the client keeps polling through both. A `REFRESHING` response populates the dashboard with the previous report while the current audit runs, but it must not be treated as completion and must not trigger navigation. Only `COMPLETED` marks the current audit complete and updates the displayed report. A `FAILED` response may carry the last successful report, which remains visible.

The dashboard navbar has an explicit Refresh action that submits `{ refresh: true }` for the displayed user. The cached dashboard stays mounted and labelled `REFRESHING` for the duration, and a completed refresh triggers a server-component refresh instead of a full page reload. Searching from the landing page or the dashboard navbar is a view action and does not request a refresh.

The client has a 90-second hard timeout. Starting a new audit aborts the previous submission/polling cycle, and component cleanup cancels pending timers and requests.
