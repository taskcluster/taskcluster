# Deployment Documentation

*NOTE*: This is a work in progress, as we develop processes for flexibly and reliably deploying Taskcluster.

## Overview

A Taskcluster deployment is identified by a `rootUrl`, which defines the domain name on which the deployment can be accessed.

Taskcluster is deployed as a collection of interacting microservices within a Kubernetes cluster.
The cluster has an [Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/) that routes various paths under the `rootUrl` to the appropriate services.
The `/` path is routed to the taskcluster-ui service, which serves a browser-based user interface.

The services all run from a single Docker image, referred to as the "monoimage", that is built by running `yarn build` in this repository.
A Taskcluster "release" is a semantically versioned docker image along with the repository at that tag (for deployment configuration) and similarly-tagged client libraries in various languages.

## Contents

* [Terraform](terraform.md)
* [Clouds](clouds.md)
* [GitHub Service](github.md)
* [Login Strategies](login-strategies.md)
