audience: users
level: patch
reference: issue 7014
---
Generic Worker now adds `environment.imageHash` (always), and
`environment.imageArtifactHash` (when present) to `public/chain-of-trust.json`
when running Docker Worker Chain of Trust tasks, to match Docker Worker
behaviour.
