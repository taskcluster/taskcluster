# Workers

Workers operate outside of the Taskcluster services, claiming tasks from the queue and executing them.

Taskcluster currently provides two worker implementations.
Docker-worker runs tasks in Docker, and is written in JS.
Generic-worker runs on several platforms, with several engines, and is written in Go.

## Table of Contents

<!-- TOC BEGIN -->
* [Docker Worker](docker-worker#readme)
* [Generic Worker](generic-worker#readme)
    * [Mock Services Design](generic-worker/mocktc#readme)
    * [generic-worker/server-logs](generic-worker/server-logs#readme)
<!-- TOC END -->
