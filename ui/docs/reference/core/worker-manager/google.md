order: 10
---
import SchemaTable from 'taskcluster-ui/components/SchemaTable'

# Google Provider Type

Google-based providers create workers dynamically in GCE, using a single GCP project.
Best practice is to use a dedicated project for each provider that is not shared with other uses.
This isolates the workers from other GCP activities, protecting both from misuse or abuse.

## Provider Configuration

A google-based provider is be configured in `providers` with the following structure:

```json
{
  "myProvider": {
    "providerType": "google",
    "project": "<gcp project identifier>",
    "instancePermissions": [
      "<instance permission>",
      "<instance permission>"
    ],
    "creds": "<google credentials>",
    "credsFile": "<filename containing google credentials>"
  },
  ...
}
```

The `project` configuration names the project in which instances will be created.
It is the project *ID* and not the human-readable project name.

The `instancePermissions` configuration defines the permissions granted to the GCP role assumed by the workers.
Each string in this array is a GCP IAM permission string.
Typically, this will include permissions to write to StackDriver.

The GCP credentials are provided either in string form (`creds`) or in a file (`credsFile`).
In either case, the data is the large JSON object containing a service account's keys.

These credentials must carry the roles

* `roles/iam.serviceAccountAdmin`
* `roles/iam.roleAdmin`
* `roles/resourcemanager.projectIamAdmin`
* `roles/compute.admin`

These roles confer almost total control over the GCP project.
See the note above about using a dedicated project.

## Worker-Pool Configuration

Worker-pool configuration for a worker-pool using this provider type must match the following schema.

<SchemaTable schema="/schemas/worker-manager/v1/config-google.json" />

## Worker Interaction

The provider starts workers with an instance attribute named `taskcluster` containing a JSON object with the following properties:

* `workerPoolId` -- worker pool for this worker
* `providerId` -- provider ID that started the worker
* `workerGroup` -- the worker's workerGroup (currently equal to the providerId, but do not depend on this)
* `rootUrl` -- root URL for the Taskcluster deployment
* `userData` -- userData from the worker pool configuration
