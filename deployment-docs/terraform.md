# Terraform

Taskcluster is deployed using Terraform.
The Terraform configuration is in `infrastructure/terraform` and consists of a Terraform module that should be included into your own Terraform configuration, providing the necessary configuration.
See the `variables.tf` file for a list of required values.

The Terraform module contains a [reference](../infrastructure/terraform/taskcluster.tf.json) to the Docker image that will be deployed.
This is updated periodically in the repository; a more formal approach is in the design stages.
