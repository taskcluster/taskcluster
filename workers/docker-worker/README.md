- [Docker Worker](#docker-worker)
  - [Requirements](#requirements)
  - [Usage](#usage)
    - [Configuration](#configuration)
    - [Directory Structure](#directory-structure)
  - [Environment](#environment)
    - [Loopback Devices](#loopback-devices)
  - [Running tests](#running-tests)
    - [Common problems](#common-problems)
  - [Updating Documentation](#updating-documentation)
  - [Deployment](#deployment)
    - [Requirements](#requirements-1)
    - [Building AMI's](#building-amis)
    - [Block-Device Mapping](#block-device-mapping)
    - [Updating Schema](#updating-schema)
    - [Post-Deployment Verification](#post-deployment-verification)


# Docker Worker

Docker task host for linux.

Each task is evaluated in an restricted docker container.
Docker has a bunch of awesome utilities for making this work well...
Since the images are COW running any number of task hosts is plausible
and we can manage their overall usage.

We manipulate the docker hosts through the use of the [docker remote
api](https://docs.docker.com/engine/api/v1.24/)

See the [doc site](http://docs.taskcluster.net/workers/docker-worker/index.html)
for how to use the worker from an existing `worker-type` the docs here
are for hacking on the worker itself.

## Requirements

  - Node >= 6.0
  - Docker
  - Packer (to build AMI)

## Usage

```
# from the root of this repo) also see --help
node --harmony bin/worker.js <config>
```

### Configuration

The [defaults](config.yml) contains all configuration options
for the docker worker in particular these are important:

  - `taskcluster` the credentials needed to authenticate all pull jobs
    from taskcluster.

  - `pulse` the credentials for listening to [pulse](pulse.mozilla.org)
    exchanges.

### Directory Structure

  - [src/bin - primary entrypoint for worker](src/bin)
  - [/deploy - code related to pakcer and deployment](/deploy)
  - [src/lib - source of internal worker apis](src/lib)
  - [src/lib/task_listener.js - primary entrypoint of worker](src/lib/task_listener.js)
  - [src/lib/task.js - handler for individual tasks](src/lib/task_listener.js)
  - [src/lib/features/ - individual features for worker](src/lib/features/)

### Environment

docker-worker runs in an Ubuntu environment with various packages and kernel modules
installed.

Within the root of the repo is a Vagrantfile and vagrant.sh script that simplifies
creating a local environment that mimics the one uses in production.  This environment
allows one to not only run the worker tests but also to run images used in TaskCluster
in an environment similar to production without needing to configure special things
on the host.

#### Loopback Devices

The v4l2loopback and snd-aloop kernel modules are installed to allow loopback audio/video
devices to be available within tasks that require them.  For information on how to
configure these modules like production, consult the [vagrant script](https://github.com/taskcluster/docker-worker/blob/master/vagrant.sh)
used for creating a local environment.

## Running tests

There are a few components that must be configured for the tests to work properly (e.g. docker, kernel
modules, and other packages).  To ease the setup, a vagrant file is provided in this repo that can setup
an environment very similar to the one docker-worker runs in production.

#### Setting up vagrant

1. Install [VirtualBox](https://www.virtualbox.org/)
2. Install [Vagrant](https://www.vagrantup.com/)
3. Install vagrant-reload by running `vagrant plugin install vagrant-reload`
4. Within the root of the repo, run `vagrant up`

*** Note: If TASKCLUSTER_ACCESS_TOKEN, TASKCLUSTER_CLIENT_ID, PULSE_USERNAME, PULSE_PASSWORD are configured within the virtual environment if available locally when building ***

#### Logging into virtual machine and configuring environment

1. `vagrant ssh`
2. The tests require TASKCLUSTER_ACCESS_TOKEN, TASKCLUSTER_CLIENT_ID, PULSE_USERNAME, PULSE_PASSWORD to be setup within the environment.  If they were not available locally when building, add them to the virtual machine now.
3. `cd /vagrant` # Your local checkout of the docker-worker repo is made available under the '/vagrant' directory
4. `./build.sh` # Builds some of the test images that are required
5. `yarn install --frozen-lockfile` # Installs all the necessary node modules

#### Running Tests

The following set of scopes are needed for running the test suites:

* queue:create-task:no-provisioning-nope/dummy-type-*
* queue:claim-work:no-provisioning-nope/*
* queue:claim-task
* queue:resolve-task
* queue:create-artifact:public/*
* queue:get-artifact:private/docker-worker-tests/*
* queue:cancel-task
* assume:worker-type:no-provisioning-nope/dummy-type-*
* assume:scheduler-id:docker-worker-tests/*
* assume:worker-id:random-local-worker/dummy-worker-*

1. Either all the tests can be run, but running `yarn test` or `./test/test.sh`, however, under most circumstances one only wants to run a single test suite
2. For individual test files, run `./node_modules/mocha/bin/mocha --bail .test/<file>`
3. For running tests within a test file, add "--grep <phrase>" when running the above command to capture just the individual test name.

*** Note: Sometimes things don't go as planned and tests will hang until they timeout.  To get more insight into what went wrong, set "DEBUG=*" when running the tests to get more detailed output. ***

### Common problems

  - Time synchronization : if you're running docker in a VM your VM may
    drift in time... This often results in stale warnings on the queue.
    
## Updating Documentation

Documentation for this project lives under docs/ .  Upon merging, documentation will be uploaded to s3 to display on docs.taskcluster.net automatically.

## Deployment

The below is a detailed guide to how deployment works if you know what
you're doing and just need a check list see: [deployment check
list](/deploy/checklist.md)

### Requirements

  - [packer](www.packer.io)
  - make
  - node >= 6.0
  - credentials for required services

### Amazon Credentials

docker-worker is currently deployed to AWS EC2.  Using packer to configure and deploy an AMI requires
Amazon credentials to be specified.  Follow this [document](https://www.packer.io/docs/builders/amazon.html) to configure the environment appropriately.

### Building AMI's

The docker worker deploy script is essentially a wrapper around `packer`
with an interactive configuration script to ensure you're not missing
particular environment variables. There are two primary workflows that
are important.

  1. Building the [base](/deploy/packer/base.json) AMI. Do this when:
      - You need to add new apt packages.

      - You need to update docker (see above).

      - You need to run some expensive one-off installation.

      - You need to update ssl/gpg keys

      Note that you need to _manually_ update the `sourceAMI` field in
      the `app.json` file after you create a new base AMI.

      Also note to generate this base AMI, access to the ssl and gpg keys that
      the work needs is necessary.

      *Example*:

      ```sh
      ./deploy/bin/build base
      ```

  2. Building the [app](/deploy/packer/app.json) AMI. Do this when:
      - You want to deploy new code/features.

      - You need to update diamond/statsd/configs (not packages).

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

`babel-node --harmony bin/upload-schema.js`

### Post-Deployment Verification

After creating a new AMI, operation can be verified by updating a test worker type in the AWS Provisioner and submitting tasks to it.  Ensure that the tasks were claimed and completed with the successful outcome.  Also add in features/capabilities to the tasks based on code changes made in this release.

Further verification should be done if underlying packages, such as docker, change.  Stress tests should be used (submit a graph with a 1000 tasks) to ensure that all tasks have the expected outcome and complete in an expected amount of time.

Errors from docker-worker are reported into papertrail and should be monitored during roll out of new AMIs.  Searching for the AMI Id along with ("task resolved" OR "claim task") should give a rough idea if work is being done using these new AMIs.
