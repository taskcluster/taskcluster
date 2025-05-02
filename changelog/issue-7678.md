audience: worker-deployers
level: minor
reference: issue 7678
---
D2G: pre and post-task-processing (image pulling/loading/saving, copying artifacts out of container, creating chain of trust additional data file, removing container/volumes, handling max runtime) now happens within the D2G Task Feature in Generic Worker, as opposed to within the resulting translated task payload. This slims the translated task payload to only the `docker run ...` command.
