audience: users
level: minor
reference: issue 7374
---
Add task profiler REST API endpoints:
- `GET /api/web-server/v1/task-group/<taskGroupId>/profile` — returns Firefox Profiler JSON for a task group timeline
- `GET /api/web-server/v1/task/<taskId>/profile` — returns Firefox Profiler JSON for a task's log

Profiles are shareable via `profiler.firefox.com/from-url/<encoded-url>`. External tools like Treeherder can link directly.

UI adds "Open in Profiler" speed-dial actions on task group and task views, and a dedicated `/task/groups/:id/profiler` route.
