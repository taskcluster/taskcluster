audience: worker-deployers
level: patch
reference: issue 7012
---
Generic Worker: Add retries around the logic that gets the current user who is logged in the gnome3 desktop session, in case race conditions are causing the following issue: `could not determine interactive username: number of gnome session users is not exactly one - not sure which user is interactively logged on: []string{""}`.
