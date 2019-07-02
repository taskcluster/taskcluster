# Clouds

Taskcluster is a multi-cloud system, and as such expects credentials for several cloud providers.
The services' Kubernetes deployment can run anywhere; at Mozilla it is deployed in GKE, Google Cloud's Kubernetes offering.
Task artifacts are stored in Amazon S3, so AWS credentials will be required.
Services' data is stored in Azure Table Storage, so Azure credentials will be required.

Taskcluster can dynamically provision workers in a variety of clouds.
You will need appropriate credentials for any clouds you intend to use for workers.

The Terraform module is designed to namespace all resources it uses with a `prefix`, allowing multiple deployments of Taskcluster to share the same cloud accounts so long as the prefixes are different.
We use this internally to deploy multiple development deployments.
