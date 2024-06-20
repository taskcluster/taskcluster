audience: users
level: minor
reference: issue 7070
---
Generic Worker now sets the environment variable TASKCLUSTER_INSTANCE_TYPE in task commands to the instance type of the worker, if configured. This matches the (undocumented) behaviour of Docker Worker. D2G also passes this environment variable through to podman, to emulate Docker Worker's behaviour.
