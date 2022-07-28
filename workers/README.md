# Workers

Workers operate outside of the Taskcluster services, claiming tasks from the queue and executing them.

Taskcluster currently provides two worker implementations.
Docker-worker runs tasks in Docker, and is written in JS.
Generic-worker runs on several platforms, with several engines, and is written in Go.

## Table of Contents

<!-- TOC BEGIN -->
* [Docker Worker](docker-worker#readme)
* [Generic Worker](generic-worker#readme)
<!-- TOC END -->

## Docker image with generic worker

In order to simplify generic-worker installation, it is possible to build and use docker image to run `generic-worker`:

```sh
cd workers
docker build -t generic-worker:latest .

docker run --rm -it -v /path/to/config.json:/etc/generic-worker/config.json generic-worker:latest
```

This builds generic-worker for a given architecture, installs needed binaries, generates ed25519 key.
On start shows sample config, if it wasn't mounted.

Minimal `config.json` looks like this:

```json
{
  "accessToken": "--access-token--",
  "clientId": "--client-id--",
  "ed25519SigningKeyLocation": "/etc/generic-worker/ed25519_key",
  "rootURL": "https://tc-root.url/",
  "workerId": "worker-id",
  "workerType": "worker-type",
  "livelogExecutable": "/usr/local/bin/livelog",
  "taskclusterProxyExecutable": "/usr/local/bin/taskcluster-proxy",
  "publicIP": "127.1.2.3"
}
```

Access Token and Client Id can be created in <https://tc-root.url/auth/clients/create>.

This image is also used in a local `docker compose` development environment.
