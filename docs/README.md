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

- [Index](index.md)
- [AuthEvents](authevents.md)
- [SchedulerEvents](schedulerevents.md)
- [PurgeCacheEvents](purgecacheevents.md)
- [Login](login.md)
- [AwsProvisionerEvents](awsprovisionerevents.md)
- [Pulse](pulse.md)
- [Notify](notify.md)
- [GithubEvents](githubevents.md)
- [Scheduler](scheduler.md)
- [Github](github.md)
- [TreeherderEvents](treeherderevents.md)
- [Auth](auth.md)
- [AwsProvisioner](awsprovisioner.md)
- [Secrets](secrets.md)
- [Hooks](hooks.md)
- [PurgeCache](purgecache.md)
- [QueueEvents](queueevents.md)
- [Queue](queue.md)
