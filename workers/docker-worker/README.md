Docker Taskhost
========

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

# Development

Vagrant is used to provide a consistent development environment and more
importantly so we can run docker!

In the tests we run docker over TCP (so you can run tests from your host
if you like) but this is a _very_ bad idea generally speaking so don't
do this in production.


## Test TaskEnv

We generate the test task env from the test/Dockerfile in this
repo... There are two different tags.

  - :pass - taskrunner-who will return whatever its argv is in stdout
  - :fail - taskrunner-who will exit with 666

Primarily these are for testing that we pull docker images correctly.
The task env is tagged as `lightsofapollo/test-taskenv` or https://index.docker.io/u/lightsofapollo/test-taskenv/
