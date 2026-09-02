audience: users
level: patch
reference: issue 9007
---
Generic Worker now resolves a task as `malformed-payload` when the Queue rejects a `createArtifact` request with a 4xx response, instead of crashing with an unrecovered panic. Additionally, artifact names containing characters outside the printable ASCII range are now rejected up front by task payload validation (to match Queue requirements), so affected tasks fail immediately as `malformed-payload` rather than after running to completion.

This applies to both Generic Worker native payloads and Docker Worker task payloads.
