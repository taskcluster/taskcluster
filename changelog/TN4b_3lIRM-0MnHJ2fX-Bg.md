audience: developers
level: minor
---

Docker compose changes and improvements:
* `generic-worker` runs with local `docker compose` and is able to execute tasks
* (breaking change) default ingress service was renamed to `taskcluster` and now binds to port `80` instead of `8080`
* manual entry of '127.0.0.1 taskcluster' to `/etc/hosts` is necessary in order to make HAWK authentication work properly across whole UI

New tutorial page is added `docs/tutorial/local-dev` describing how to launch Taskcluster locally and run a simple task.
