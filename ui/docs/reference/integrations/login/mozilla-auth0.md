---
title: Mozilla-Auth0 logins
---

# Mozilla-Auth0

The `mozilla-auth0` handler translates a Mozillian's login into Taskcluster
credentials.  That login can be for an LDAP account (employees, committers) or
a github account or just an email verification.

## login-identity:..

The credentials assume the role `login-identity:<userid>` where `<userid>` is
the Auth0 userid.  It is generally `|`-delimited and guaranteeed to always
refer to the same person. As a special case, for Github logins, the user's
current Github username is appended to the userid.  Users can change their
Github usernames, and doing so will result in a new userid (but with the same
numeric portion).  This is done to make such login identities human-legible.

## mozillians-group:..

All Mozillians *access* groups of which a user is a member are reflected as
`assume:mozillians-group:<name>`.

Note that Mozillians differentiates access groups from other types of groups.
It is a setting in the group-administration UI.

## mozilla-group:..

Similarly, all LDAP groups of which a user is a member are reflected as
`assume:mozilla-group:<name>`.
