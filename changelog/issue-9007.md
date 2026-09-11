audience: users
level: patch
reference: issue 9007
---
Generic Worker now resolves a task as `malformed-payload` when the Queue rejects a `createArtifact` request with a 4xx response, instead of crashing with an unrecovered panic. Additionally, an explicit artifact `name` containing characters outside the printable ASCII range is now rejected up front by task payload validation, rather than later on at task completion/artifact upload. Generic Worker task payloads have always allowed artifacts to be declared without an explicit artifact name, in which case the `name` is derived from the `path`. The new upfront `name` validation only applies when the `name` is specified, and therefore an artifact declared with a `path` but no `name` may still be rejected on task completion/artifact upload if the derived artifact name contains disallowed characters.
