audience: users
level: minor
reference: issue 8035
---
The index service no longer adds a bewit (time-limited auth token) to redirect URLs for public artifacts. Artifacts are considered public if the anonymous role has the necessary scopes to get them. The index service caches the scopes associated to the anonymous role and refreshes them from the auth service every 5 minutes. Additionally, for public artifacts, the index service now resolves the final artifact URL server-side by calling the queue's `latestArtifact` endpoint, reducing the redirect chain from two hops (Index → Queue → storage) to one (Index → storage).
