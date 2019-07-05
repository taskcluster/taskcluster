# Infrastructure

Tools and packages that are used to run a deployment of Taskcluster.

## Terraform

A simple module to set up some requirements for a Taskcluster deployment.

To use this module, you must have configured the following terraform providers
in your module:

- aws
- azurerm
- rabbitmq

### Requirements not managed here

- A kubernetes cluster
- Any objects in a kubernetes cluster (see K8s section below)
- Any secrets (e.g. AWS access tokens)
- A rabbitmq cluster with the RabbitMQ management plugin enabled
- An SES email address set up in AWS. This cannot be created automatically by Terraform.

### Usage

First set the `RABBITMQ_USERNAME` and `RABBITMQ_PASSWORD` environment variables.

Next, run `bin/create-rabbitmq-users.sh` to do just that. This will create the users and write their credentials to disk for you to load into k8s later.

Next include this module in your terraform.

```hcl
module "taskcluster" {
  source                    = "github.com/taskcluster/taskcluster-terraform"
  prefix                    = "tc"
  azure_region              = "${var.azure_region}"
  rabbitmq_hostname         = "${var.rabbitmq_hostname}"
  rabbitmq_vhost            = "${var.rabbitmq_vhost}"
}
```

Then, authenticate to AWS and Azure before applying. How to do this will vary depending on what methods you use to store their credentials (e.g. `aws-vault`). For RabbitMQ, be sure to have `RABBITMQ_USERNAME` and `RABBITMQ_PASSWORD` set.

Finally, run `create-aws-access-keys.sh` and `create-random-secrets.sh`. This will perform those operatiosn and write the output to disk for you to load into k8s later.

## Kubernetes

### Using

Before using this, you need a python 3 installation with a couple packages installed via ` pip install -r requirements.txt`

To generate a helm chart for all the services, run `./bin/helmit.py`. To limit it to a specific service, use the `--service` flag followed by the service name.

The chart is written to the `chart` directory. You will need to set values for all the variables in `values.yaml` in order to apply it.

The generated ingress currently assumes you are deploying to GCP.

### Explanation

The structure is

* templates/ - The json-e templates
* services/ - The service-specific context for evaluating the json-e templates
* ingress/ - charts for ingresses you can choose from
* bin/ - Tools to generate helm from json-e

A file in services/ is YAML and has three or four sections:

1. Project name -  used for identification
1. Secrets - a map of keys and vlues for the service secrets
1. Deployments (optional) - a list of maps with keys and values used for configuring the deployment
1. Cronjobs (optional) - a list of maps with keys and values used for configuring the cronjob

A value in the YAML can be either a literal string or it can be a placeholder for a value helm will substitute. The latter all start with `.Values.`.