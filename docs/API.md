# API Reference

DevWrapped exposes a small HTTP API for starting an audit, checking its state, and reading completed results.

## Audit state machine

```text
                 POST /api/audit
                       |
                       v
                    ENQUEUED
                       |
                       v
                   PROCESSING
                    /       \
                   /         \
                  v           v
             COMPLETED      FAILED
                  |
                  v
             /<username>
```

`ENQUEUED` is primarily a client-side state. The status endpoint reports `PROCESSING` while the Redis audit lock exists.

The browser stops polling on `COMPLETED`, `FAILED`, HTTP errors, or a 90-second timeout.

## POST `/api/audit`

Starts an asynchronous GitHub audit.

### Request

```http
POST /api/audit
Content-Type: application/json
```

```json
{
  "username": "torvalds"
}
```

The username is trimmed, lowercased, and validated before a job is created.

### Successful response

A newly accepted job returns HTTP `202`:

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

If the same username already has an active audit lock, the endpoint does not enqueue another job. It returns a processing response:

```json
{
  "status": "processing",
  "message": "Audit already in progress. Listening for results..."
}
```

### Errors

| Condition | Status | Response |
| --- | ---: | --- |
| Missing username | `400` | `Username required` |
| Invalid username | `400` | `Invalid GitHub username` |
| Redis/enqueue failure | `500` | `Failed to enqueue task` |

## GET `/api/audit/status/<username>`

Returns the current state of an audit and, when complete, its processed metrics.

### Completion

When `stats:<username>` contains a valid report, the endpoint returns HTTP `200`:

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

The Go worker writes a temporary failure marker for terminal errors. The endpoint surfaces it as:

```json
{
  "status": "FAILED",
  "message": "GitHub audit failed for this user. The handle may not exist or the audit could not be completed."
}
```

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

It first reads `stats:<username>`. If valid stats exist, it returns HTTP `200`:

```json
{
  "status": "COMPLETED",
  "data": {}
}
```

If no stats exist but `lock:audit:<username>` is active, it returns HTTP `202`:

```json
{
  "status": "PROCESSING",
  "message": "Audit job in progress..."
}
```

Otherwise it returns HTTP `404`:

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
| `failed:audit:<username>` | Stores a temporary terminal failure marker |

The worker also uses `queue:github-audit:processing` for in-flight job recovery.

## Client behavior

`useAuditStatus()` submits the job and then polls the status endpoint. Polling starts after 800 ms, backs off by a factor of 1.5, and is capped at 5 seconds.

The client has a 90-second hard timeout. Starting a new audit aborts the previous submission/polling cycle, and component cleanup cancels pending timers and requests.
