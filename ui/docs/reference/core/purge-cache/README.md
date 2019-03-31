# Purge-Cache Service

Many taskcluster workers implements some generic form cache folders.
These cache often have a `name` that identifies them, for example a task that builds code may have a cache folder called `master-object-directory` which stores object directory for the master branch.
Note, your organization maybe have different naming scheme.

This service provides a broker for requests to purge these caches across all workers of a specific `provisionerId`/`workerType`.
It provides a method to add a new request, and a method for workers to poll for relevant purge requests since the last time they checked.
