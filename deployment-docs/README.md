# Deployment Documentation

*NOTE*: This is a work in progress, as we develop processes for flexibly and reliably deploying Taskcluster.

## Overview

A Taskcluster deployment is identified by a `rootUrl`, which defines the domain name on which the deployment can be accessed.

Taskcluster is deployed as a collection of interacting microservices within a Kubernetes cluster.
The cluster has an [Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/) that routes various paths under the `rootUrl` to the appropriate services.
The `/` path is routed to the taskcluster-ui service, which serves a browser-based user interface.

The services all run from a single Docker image, referred to as the "monoimage", that is built by running `yarn build` in this repository.

## Terraform

Taskcluster is deployed using Terraform.
The Terraform configuration is in `infrastructure/terraform` and consists of a Terraform module that should be included into your own Terraform configuration, providing the necessary configuration.
See the `variables.tf` file for a list of required values.

The Terraform module contains a [reference](../infrastructure/terraform/taskcluster.tf.json) to the Docker image that will be deployed.
This is updated periodically in the repository; a more formal approach is in the design stages.

## Clouds

Taskcluster is a multi-cloud system, and as such expects credentials for several cloud providers.
The services' Kubernetes deployment can run anywhere; at Mozilla it is deployed in GKE, Google Cloud's Kubernetes offering.
Task artifacts are stored in Amazon S3, so AWS credentials will be required.
Services' data is stored in Azure Table Storage, so Azure credentials will be required.

Taskcluster can dynamically provision workers in a variety of clouds.
You will need appropriate credentials for any clouds you intend to use for workers.

The Terraform module is designed to namespace all resources it uses with a `prefix`, allowing multiple deployments of Taskcluster to share the same cloud accounts so long as the prefixes are different.
We use this internally to deploy multiple development deployments.

## Pulse

Taskcluster uses RabbitMQ to communicate between microservices.
The particular approach it takes to this communication is called "Pulse", taken from a larger project at Mozilla, but it can run against any RabbitMQ deployment, either local or hosted by a commercial provider.

Most services will require service-specific credentials for access to Pulse.

## Login Strategies

The taskcluster-ui and taskcluster-web-server services work together to support configurable login strategies for the browser UI.
These are configured with the `ui_login_strategies` and `ui_login_strategy_names` Terraform variables.

The former is a JSON string containing configuration for the desired strategies.
For example:

```json
{
    "github": {
        "clientId": "..",
        "clientSecret": ".."
    }
}
```

See the [taskcluster-web-server](../services/web-server#readme) documentation for details on the avaialble login strategies.

The `ui_login_strategy_names` variable should be equal to the set of keys in `ui_login_strategies`, but *must not contain secrets* as it is sent to the browser.

## GitHub app setup

This may be obsoleted when bstack lands manifest stuff. First spin up your Taskcluster instance in order to get the URLs required at app creation and an arbitrary secret. Then follow these steps to set the app up. 

### Why are there 2 apps? 

One of them is what Taskcluster uses to get notified of changes on github ("the Taskcluster GitHub app"), and update github statuses ("the Taskcluster login app"). The other pertains to GitHub login and is only needed on Taskcluster instances that use this feature.

If you use a GitHub app to sign in, the token it recieves can do anything as the user who just signed in. That's why Taskcluster keeps this feature as isolated from everything else as possible. 

### What should the apps be named? 

The apps can have the same name, but that's confusing. Call them `deploymentname-taskcluster` and `deploymentname-taskcluster-signin`. 

### How to create the Taskcluster Github app? 

Use the docs at https://developer.github.com/apps/building-github-apps/creating-a-github-app/. If you want it to be owned by an org, you probalby need to be an admin of that org. Set the fields as follows: 

Homepage URL should link to your Taskcluster instance's tools site. 

Setup URL should link to your taskcluster instance's quickstart guide. 

Webhook URL should link to your Taskcluster instance's GitHub service's reciever endpoint. 

Set the secret to an arbitrary value that you also configure in your Taskcluster instance's settings. 

### How to set up private keys? 

On the app's settings page, generate a private key, and add its PEM to your Taskcluster instance's configs. Then restart your Taskcluster instance's GitHub service. 

### What permissions does the Taskcluster Github app need?

As of June 2019, the permissions list is: 

* repo administration: read-only
* checks: read & write
* repo contents: read-only
* content references, deployments: No access
* issues: read & write
* repo metadata: read-only
* pages: no access
* pull requests: read & write
* repo webhooks, projects, security alerts, & single file: no access
* commit statuses: read & write
* organization members: read only
* blocking org users, org projects, team discussions, org administration, org hooks, org plan: No access

* User permissions: No access for any

* Subscribe to events: Pull request, Push, Release


