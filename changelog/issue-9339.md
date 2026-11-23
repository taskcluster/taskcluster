audience: worker-deployers
level: minor
reference: issue 9339
---
For Google and Azure worker pools, worker-manager now weights each launch configuration by its own recent failure rate (errors versus workers that registered and are still running, over the last 15 minutes) instead of its share of the pool's errors. The window can be changed with the new `worker_manager.launch_config_health_window_minutes` setting.
