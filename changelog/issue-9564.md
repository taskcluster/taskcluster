audience: users
level: major
reference: issue 9564
---
`taskcluster signin` now rejects `--scope` values containing invalid characters such as newlines. If you were relying on newlines in scopes, pass `--scope` multiple times instead.
