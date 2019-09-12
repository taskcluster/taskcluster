# Auth Service

The auth service manages permissions and credentials in a Taskcluster deployment.

## Development

No special configuration is required for development.

Run `yarn workspace taskcluster-hooks test` to run the tess.
Some of the tests will be skipped without additional credentials, but it is fine to make a pull request as long as no tests fail.

If you are modifying something requiring credentials, you may need to set up credentials.
To do so, copy `user-config-example.yml` to `user-config.yml` and fill in the necessary credentials based on the comments in that file.
Taskcluster team members can provide you with some testing-only credentials -- just ask, and provide a GPG key (use https://keybase.io if you don't have one).
You can get your own pulse credentials at https://pulseguardian.mozilla.org.

The taskcluster team has a series of [best practices](../../dev-docs/best-practices) which may help guide you in modifying the source code and making a pull request.

### GCP Credentials

To test the `gcpCredentials` endpoint, you will need a GCP project (we'll use "test-proj" here) with at least two service accounts.
These should be in a dedicated GCP project that does nothing else, to eliminate risk of damage or disclosure due to misconfiguration.
You'll also need to enable the IAM Service Account Credentials API under "APIs & Services" in the GCP Console.

The first is the service account that grants the credentials, called "credsgranter" here.
It must be created with the "Service Account Token Creator" role.
The second is the service account for which credentials will be generated, called "target" here.
It does not need any specific roles, but the IAM UI will not display it without a role, so pick a random role for it.

Get the "key" for the credsgranter.
Then set `gcpCredentials.alloewdProjects` in `user-config.yml` as follows (including the `invalid` account, which should not exist):

```yaml
gcpCredentials:
  allowedProjects:
    test-proj:
      credentials: {
        "type": "service_account",
        "project_id": "dustin-svc-account-experiments",
        "private_key_id": "99b2a524554e2450aa23cb9d73d076b19173da5a",
        "client_email": "credgranter@test-proj.iam.gserviceaccount.com",
        ...
      }
      allowedServiceAccounts: 
      - "target@test-proj.iam.gserviceaccount.com"
      - "invalid@mozilla.com"
```

alternately, you can set env var `GCP_CREDENTIALS_ALLOWED_PROJECTS` to a string
containing the JSON encoding, e.g., `{"test-proj": {"credentials": ..}}`.
