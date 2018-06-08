# Documentation

The documentation in this directory is automatically generated from the API entries
generated from the [Manifest Reference](http://references.taskcluster.net/manifest.json).
Detailed documentation with description, payload, and result formats is available on
[Taskcluster Docs](https://docs.taskcluster.net/).

On the [documentation site](https://docs.taskcluster.net/) entries often have a
_signature_; you'll find that it corresponds with the signatures below. Note that all
the methods return a `Promise`. A method marked with `Promise Result` is a promise that
resolves with the API result. A method marked with `Promise Nothing` will also return a
promise but has no resulting value from the API to resolve. Remember to `catch` any errors
that may be rejected from a Promise.

- [Auth](auth.md)
- [AuthEvents](authevents.md)
- [AwsProvisioner](awsprovisioner.md)
- [AwsProvisionerEvents](awsprovisionerevents.md)
- [EC2Manager](ec2manager.md)
- [Github](github.md)
- [GithubEvents](githubevents.md)
- [Hooks](hooks.md)
- [Index](index.md)
- [Login](login.md)
- [Notify](notify.md)
- [PurgeCache](purgecache.md)
- [PurgeCacheEvents](purgecacheevents.md)
- [Queue](queue.md)
- [QueueEvents](queueevents.md)
- [Secrets](secrets.md)
- [TreeherderEvents](treeherderevents.md)
