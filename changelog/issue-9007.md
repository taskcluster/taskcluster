audience: users
level: patch
reference: issue 9007
---
Generic Worker now resolves a task as `malformed-payload` when the Queue rejects a `createArtifact` request with a 4xx response, instead of crashing with an unrecovered panic. Additionally, an explicit artifact `name` containing characters outside the printable ASCII range is now rejected up front by task payload validation (to match Queue requirements), so tasks that set an explicit invalid name fail immediately as `malformed-payload` rather than after running to completion. An artifact name derived from `path` (when `name` is not set) is not covered by this upfront check, and still relies on the graceful 4xx handling above. The same upfront pattern validation now also applies to `logs.live` and `logs.backing` (and the equivalent Docker Worker payload `log` field).

This applies to both Generic Worker native payloads and Docker Worker task payloads.
