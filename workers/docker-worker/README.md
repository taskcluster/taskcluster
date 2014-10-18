<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](http://doctoc.herokuapp.com/)*

- [Docker Worker](#docker-worker)
  - [Requirements](#requirements)
  - [Usage](#usage)
    - [Configuration](#configuration)
    - [Directory Structure](#directory-structure)
  - [Running tests](#running-tests)
    - [Common problems](#common-problems)
  - [Deployment](#deployment)
    - [Requirements](#requirements-1)
    - [Building AMI's](#building-amis)
    - [Block-Device Mapping](#block-device-mapping)
    - [Updating Schema](#updating-schema)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

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

  - `pulse` the credentials for listening to [pulse](pulse.mozilla.org)
    exchanges.

  - `registries` registry credentials

  - `statsd` credentials for the statsd server.

### Directory Structure

  - [/bin - primary entrypoint for worker](/bin)
  - [/deploy - code related to pakcer and deployment](/deploy)
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

### Common problems

  - Time synchronization : if you're running docker in a VM your VM may
    drift in time... This often results in stale warnings on the queue.

## Deployment

The below is a detailed guide to how deployment works if you know what
you're doing and just need a check list see: [deployment check
list](/deploy/checklist.md)

### Requirements

  - [packer](www.packer.io)
  - make
  - node 0.11 or greater
  - credentials for required services


### Building AMI's

The docker worker deploy script is essentially a wrapper around `packer`
with an interactive configuration script to ensure you're not missing
particular environment variables. There are two primary workflows that
are important.

  1. Building the [base](/deploy/packer/base.json) AMI. Do this when:
      - You need to add new apt packages.
      
      - You need to update docker (see above).
      
      - You need to run some expensive one-off installation.

      Note that you need to _manually_ update the `sourceAMI` field in
      the `app.json` file after you create a new base AMI.

      *Example*:

      ```sh
      ./deploy/bin/build base
      ```

  2. Building the [app](/deploy/packer/app.json) AMI. Do this when:
      - You want to deploy new code/features.
      
      - You need to update diamond/statsd/configs (not packages).
      
      - You need to update any baked in credentials (these usually can
        be overriden in the provisioner but sometimes this is desirable).

      Note: That just because you deploy an AMI does not mean anyone is
      using it.. Usually you need to also update a provisioner workerType with
      the new AMI id.

      *Example*:

      ```sh
      ./deploy/bin/build app
      ```

Everything related to the deployment of the worker is in the
[deploy](/deploy) folder which has a number of other important sub
folders.

  - [deploy/packer](/deploy/packer) : The packer folder contains a list
    (app/base) of ami(s) which need to be created... Typically you only
    need to build the "app" ami which is built on a pre-existing base
    ami (see `sourceAMI` in [app.json](/deploy/packer/app.json)).

  - [deploy/variables.js](/deploy/variables.js) : contains the list of
    variables for the deployment and possible defaults

  - [deploy/template](/deploy/template) : This folder is a mirror of what will
    be deployed on the server but with mustache like variables (see
    variables.js for the list of all possible variables) if you need to
    add a script/config/etc... Add it here in one of the sub folders.

  - deploy/deploy.json : A generated file (created by running
    [deploy/bin/build](/deploy/bin/build) ) or running `make -C deploy`
    this file contains all the variables needed to deploy the
    application

  - deploy/target : Contains the final files to be uploaded when creating the
    AMI all template values have been subsituted... It is useful to
    check this by running `make -C deploy` prior to building the full ami.

  - [deploy/bin/build](/deploy/bin/build) : The script responsible for
    invoking packer with the correct arguments and creating the
    artifacts which need to be uploaded to the AMI)

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

### Updating Schema

Schema changes are not deployed automatically so if the
schema has been changed, the run the upload-schema.js script to update.

Before running the upload schema script, ensure that AWS credentials are loaded 
into your environment.  See [Configuring AWS with Node](http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html)

Run the upload-schema.js script to update the schema:

`node --harmony bin/upload-schema.js`
