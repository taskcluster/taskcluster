audience: worker-deployers
level: major
reference: issue 7086
---

Worker Manager introduces `launchConfigId` and schema changes:

* New `workerManager` configuration object in launch configs that includes:
  * `launchConfigId` - unique identifier for tracking and error attribution
  * `capacityPerInstance` - specify worker capacity per instance (old top-level propert is supported but is deprecated)
  * `initialWeight` - control provisioning probability (0-1)
  * `maxCapacity` - hard limit on number of instances per config

The provisioner distributes load across configs by:
* Dynamically adjusting weights based on error rates and capacity limits
* Temporarily reducing usage of configs experiencing errors
* Maintaining error history in a 1-hour sliding window
