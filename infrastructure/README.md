# Infrastructure

Tools and packages that are used to run a deployment of Taskcluster.

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
