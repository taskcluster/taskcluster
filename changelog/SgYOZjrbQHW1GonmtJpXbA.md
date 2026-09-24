audience: users
level: patch
---
Web-server session cookie is now set with `SameSite=lax` to mitigate CSRF against session-authenticated endpoints.
The cookie is no longer sent on cross-site requests, while same-origin UI and OAuth login redirects are unaffected.
