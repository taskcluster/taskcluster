audience: users
level: minor
reference: issue 8101
---
Queue artifact creation (`createArtifact`) now accepts an optional `contentLength` field for S3 and object artifacts. When provided, the artifact size in bytes is stored and returned in `listArtifacts`, `artifactInfo`, and related endpoints.
