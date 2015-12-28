TaskCluster Secrets Service
===========================

The secrets service allows task cluster clients with appropriate scopes to write secrets securely, and in such a way that each secret is tied to a scope. Further, scopes are used to limit the operations a particular client may perform on any secret they have been granted access to.

### Expire Secrets

The service expects the following to run periodically (daily?) to flush expired secrets:

    babel-node bin/expire-secrets.js production

###Run Tests
From the project's base run ``npm test``
