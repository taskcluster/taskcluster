---
title: Docker Image Generation
followup:
  links:
    gecko-decision-task: How is the decision task defined?
    gecko-task-graph: How is the task-graph generated?
---

# Docker Image Generation

The docker images used to run Gecko tasks on Linux are defined in [taskcluster/docker](https://dxr.mozilla.org/mozilla-central/source/taskcluster/docker/).
Each directory represents a different image, and contains a `Dockerfile` describing the image itself.
These Dockerfiles are a bit more flexible than usual -- see [the Gecko documentation](https://firefox-source-docs.mozilla.org/taskcluster/taskcluster/docker-images.html) for details.

## Modifying Docker Images

When a Docker image description, or any file on which it depends, is modified, the [decision task](gecko-decision-task) detects this and schedules a docker-image build task, denoted with an "I" in treeherder.
All tasks using the resulting image are configured to depend on this docker-image task, and to use an artifact of that task as the docker image in which they will run.

The result is that anyone with try access can create new docker images and run tasks in those images with a single try push!
