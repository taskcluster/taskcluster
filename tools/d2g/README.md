# d2g

d2g is a go library for converting legacy Docker Worker tasks into native
Generic Worker tasks.

This library is used internally by Generic Worker, in order to run tasks that
were originally intended for Docker Worker. On detecting that a claimed task
has a Docker Worker payload, Generic Worker will first convert it to its
own native format before validating and executing the task.

For users wishing to convert Docker Worker tasks to Generic Worker tasks at
source, please see the [`taskcluster
d2g`](https://github.com/taskcluster/taskcluster/tree/main/clients/client-shell#translating-docker-worker-task-definitionpayload-to-generic-worker-task-definitionpayload)
cli subcommand.
