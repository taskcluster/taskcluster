audience: users
level: minor
reference: bug 2064373
---
Slack notifications no longer show link previews by default. You can re-enable
that through the `unfurlLinks` / `unfurlMedia` fields on the `slack` API endpoint
or with `task.extra.notify.slackUnfurlLinks` / `slackUnfurlMedia` for route
based notifications.
