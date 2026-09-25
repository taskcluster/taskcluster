audience: developers
level: patch
reference: issue 9194
---
The task log UI view now fetches the task name and run state through the
Taskcluster REST clients. This was the last UI view using GraphQL, so the
Apollo client, its GraphQL/subscription links, and the `@apollo/client`,
`graphql`, `subscriptions-transport-ws`, `@graphql-tools/*` and
`@rollup/plugin-graphql` dependencies have been removed from the UI.
