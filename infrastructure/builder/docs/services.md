---
title: Expectations of Services
order: 40
---

The installer has some simple expectations of Taskcluster services.

# General Services

Most services are implemented as 12-factor applications that could easily be installed in Heroku.
Each is built using Heroku's buildpack compilation process, resulting in a Docker image.

The Heroku `Procfile` in the root of the repository determines how to run various components of the service.
The docker image is configured to run these components with `docker run <image> <component>`.
As with Heroku, the `web` proc is privileged, and is expected to run a web server on port 80, so `docker run <image> web` will run the web service.

## Testing Service Images

To open a shell in a service's docker image, use a command like the following:

```shell
docker run -ti --rm <image> bash
```

where `<image>` is the string output from the build process.
You can also run a specific process from the Procfile with

```shell
docker run --rm -e PORT=80 -e .. <image> <process>
```

get the (longish) list of `-e` environment variables that must be supplied from the `taskcluster-terraform` repository.

## Documentation and Metadata

Services annotated with `docs: generated` in the build spec are expected to produce a documentation directory as defined by [taskcluster-lib-docs](https://github.com/taskcluster/taskcluster-lib-docs) when the `write-docs` component is run:

```
DOCS_OUTPUT_DIR=/output/docs docker run -v $somepath:/output write-docs
```

# Other Build Types

Several repositories have a different `service.buildtype` specified.
These are generally customized to the specific service and provide inputs based on other components.

## Docs

The docs build type depends on all other services and documentation sources, and provides all of that documentation to the docs `build-static` command, which produces static output that is then bundled into an nginx-based docker image.

## Tools

The tools service incorporates the rootUrl in its build process, so it is built at container startup time.
Thus the tools docker image contains only the repository source and a populated `node_modules` directory.

## References

Like docs, references depends on the output of many other services.
It bundles all of the reference documents and schemas together and arranges them to be served in an nginx-based docker image.
That image has a short Javascript script that runs at container startup and rewrites the schema files to contain a rootUrl-specific `$id` property.
