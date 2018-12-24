---
title: Terraform JSON
order: 21
---

The output of a build operation is a JSON file intended for input into
Terraform.  As such, it complies with Terraform's odd data structure
requirements.  It contains an object with a single property, `locals`, the
value of which is an object with string values providing local variables
expected by the
[Taskcluster-Terraform](https://github.com/taskcluster/taskcluster-terraform)
deployment system.

In particular, it has properties:

 * `taskcluster_image_<name>` for each repository of kind "service", giving the Docker image name to use for that service.
