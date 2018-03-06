# Taskcluster GraphQL Server

An intermediary server between a GraphQL client and the Taskcluster REST APIs.
Helps offload API genericism and client refreshing to the service instead of
putting that logic on the client consumer.

Supports the queries, mutations, and subscriptions of Taskcluster APIs used
by web applications.

To launch this service, place a `.env` file in the root of this
repo with the following environment variables:

```sh
# Network port to bind the service to:
PORT="3050"

# The issuer used when provided JWTs. Use the following by default:
JWT_ISSUER="https://auth.mozilla.auth0.com/"

# The service used to verify JWTs. Use the following by default:
JWKS_URI="https://auth.mozilla.auth0.com/.well-known/jwks.json"

# The Login service to get a Taskcluster API token from JWT (auth0) credentials.
# Use the following by default:
LOGIN_URL="https://login.taskcluster.net/v1/oidc-credentials/mozilla-auth0"

# Username for connecting to pulse for subscriptions:
PULSE_USERNAME="<insert username here>"

# Password for connecting to pulse for subscriptions:
PULSE_PASSWORD="<insert password here>"
```
