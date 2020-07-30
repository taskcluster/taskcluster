audience: worker-deployers
level: patch
reference: issue 3308
---
Docker-worker now uses taskcluster-proxy and livelog images that match its own version.  Previously, it unintentionally used very old versions of these utilities (5.1.0 and v4, respectively).
