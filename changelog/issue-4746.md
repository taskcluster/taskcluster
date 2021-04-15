audience: deployers
level: minor
reference: issue 4746
---
The object service is now ready for use.
The queue supports an `object` storage type which will be stored in the object service.
As of this version, we recommended setting `procs: 1` for the object service if it had previously been set to `0`, and [configuring at least one backend](https://docs.taskcluster.net/docs/manual/deploying/object-service) for artifacts.
