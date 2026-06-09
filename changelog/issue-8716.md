level: minor
audience: deployers
reference: issue 8716
---
Removed the `sift` dependency from the web-server. The GraphQL `filter: JSON` argument was only ever used for simple case-insensitive substring search, so it has been replaced with a typed `searchTerm: String` argument on the list queries that support search (clients, roles, secrets, worker pools, denylist addresses). Task-action filtering is now applied server-side, and the unused `filter` argument has been removed from the remaining GraphQL queries.
