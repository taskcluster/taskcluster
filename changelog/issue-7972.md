audience: users
level: minor
reference: issue 7972
---
The hooks search now searches all hooks server-side, not just the hook groups visible
on the initial page. Previously, searching for a hook on the Hooks page would only
match hook group names visible at the time; hooks within groups were not searchable.

The search is now handled by the hooks service: group names and hook IDs are matched
server-side (case-insensitive substring), so results are accurate and fast regardless
of how many hook groups or hooks exist.

The `searchHooks` API endpoint (`GET /hooks/search`) now supports pagination.
Responses include a `continuationToken` field when more results are available;
pass it as the `continuationToken` query parameter to retrieve the next page.
The default page size is 100 (configurable up to 1000 via the `limit` parameter).
