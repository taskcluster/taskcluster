level: major
---
The web-server application no longer generates a JWT when logging in. It uses a session secret. An additional
configuration value `SESSION_SECRET` is required to compute the session hash. `JWT_KEY` is no longer needed.
