audience: general
level: patch
reference: issue 6564
---

Fixes CSP related issue with running single UI container locally `docker compose ui`. If run with shipped nginx.conf, it would not be able to load some resources correctly becaues of the strictre 'Content-Security-Policy' headers.
