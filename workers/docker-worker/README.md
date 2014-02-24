# Docker Worker

Docker task host for linux.

# Architecture

A "host" is a trusted context which tasks cannot access... The "host"
listens over AMQP and starts tasks. Then as tasks progress the details
are relayed over AMQP.

A "task" in the context of this taskhost is a single json blob which
contains some details about a executable to run. The executables are
each run as their own docker container (the task may specify what docker
container to use).

Docker has a bunch of awesome utilities for making this work well...
Since the images are COW running any number of task hosts is plausible
and we can manage their overall usage.

We manipulate the docker hosts through the use of the [docker remote
api]([http://docs.docker.io/en/latest/api/docker_remote_api_v1.8/)

## Usage

```
# from the root of this repo)
./docker_worker/bin/worker start $RABBIT_QUEUE_NAME

# the command will fail if the queue is not already created;
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

Overriding the defaults is easy:

```
# localconfig
DOCKER_WORKER_OPTS="--worker-type testing-worker-type"
```

```sh
# Additional packer flags can be added after "packer" sub command
# local config is a relative path
./bin/deploy packer -var "docker_worker_opts=localconfig"
```

Example configuration here: [docker_worker_opts_example.sh](/docker_worker_opts_example.sh)
