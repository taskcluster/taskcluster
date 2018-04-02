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

## Documentation and Metadata

Services annotated with `docs: generated` in the build spec are expected to produce a documentation directory as defined by [taskcluster-lib-docs](https://github.com/taskcluster/taskcluster-lib-docs) when the `write-docs` component is run:

```
DOCS_OUTPUT_DIR=/output/docs docker run -v $somepath:/output write-docs
```

# Tools

The tools site is not a microservice, so its build process is a bit different and customized to the specific repository.

Before building, the documentation for all repositories is included in the tier-specific subdirectory of `src/docs`.
Once that is complete, `yarn` and `yarn build` are run in a `node` image.
The resulting build is then installed into an `nginx`-derived image configured to serve the content.
