audience: users
level: patch
reference: issue 5779
---
Fix `View logs in Taskcluster` link in GitHub Checks UI to default to a run ID of 0 to prevent it from being undefined and getting a 400 Bad Response while accessing this link.
