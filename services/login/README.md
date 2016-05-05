TaskCluster User Login Service
==============================

This service provides a very minimal UI that users can authenticate against
and then get temporary credentials issued.

It is split into two components: authentication (who are you?) and
authorization (what can you do?).

Supported authentication systems:
 * SSO - SAML via Okta, Mozilla, Inc.'s single-signon provider.  This service
   supplies multi-factor auth and a host of other benefits.  This expects a
   `taskcluster-email` property in the SAML assertion, giving the user's
   LDAP email.  User identities are of the form `mozilla-ldap/<email>`.
 * Persona - A very basic verification that the user owns an email address.
   User identities are of the form `persona/<email`.

Supported authorization systems:
 * LDAP - Translates LDAP groups (including POSIX groups) to TaskCluster roles
 * Mozillians - Translates curated mozillians groups for vouched Mozillians into
   TaskCluster roles

For both LDAP and Mozillians there is a list of _allowed groups_.  An LDAP user
is given a role `mozilla-user:<email>`.  For each allowed LDAP group the user
is given the role `mozilla-group:<group>`.  Similarly, a Mozillians user will
get the role `mozillians-user:<username>` and `mozillians-group:<group>` for
each group.

Authorization systems look at the identity provided by the authentication
system, so for example the Mozillians authorization trusts identities from SSO,
and will issue appropriate groups for a user who authenticated via either SSO
or Persona.

We restrict LDAP and Mozillians groups under consideration to a fixed set of
groups, configured with environment variables so new ones are easy to add.
We do this as temporary credentials can't cover an infinite list of scopes.
Additionally this allows us to ensure that groups are indeed intended to be used
for issuing taskcluster scopes.

If there is a demand, we can look at making this more dynamic, so it's easier to
allow new groups. Maybe by issuing scopes for any group that has a role.

Access Grant for Tools
----------------------
If you send a web-browser to `/?target=<target>&description=<description>` then
once a user has authenticated, the user will be presented with a button to grant
access to the target `<target>` (while `<decription>` is displayed as markdown).

If user clicks the button to grant access to `<target>` the user will be
redirected to `<target>?clientId=...&accessToken=...&certificate=...`, such that
the `<target>` URL may obtain the temporary TaskCluster credentials. This is
meant to facilitate a decent login flow for various web-based tools, even CLI
based tools can use by opening a small web-server on localhost and sending the
user to a browser.
