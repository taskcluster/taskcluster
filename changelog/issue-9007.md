audience: users
level: patch
reference: issue 9007
---
Generic Worker no longer panics when the Queue rejects a `createArtifact` call with a 4xx response. The task is resolved as `exception/malformed-payload`, or as `exception/resource-unavailable` for 408 and 429. `logs.live` and `logs.backing` must now match `^[\x20-\x7e]+$`, and a non-empty artifact `name` must match the same character set. An empty artifact `name` is still allowed and means "derive from `path`"; if that `path` contains other characters, the Queue still rejects the artifact at upload time.
