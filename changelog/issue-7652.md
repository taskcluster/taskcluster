audience: worker-deployers
level: minor
reference: issue 7652
---
Generic Worker & Livelog: fix livelog temporary streaming files not being cleaned up. The livelog process creates a temp directory per stream, but since the generic worker kills it with SIGKILL, the process never has a chance to clean up. Fixed by having the generic worker create a dedicated temp directory for each livelog process (via the new `LIVELOG_TEMP_DIR` env var) and removing it after the process is killed.
