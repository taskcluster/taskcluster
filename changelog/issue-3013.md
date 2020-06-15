audience: developers
level: minor
reference: issue 3013
---
Github integration can now set [annotations](https://developer.github.com/v3/checks/runs/#annotations-object) for check runs.
By default it will read `public/github/customCheckRunAnnotations.json` but if it can be overridden by setting
`task.extra.github.customCheckRun.annotationsArtifactName`. The json will be passed along unmodified.
