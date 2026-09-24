audience: users
level: patch
reference: issue 9180
---
Live-update subscriptions in the UI now obtain fresh credentials each time they connect, and stop retrying when the server rejects the credentials as expired. The web-server no longer reports expired subscription credentials as internal errors.
