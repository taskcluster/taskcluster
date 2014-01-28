Docker Worker
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

The docker worker not only used docker to run tasks but it also is
deployed via docker. 

## Development

You need [vagrant](http://www.vagrantup.com/) so start with the usual
`vagrant up` the vagrant image is very minimal and once its downloading
creating/destroying the machines should be fast.

(All the below assume your in the vagrant vm)

### Running tests

Individual tests can be run from the `docker_worker/` folder as you
would for any nodejs project using mocha but to run the entire test
suite (and verify the whole project works) running the tests through
docker is recommended.

```sh
# from the top level

make test
```

This will build the docker image for the worker and run the entire suite
of tests inside of the docker image.
