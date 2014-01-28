# docker-services

Docker orchestration library (written in node) for testing
docker images. Images can depend on other images, etc...

### Examples

See [/examples](/examples) for the full list of fully functional (and
tested) examples.

Lets say you have a node application which has a worker and uses both
use amqp.

`docker_services.json`:

```json
{
  "app": {
    "links": ["worker:worker", "amqp:amqp"],
    "image": "my-repo/my-app"
  },

  "worker": {
    "links": ["amqp:amqp"],
    "image": "my-repo/worker"
  },

  "amqp": {
    "image": "some-lib/amqp"
  }
}

```

Then you could run a test on in the app like this:

```sh
docker-services exec app npm test
```

### Known issue

  - docker must be on the host (meaning you must be on linux). This will be fixed soon.

### Roadmap

  - Remove the need for docker to run on the host
  - Aggregate log output for exec (so we can see other services while running exec)
  - Formal support for `up` and `down` for deamonized services (you won't need to leave exec running)
  - Building of docker images

### Developing

You need [vagrant](http://www.vagrantup.com/).

### Running the tests

```sh
vagrant up
vagrant ssh
cd /vagrant
make test
```

### Publishing a new version

The 'associate' is a docker image that also needs to be published
for each version (right now this is tied to my docker account).
