# Docker Worker

Docker task host for linux.

# Architecture

A "host" is a trusted context which tasks cannot access... The "host"
polls the queue for tasks using assigned `provisionerId` and `workerType`.
By default the `provisionerId` is `"aws-provisioner"` and uses the EC2 metadata
service to fetch AMI image-id as `workerType`, instance-id as `workerId` and
availability-zone as `workerGroup`. if you're launching test worker, make sure
to use a unique `provisionerId` to avoid annoying the provisioner.

The docker-worker consumes taskcluster tasks, with a payload on the following
format:
```js
{
  image:    'ubuntu',     // docker image identifier
  command:  [             // Command followed by arguments to execute
    '/bin/bash', '-c',
    'echo "Hello World"'
  ]
  features: {             // Set of optional features
    bufferLog:    false,  // Debug log everything to result.json blob
    azureLivelog: true    // Live log everything to azure, see logs.json
  },
  artifacts: {
    // Name:              Source:
    'passwd.txt':         '/etc/passwd'
  }
}
```

Each task is evaluated in an isolated docker container.
Docker has a bunch of awesome utilities for making this work well...
Since the images are COW running any number of task hosts is plausible
and we can manage their overall usage.

We manipulate the docker hosts through the use of the [docker remote
api]([http://docs.docker.io/en/latest/api/docker_remote_api_v1.8/)

## Usage

```
# from the root of this repo)
./docker_worker/bin/worker start --provisioner-id <identifier>
```

## Development

You need [vagrant](http://www.vagrantup.com/) so start with the usual
`vagrant up` the vagrant image is very minimal and once its downloading
creating/destroying the machines should be fast.

(All the below assume your in the vagrant vm)

### Directory Structure

  - [/bin - deployment and testing scripts](/bin)
  - [/docker-worker - node module/server code for the worker](/docker_worker)
  - [/packer - vm packaging scripts](/packer)
  - [/taskenv_fail - docker image for testing failure](/taskenv_fail)
  - [/taskenv_pass - docker image for testing success](/taskenv_pass)

### Running tests

Individual tests can be run from the `docker_worker/` folder as you
would for any nodejs project using mocha but to run the entire test
suite (and verify the whole project works) running the tests through
docker is recommended.

```sh
# from the top level

make test
```

This will build the docker image for the tasks and run the entire suite.

### Deploying the worker

This repo contains a deployment script `bin/deploy` (run `./bin/deploy
--help` for all the options) which is a wrapper
for the awesome [packer](www.packer.io) the worker is then packed up
(currently only for AWS AMI) and managed via upstart... The default
image does not have the required credentials for all worker operations.
See [packer/app/etc/default-worker](packer/app/etc/default-worker) for
the defaults...

Overriding the defaults is easy, just copy the example configuration file
[docker_worker_opts_example.sh](/docker_worker_opts_example.sh),
fill out the missing credentials and save it as `docker-worker-opts.sh`.

```sh
# Additional packer flags can be added after "packer" sub command
# local config is a relative path
./bin/deploy packer -var "docker_worker_opts=docker-worker-opts.sh"
```

**Note** you can set command line options for docker-worker with
`DOCKER_WORKER_OPTS`, if you're deploying outside AWS EC2, or don't want the
aws-provisioner to launch instances for you, then you should provide
`--provisioner-id my-provisioner`.

