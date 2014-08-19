# Docker Worker

Docker task host for linux.

Each task is evaluated in an isolated docker container.
Docker has a bunch of awesome utilities for making this work well...
Since the images are COW running any number of task hosts is plausible
and we can manage their overall usage.

We manipulate the docker hosts through the use of the [docker remote
api]([http://docs.docker.io/en/latest/api/docker_remote_api_v1.8/)

See the [doc site](http://docs.taskcluster.net/docker-worker/index.html)
for how to use the worker from an existing `worker-type` the docs here
are for hacking on the worker itself.

## Requirements

  - Node 0.11x or greater
  - Docker
  - Packer (to build ami)

## Usage

```
# from the root of this repo) also see --help
node --harmony bin/worker.js <config>
```

### Configuration

The [defaults](config/defaults.js) contains all configuration options
for the docker worker in particular these are important:

  - `taskcluster` the credentials needed to authenticate all pull jobs
    from taskcluster.

  - `registries` registry credentials

  - `statsd` credentials for the statsd server.

### Directory Structure

  - [/bin - primary entrypoint for worker](/bin)
  - [/deploy - code related to pakcer and deployment](/pakcer)
  - [/config - configuration profiles for worker](/config)
  - [/lib - source of internal worker apis](/lib)
  - [/lib/task_listener.js - primary entrypoint of worker](/lib/task_listener.js)
  - [/lib/task.js - handler for individual tasks](/lib/task_listener.js)
  - [/lib/features/ - individual features for worker](/lib/features/)

## Running tests

The `./test/test.sh` script is used to run individual tests which are
suffixed with `_test.js` for example: `./test/test.sh test/integration/live_log_test.js`.

```sh
# from the top level

./build.sh
npm test
```

This will build the docker image for the tasks and run the entire suite.

## Deploying the worker

This repo contains a deployment script `./deploy/bin/build` (run `./deploy/bin/build
--help` for all the options) which is a wrapper
for the awesome [packer](www.packer.io) the worker is then packed up
(currently only for AWS AMI) and managed via upstart...

Overriding the defaults is easy, just copy the example configuration file
[docker_worker_opts_example.sh](/docker_worker_opts_example.sh),
fill out the missing credentials and save it as `docker-worker-opts.sh`.

Schema changes are not deployed automatically so if the
schema has been changed `./bin/update-schema.js` should be run.

### Block-Device Mapping
The AMI built with packer will mount all available instances storage under
`/mnt` and use this for storing docker images and containers. In order for this
to work you must specify a block device mapping that maps `ephemeral[0-9]` to
`/dev/sd[b-z]`.

It should be noted that they'll appear in the virtual machine as
`/dev/xvd[b-z]`, as this is how Xen storage devices are named under newer
kernels. However, the format and mount script will mount them all as a single
partition on `/mnt` using LVM.

An example block device mapping looks as follows:

```js
  {
  "BlockDeviceMappings": [
      {
        "DeviceName": "/dev/sdb",
        "VirtualName": "ephemeral0"
      },
      {
        "DeviceName": "/dev/sdc",
        "VirtualName": "ephemeral1"
      }
    ]
  }
```
