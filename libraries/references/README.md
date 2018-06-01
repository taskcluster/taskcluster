This repository is responsible for serving the `/references` and `/schemas`
paths in a Taskcluster repository.

# Operation

In operation, these paths are served by Nginx in a docker container, using the
`nginx-site.conf` in this repository. The Nginx configuration is very simple,
just serving files out of `/app/built/references` and `/app/built/schemas`.

The input to this repository comes in `/app/input` as directories named after
services, with the following structure:


```
├── myservice
│   ├── metadata.json
│   ├── references
│   │   ├── exchanges.json
│   │   └── api.json
│   └── schemas
│       └── v1
│           ├── data-description.json
│           └── more-data.json
├── anotherservice
¦   ├── metadata.json
```

This is a subset of the
[taskcluster-lib-docs](https://github.com/taskcluster/taskcluster-lib-docs)
documentation tarball format, and `metadata.json` is defined there.

The transformation from `/app/input` to `/app/built` is performed by `yarn
build`. It reads all of the references and schemas into memory, then writes
them back out at the appropriate filenames and with `$id` URIs adjusted to be
relative to `$TASKCLUSTER_ROOT_URL`.

# Docker

The included Dockerfile builds a working service image, based on the
`nginx-alpine` image with `node` added into the mix. On startup, Nginx will run
on port 80 after a very short delay for `yarn build` to run.

# Development

The usual `yarn` and `yarn test` will run tests for this service.

Note that this service uses node 8, because that is what is easily installed in
the `nginx:alpine` Docker image.
