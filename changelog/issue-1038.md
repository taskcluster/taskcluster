level: major
---
The web-server application no longer generates a JWT when logging in. It uses a sessions to keep track of users.
The `JWT_KEY` configuration variable in web-server should be replaced with `SESSION_SECRET` which is used to compute
the session hash.
