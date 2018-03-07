# Taskcluster GraphQL Server

An intermediary server between a GraphQL client and the Taskcluster REST APIs.
Helps offload API genericism and client refreshing to the service instead of
putting that logic on the client consumer.

Supports the queries, mutations, and subscriptions of Taskcluster APIs used
by web applications.

## Environment variables

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

## Launching locally

To start the service up locally, be sure to set the above environment variables.
Then install dependencies using `yarn`. Use the command `yarn start` to start the
service, which launches on the `PORT` set in `.env`.

You should see the following message in the console, for example, using port 3050:

```bash
Taskcluster GraphQL server running on port 3050.

Open the interactive GraphQL Playground, schema explorer and docs in your browser at:
    http://localhost:3050
```

To pass credentials to the service from the GraphQL Playground, click the "HTTP Headers"
section, and paste a JSON object with a key of "Authorization" with a value of
"Bearer <auth0 access token>", such as:

```json
{
  "Authorization": "Bearer eyJ0...yXlBw"
}
```

![authorization header](https://cldup.com/XDpBc-qY5Q.png)
