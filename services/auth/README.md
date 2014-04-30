TaskCluster - Authentication Server
-----------------------------------

The taskcluster authentication server manages permissions and credentials in the
taskcluster eco-system. Identifiers, credentials and authorized scopes will be
stored in azure table storage, and various components will be granted read-only
access in-order to authorize requests.

On the client side, an authorized client must have a `CLIENT_ID` and an
`ACCESS_TOKEN` to be used with hawk for making requests.

On the server side, `CLIENT_ID`s will resolve to `ACCESS_TOKEN` for HMAC
validation and a set of scopes, which will be used to determine what resources
the client is authorized to access.
