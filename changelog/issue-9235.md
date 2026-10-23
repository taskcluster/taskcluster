audience: users
level: patch
reference: issue 9235
---
The notify service's `slack` endpoint now returns a 400 `InputError` when Slack rejects the channel (`channel_not_found`, `not_in_channel` or `is_archived`), instead of a 500 `InternalServerError`.
