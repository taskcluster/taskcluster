audience: worker-deployers
level: patch
reference: issue 3169
---
If `workerTypeMetadata` is given in a generic-worker worker pool definition, its contents will now be merged with the metadata from the provider and passed to generic-worker.
