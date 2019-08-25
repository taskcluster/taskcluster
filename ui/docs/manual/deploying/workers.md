---
title: Workers
order: 20
---

# Workers

The worker-manager service uses "providers" to handle workers in various clouds (or, in no cloud at all).
Each is identified by a `providerId`, referenced from the worker pool definitions defined in the Taskcluster API.

## Cautions

Be careful to never remove a provider which still has worker pools.
Note that worker pools persist for some time after they are "deleted", until all workers are stopped and a periodic task finally reaps the worker pool.

Be careful, too, not to change a provider configuration in such a way that the worker manager's internal state will be invalidated.
For example, do not change the cloud accout for a provider.
Instead, create a new provider for the new account and migrate worker pools to that new provider.

## Provider Configuration

Providers are configured in the services `PROVIDERS` confgi, which is structured as a JSON object mapping `providerId` to the configuration for that provider.
Each configuration object has at least a `providerType` property, defining the type of cloud in which workers should be provisioned.

### Static

A provider with `providerType = "static"` manages workers that are not dynamically created in response to demand.
It is typically used for workers in datacenters, but can also be used for cloud instances that are created through some non-Taskcluster mechanism.

A static provider is be configured in `providers` with the following structure.
Since there is usually no reason to have multiple static providers, the provider is typically named "static".

```json
{
  "static": {
    "providerType": "static"
  },
  ...
}
```


### Google

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

#### GCP Project

The `project` configuration names the project in which instances will be created.
It is the project *ID* and not the human-readable project name.

The project will need the following APIs enabled:

* Compute Engine API
* Identity and Access Management (IAM) API
* Cloud Resource Manager API

#### Service Account Credentials

The provider requires a service account in the designated project, with the following roles:

* `roles/iam.serviceAccountAdmin` ("Service Account Admin")
* `roles/iam.roleAdmin` ("Role Administrator")
* `roles/resourcemanager.projectIamAdmin` ("Project IAM Admin")
* `roles/compute.admin` ("Compute Admin")

These roles confer almost total control over the GCP project.
See the note above about using a dedicated project.

The GCP credentials for this service account are provided either in string form (`creds`) or in a file (`credsFile`).
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
and will need to be included as a single string in the `creds` property.

#### Instance Permissions

The `instancePermissions` configuration defines the permissions granted to the GCP role assumed by the workers.
Each string in this array is a GCP IAM permission string.
Typically, this will include permissions to write to StackDriver, such as `logging.logEntries.create`.


### AWS

Coming Soon!
