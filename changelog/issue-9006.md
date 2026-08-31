audience: developers
level: patch
reference: issue 9006
---
UI Task Index page switches to use decorator for api call. Removed the now-unused `indexedTask`, `namespaces`, and `taskNamespace` GraphQL queries and their resolvers/loaders from web-server, since the UI no longer uses them. Other GraphQL queries against `Task` (e.g. `latestArtifacts`, still used by the Interactive Connect page) are untouched.
