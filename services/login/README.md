TaskCluster User Login Service
==============================

This services provides UI that users can authenticate against and then get
temporary credentials issued.

Supported authentication systems:
 * Mozillians using persona (will lookup group memberships, username and ensure
   that users are vouched)
 * LDAP using SSO w. SAML API (expects assertions with `taskcluster-email`
   and `taskcluster-groups` properties)

For both LDAP and Mozillians there is a list of _allowed groups_, for each
allowed LDAP group a user has the scope `assume:mozilla-group:<group>` will be
issued. Similarly, the scope `assume:mozillians-group:<group>` will be granted
with allowed Mozillians groups.

We restrict LDAP and Mozillians groups under consideration to a fixed set of
groups, configured with environment variables so new ones are easy to add.
We do this as temporary credentials can't cover an infinite list of scopes,
additionally this allows us to ensure that groups are indeed intended to be used
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