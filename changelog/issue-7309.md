audience: users
level: patch
reference: issue 7309
---
D2G: No longer pass `--init` to the `docker run ...` command. This was breaking docker image build tasks that Taskgraph creates. To kill the running docker container, we now pass `-s KILL` to the `timeout` command.
