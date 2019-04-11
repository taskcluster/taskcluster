* How can I deploy a new docker-worker?

First of all, you need proper taskcluster credentials. You can use the
[taskcluster-cli](https://github.com/taskcluster/taskcluster-cli)
tool to get it:
```sh
# eval $(taskcluster-cli signin --scope <scope needed>)
```
You also need the
[Taskcluster team passwordstore repo](https://github.com/taskcluster/passwordstore-garbage)
proper configured. Talk to :dustin to know how to get access to it.
The deploy scripts require node version >= 8.15.0.
With all these done, type:
```sh
# ./deploy.sh
```
To build and deploy docker-worker on worker-types, and:
```sh
# ./release.sh
```
To make a new Github release. To make a Github release, you need
a proper key stored in the environment variable `DOCKER_WORKER_GITHUB_TOKEN`.

* How can I make a deployment test of my worker?

Follow the steps of the previous items, but pass the `--test` argument to the
`deploy.sh` script. It will deploy the new AMI image only on the `ami-test`
worker-type. After your tests are finished, type:
```sh
# deploy/bin/update-worker-types.js
```
To deploy it on production.

* How can I roll back a busted deployment?

The deployment script generates the `worker-types-backup.json` file
and the release script uploads it to Github release. Put this file
in the root repo directory and type:
```sh
# ./deploy/bin/rollback-worker-types.js
```

* How do I build a base image?

```sh
# deploy/bin/import-docker-worker-secrets
# deploy/bin/build base
```
This requires the
[Taskcluster team passwordstore repo](https://github.com/taskcluster/passwordstore-garbage)
be proper configured.
