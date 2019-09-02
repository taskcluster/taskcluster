---
title: Login Strategies
---

The taskcluster-ui and taskcluster-web-server services work together to support configurable login strategies for the Taskcluster UI.
These are configured with the `ui_login_strategies` and `ui_login_strategy_names` Terraform variables.

The former is a JSON string containing configuration for the desired strategies.
This is passed as `UI_LOGIN_STRATEGIES` to the [taskcluster-web-server service](../services/web-server).

For example:

```json
{
    "github": {
        "clientId": "..",
        "clientSecret": ".."
    }
}
```

The latter, `ui_login_strategy_names,` should be equal to the set of keys in `ui_login_strategies`, but *must not contain secrets* as it is sent to the browser.
It is passed as `UI_LOGIN_STRATEGY_NAMES` to the [Taskcluster UI](../ui).

Note that, as JSON, quoting on both of these configuration variables can be difficult.
JSON *requires* the use of the double-quote character (`"`), but shells, YAML parser, etc. tend to "eat" this character.
*Caveat Scriptor*.

## GitHub

In order to enable the GitHub login strategy, specify the GitHub client ID and secret for an OAuth application created for use against this service and its web UI.
Create it under "Settings" (for yourself or for an org) -> "Developer Settings" -> "OAuth Apps" -> "New OAuth App".

The callback URL should be `<rootUrl>/login/github/callback`, or `http://localhost:3050/login/github/callback` for local development.

Configure it as:

```sh
UI_LOGIN_STRATEGIES='{"github": {"clientId": "..", "clientSecret": ".."}}'
```

### Mozilla Auth0

This strategy is specifically tuned to the integration Mozilla has built with Auth0.
This integration includes many pieces, such as CIS and the People API, which are probably not available outside of Mozilla.
Deployments outside of Mozilla should not enable this strategy.

To get started, request a new Auth0 application via Hub ("New Single Sign On Application").
Use OpenID Connect.
The Callback URL should be `<rootUrl>/login/mozilla-auth0/callback` or `http://localhost:3050/login/mozilla-auth0/callback` for local development.
The other options are up to you.

In response, you will get a domain, client ID, and client secret.
Configure these as follows:

```sh
UI_LOGIN_STRATEGIES='{
    "mozilla-auth0": {
        "domain": "<auth0 subdomain>",
        "clientId": "<clientId from registration of client>",
        "clientSecret": "<clientSecret from registration of client>"
    }
}'
```
