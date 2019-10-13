level: major
---
The worker-manager service's `google` provider type now requires that worker pool definitions contain an array of possible variations of workers for the pool, in the `launchConfig` property.
See [google provider type](https://docs.taskcluster.net/docs/reference/core/worker-manager/google) for more detail.
Note that this is a breaking change that will cause all `google`-based worker pools to stop provisioning until they have been updated to the new format.
To update, change the `config` field by moving all fields *except* `minCapacity` and `maxCapacity` into an array in `launchConfigs`:

```diff
some/worker:
  config:
    minCapacity: 25
    maxCapacity: 50
-   region: us-central1
-   zone: us-central1-a
-   capacityPerInstance: 1
-   minCpuPlatform: "Intel Skylake"
-   ...
+   launchConfigs:
+     - region: us-central1
+       zone: us-central1-a
+       capacityPerInstance: 1
+       minCpuPlatform: "Intel Skylake"
+       ...
```
