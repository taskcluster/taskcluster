# Documentation

The documentation in this directory is automatically generated from the API entries
generated from the [Taskcluster Manifest Reference](http://references.taskcluster.net/manifest.json).
Detailed documentation with description, payload, and result formats is available on
[docs.taskcluster.net](http://docs.taskcluster.net).

On the [documentation site](http://docs.taskcluster.net) entries often have a
_signature_; you'll find that it corresponds with the signatures below. Note that all
the methods return a `Promise`. A method marked with `Promise Result` is a promise that
resolves with the API result. A method marked with `Promise Nothing` will also return a
promise but has no resulting value from the API to resolve. Remember to `catch` any errors
that may be rejected from a Promise.

- [AuthEvents](authevents.md)
- [Login](login.md)
- [Index](index.md)
- [Auth](auth.md)
- [Github](github.md)
- [PurgeCacheEvents](purgecacheevents.md)
- [Pulse](pulse.md)
- [PurgeCache](purgecache.md)
- [QueueEvents](queueevents.md)
- [Notify](notify.md)
- [Hooks](hooks.md)
- [AwsProvisionerEvents](awsprovisionerevents.md)
- [AwsProvisioner](awsprovisioner.md)
- [TreeherderEvents](treeherderevents.md)
- [SchedulerEvents](schedulerevents.md)
- [Secrets](secrets.md)
- [GithubEvents](githubevents.md)
- [Scheduler](scheduler.md)
- [Queue](queue.md)
