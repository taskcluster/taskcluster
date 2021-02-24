audience: worker-deployers
level: minor
reference: issue 4050
---
Docker-worker and generic-worker now use `link` artifacts to connect `live.log` to `live_backing.log`.  This functionality requires Taskcluster services running at least Taskcluster-40.0.0.
