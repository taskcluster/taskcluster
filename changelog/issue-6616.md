audience: users
level: patch
reference: issue 6616
---

Github service no longer cancels builds for the same SHA for `push` events.
Only `pull_request` events would cancel running builds for the same pull request if they exist.

This is to avoid canceling same commit pushed to different branches.
