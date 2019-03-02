# Authentication

## Design Principles

This service mediates users' communication with Taskcluster APIs.
It's critical that the service not allow any escalation of privileges.

It must ensure that every API request is performed with credentials correspnding to the user making the GraphQL request.
In many cases, that user is anonymous, in which case the API request must be made without providing any Taskclutser credentials.

The service does not store user credentials in any kind of persistent storage.

Note that Pulse messages operate on a different model, since Pulse messages are all publicly readable.
The service uses its own credentials to establish queues and listen for messages, without requiring any authentication from the user.

## GraphQL Requests

GraphQL requests come with the user's Taskcluster credentials contained in a header.
The service does not store those credentials for any longer than necessary to process the request.

The header is `Authorization` and has the form `Bearer <credentials>` where `credentials` is a base64 encoded JSON string containing Taskcluster credentials (`clientId`, `accessToken`, and maybe `certificate`):

```json
{
  "clientId": "github/1234|octocat",
  "accessToken": "bEHJmAZ2SN-zUVqSvgFpZgM6wpRM8GRGKsK3vTr-Kr9A",
  "certificate": "..."
}
```

These credentials are used, unchanged, to make any necessary Taskcluster API calls.
Note that, as always, the certificate value should not be interpreted in any way.

## Login Strategies

The service supports "pluggable" login strategies.
These provide a method for users to acquire Taskcluster credentials.

Each strategy is implemented partly in this service, and partly in the paired `taskcluster-web` service.
The details of the which service does what depend on the strategy and the flow required by the authorization system.
Ultimately, `taskcluster-web` ends up with a set of Taskcluster credentials which it provides to the backend using the `Authorization` header as described above.
