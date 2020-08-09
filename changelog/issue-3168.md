audience: worker-deployers
level: minor
reference: issue 3168
---
The worker-manager now supports a `scalingRatio` that determines how much worker capacity to spawn per pending task.
The `scalingRatio` is a ratio of worker capacity to pending tasks - a ratio of 1.0 means that 1 capacity will be added for each pending task.

