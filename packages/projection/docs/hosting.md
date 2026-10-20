# Hosting the viewer and recording decisions

For a host that serves Reflection bundles to people: the static viewer, the bundles beside it, an `index.json`, and, optionally, an API that records decisions. Reflection supplies the viewer, the shapes and a pure helper. The host owns the storage, the sign-in, the approver list and any notification.

## What to serve

The viewer ships with this package as static files in `node_modules/reflection-projection/viewer/` (an `index.html` and its assets). It uses relative asset paths and keeps its routes after the `#`, so it runs under any base path. Copy the folder as it is.

A host serving the viewer at `https://example.com/reflection/` lays out:

```text
/reflection/index.html                the viewer
/reflection/assets/...                its script
/reflection/reflection-config.json    optional, see below
/reflection/index.json                the bundles this host holds
/reflection/<bundleId>/manifest.json  one folder per bundle, as writeBundle wrote it
/reflection/<bundleId>/projection.json
/reflection/<bundleId>/artifacts/...
/reflection/api/decisions             optional decision API
```

Bundles are immutable. Publish a new bundle id for a new build; never change files inside a published bundle. The viewer verifies every file against the manifest and shows a changed file as unusable.

## `reflection-config.json`

Read once when the viewer starts. Both URLs are relative to the viewer's own address unless they are absolute.

```json
{ "bundlesUrl": ".", "decisionsUrl": "api" }
```

- `bundlesUrl`: where `index.json` and the bundle folders are. Default `bundles` (the layout of the local development server).
- `decisionsUrl`: the decision API. Absent means the host records no decisions, and the viewer does not ask for them.

## `index.json`

Validate it with `releaseIndexSchema` (JSON Schema: `schema/release-index.v1.schema.json`). The publish step writes it whenever a bundle is added or removed.

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-21T09:00:00Z",
  "bundles": [
    { "id": "button-2026-10-20-1", "project": "marwes", "release": "button-2026-10-20", "build": 1, "state": "candidate", "builtAt": "2026-10-20T15:00:00Z", "bundleHash": "…" }
  ],
  "latest": { "marwes": "button-2026-10-20-1" },
  "archive": []
}
```

- Every entry repeats what the bundle's manifest says (`release.bundleId`, `release.release`, `release.build`, `release.state`, `release.builtAt`, `bundleHash`). The viewer reads the manifest itself and shows a disagreement.
- `latest` names the latest bundle per project explicitly. If that bundle is missing or invalid, the viewer says so; it never falls back to another bundle.
- `archive` holds archive summaries (`buildArchiveSummary`) of releases whose evidence was removed. Each is validated on its own, so one unreadable summary does not hide the others.

## The decision API

Two calls on the same host as the viewer, so the sign-in cookie reaches them.

### Record: `POST <decisionsUrl>/decisions`

Request body, validated with `recordDecisionRequestSchema` (`schema/decision-request.v1.schema.json`):

```json
{ "bundleId": "button-2026-10-20-1", "kind": "approve", "comment": "Reads right." }
```

- `kind` is `approve`, `changes-required` (needs `message`) or `withdrawn` (needs `target`, the id of the decision it withdraws).
- The body never carries identity, a binding or counts. The browser is not trusted with any of them.

What the server does, in this order:

1. Verify the sign-in token (signature, issuer, audience, expiry) and take the person's email from it. Never accept an email from a form.
2. Check that the email is on the approver list. Refuse otherwise.
3. Check the request: a same-origin `Origin` header and a custom request header, as protection against cross-site requests.
4. Load the stored `manifest.json` and `projection.json` of `bundleId` from where the bundles are published, not from the request.
5. Call `recordDecision({ request, bundle: { manifest, projection }, identity: { email }, id, at })`. It returns the record, bound to the content (verdicts, reference hashes, capture policies, the required set), with the counts it acknowledges. It throws `DecisionRequestError` (`invalid-request`, `bundle-mismatch`) for a request it cannot record.
6. Store the record append-only, idempotently: a repeated request records once and notifies once.
7. Notify (for example one chat message per decision, counts and a link, never images).

Response: `201` with the stored record.

### Read: `GET <decisionsUrl>/decisions?release=<release>`

Response, validated with `decisionListSchema` (`schema/decision-list.v1.schema.json`): every record for that release, oldest first.

```json
{ "decisions": [ { "id": "…", "kind": "approve", "bundleId": "…", "by": "designer@example.com", "at": "…", "attestation": "human", "scope": { "release": "button-2026-10-20" }, "binding": { … }, "acknowledged": { … } } ] }
```

The viewer evaluates each record against the bundle it shows (`evaluateDecision`): **holds** (same bundle, nothing changed), **carried forward** (a rebuild with identical content) or **lapsed** (it names what changed). A withdrawn decision is shown as withdrawn. Nothing is recomputed on the server for reading.

### What a decision is not

A decision is a review signal. It changes no outcome, no proof and no count, and it starts nothing: releasing stays a separate, human step.
