---
title: Mozilla-Auth0 Login Strategy
order: 20
---

# Mozilla-Auth0 Login Strategy

This login strategy is built around [Auth0](https://auth0.com/) and Mozilla's [Person API](https://github.com/mozilla-iam/cis/blob/2287fea51d5a2c4bea88076012178d50e5a385f2/docs/PersonAPI.md).
It is unlikely to be useful to other organizations.

## Identities

Identity strings are of the form `mozilla-auth0/<user_id>` where `<user_id>` is from the Person API.

There are two exceptions, where the Person API `user_id` does not have any meaning to a person:

 * For `oauth2|firefoxaccounts|<fxa_sub>` `user_id`s, the strategy appends the user's email for a full identity string of `mozilla-auth0/oauth2|firefoxaccounts|<fxa_sub>|<email>`.
 * For `github|<gh_userid>` `user_id`s, the strategy appends the user's username for a full identity string of `mozilla-auth0/github/<gh_userid>|<gh_username>`.

In both cases, identities are interpreted using the unique value (`fxa_sub` or `gh_userid`).
Thus if a user changes their GitHub username, the identity string will change accordingly.
Since the numeric GitHub `userid` cannot be changed, and no user can impersonate another user by changing username.

## User Scopes

This login strategy adds the following scopes to each user:

* `assume:mozilla-group:<group>` for each LDAP group
* `assume:mozillians-group:<group>` for each Mozillians group
* `assume:mozilla-hris:<group>` for each HRIS group

## Troubleshooting

Users can see their own group membership at https://sso.mozilla.com/info.

When LDAP groups are added to a user profile, the user must sign out of all Mozilla applications (https://sso.mozilla.com/logout) and sign in again before it will be reflected in scopes.
