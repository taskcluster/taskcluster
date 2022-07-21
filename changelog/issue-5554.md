audience: developers
level: patch
reference: issue 5554
---
This patch splits the docker compose file into separate dev and prod configuration files. For prod-like deployments, where you want to use the latest `taskcluster/taskcluster` docker image, use the command `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`. For development deployments, where local source code mounts as volumes for testing/debugging purposes, use the command `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`.

This change also switches `docker-compose` (v1) references over to `docker compose` (v2). See [here](https://docs.docker.com/compose/#compose-v2-and-the-new-docker-compose-command) for more details.
