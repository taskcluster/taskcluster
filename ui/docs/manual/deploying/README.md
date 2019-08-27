---
title: Deploying Taskcluster
order: 60
---

# Deploying Taskcluster

A Taskcluster deployment is identified by a `rootUrl`, which defines the domain name on which the deployment can be accessed.

Taskcluster is deployed as a collection of interacting microservices within a Kubernetes cluster.
The cluster has an [Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/) that routes various paths under the `rootUrl` to the appropriate services.
The `/` path is routed to the taskcluster-ui service, which serves a browser-based user interface.

The services all run from a single Docker image, referred to as the "monoimage", that is built by running `yarn release` (or `yarn build` to build a one-off) in this repository.
A Taskcluster "release" is a semantically versioned docker image along with the repository at that tag (for deployment configuration) and similarly-tagged client libraries in various languages.

## Work in Progress

This section is incomplete, as we iterate to find a suitable approach to deployment.
The following pages document some of the more complex aspects of Taskcluster deployment.

## Clouds

Taskcluster is a multi-cloud system, and as such expects credentials for several cloud providers.

The services' Kubernetes deployment can run anywhere; at Mozilla it is deployed in GKE, Google Cloud's Kubernetes offering.
Task artifacts are stored in Amazon S3, so AWS credentials will be required.
Services' data is stored in Azure Table Storage, so Azure credentials will be required.

Taskcluster can also dynamically provision workers in a variety of clouds; see the [workers](./workers) page for for details.

## GitHub

Taskcluster can integrate with GitHub in two complementary ways:
* The taskcluster-github service provides a GitHub App which can create tasks in response to events in GitHub repositories.  See [Github Integration](./github) for more details.
* The web-server service supports user logins via GitHub.  See [Login Strategies](./login-strategies) for more details.
