This repository is responsible for serving the `/references` and `/schemas`
paths in a Taskcluster repository.

# Operation

The tool represented by `src/main.js` is a simple wrapper around
[taskcluster-lib-references](https://github.com/taskcluster/taskcluster-lib-references),
to convert from a built-services format to a uri-structured format with the
current rootUrl.  This tool runs at startup of the deployed docker container,
after which Nginx serves the uri-structured result as static content, using the
`nginx-site.conf` in this repository. The Nginx configuration is very simple,
just serving files out of `/app/built/references` and `/app/built/schemas`.

# Docker

The included Dockerfile builds a working service image, based on the
`nginx-alpine` image with `node` added into the mix. On startup, Nginx will run
on port 80 after a very short delay for `yarn build` to run.

# Development

The usual `yarn` and `yarn test` will run tests for this service.

Note that this service uses node 8, because that is what is easily installed in
the `nginx:alpine` Docker image.
