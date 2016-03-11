# TaskCluster Secrets Service [![Build Status](https://travis-ci.org/taskcluster/taskcluster-secrets.png?branch=master)](https://travis-ci.org/taskcluster/taskcluster-secrets)

The secrets service allows task cluster clients with appropriate scopes to write secrets securely, and in such a way that each secret is tied to a scope. Further, scopes are used to limit the operations a particular client may perform on any secret they have been granted access to.

### Expire Secrets

The service expects the following to run periodically (daily?) to flush expired secrets:

    NODE_ENV=production babel-node bin/main.js expire

###Run Tests
From the project's base run ``npm test``

# Post-Deployment Verification

After deploying a new version of this service, open up the tools site and sign in.
Using the "secrets" tool, make sure you can read some secret that you have access to (that is, one listed in the UI).
