This is under construction, so you better wear your helmit! :-)

It's a first pass at reusing taskcluster's json-e templates outside of terraform. The goal is to make them usable with cloudops's helm-centric secrets and deployment library.

The structure is

* templates/ - The json-e templates
* services/ - The service-specific context for evaluating the json-e templates
* bin/ - Tools to generate helm from json-e

A file in services/ is YAML and has three or four sections:

1. Project name -  used for identification
1. Secrets - a map of keys and vlues for the service secrets
1. Deployments (optional) - a list of maps with keys and values used for configuring the deployment
1. Cronjobs (optional) - a list of maps with keys and values used for configuring the cronjob

A value in the YAML can be either a literal string or it can be a palceholder for a value helm will substitute. For the latter, just start the name with `.Values.` followed by the name you will set in your helm values.

Before using this, you need a python 3 installation with a couple packages installed via ` pip install -r requirements.txt`

To render helm for all services, run `./bin/helmit.py`. To limit it to a specific service, use the `--service` flag followed by the service name.

