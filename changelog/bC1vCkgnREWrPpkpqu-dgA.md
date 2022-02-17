audience: general
level: patch
---
Updated nginx user config location due to node LTS upgrade changing paths from `/etc/nginx/conf.d/default.conf` to `/etc/nginx/http.d/default.conf`.
Also, added `__heartbeat__` config back to `nginx.conf` to continue to serve 200s until work in https://github.com/taskcluster/taskcluster/issues/4597 is complete.
