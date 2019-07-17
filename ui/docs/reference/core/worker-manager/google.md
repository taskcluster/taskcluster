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
Typically, this will include permissions to write to StackDriver, such as `logging.logEntries.create`.

The GCP credentials are provided either in string form (`creds`) or in a file (`credsFile`).
In either case, the data is the large JSON object containing a service account's keys. The object looks something like this:

```
{
  "type": "service_account",
  "project_id": "my-project-id-1234",
  "private_key_id": "abc123",
  "private_key": "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----\n",
  "client_email": "thisthing@something.iam.gserviceaccount.com",
  "client_id": "1234",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/thisthing%40something.iam.gserviceaccount.com"
}

```

The service account for which you provide these GCP credentials must carry the roles

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

The worker's `workerId` is identical to its instance ID, which can be retrieved from the GCP metadata service at `instance/id`.

The `workerIdentityProof` contains an [instance identity token](https://cloud.google.com/compute/docs/instances/verifying-instance-identity) in its `token` property:

```json
{"token": "<token>"}
```

The token should have audience equal to the deployment's `rootUrl` and `format=full`.
