TaskCluster - Authentication Server
-----------------------------------

<img src="https://tools.taskcluster.net/lib/assets/taskcluster-120.png" />

[![Build Status](https://travis-ci.org/taskcluster/taskcluster-auth.svg?branch=master)](http://travis-ci.org/taskcluster/taskcluster-auth)
[![License](https://img.shields.io/badge/license-MPL%202.0-orange.svg)](https://github.com/taskcluster/taskcluster-auth/blob/master/LICENSE)

The taskcluster authentication server manages permissions and credentials
in the taskcluster eco-system. Identifiers, credentials and authorized
scopes will be stored in azure table storage, and various components will
be granted read-only access in-order to authorize requests.

On the client side, an authorized client must have a `CLIENT_ID` and an
`ACCESS_TOKEN` to be used with hawk for making requests.

On the server side, `CLIENT_ID`s will resolve to `ACCESS_TOKEN` for HMAC
validation and a set of scopes, which will be used to determine what resources
the client is authorized to access.

## Service Owner

Service Owner: jonasfj@mozilla.com

## Post-Deployment Verification

If you deploy a copy of this application that fails to start, all of
TaskCluster will come to a screeching halt immediately.  Don't do that.

This app auto-deploys from Github to the staging environment, which uses a
different Azure backend.

Happily, there's a nice, automated way of testing that staging environment
before promoting it to production.  First, if you haven't already, run `npm run
checkStagingSetup` and copy-paste the results into your `user-config.yml`.
Note that you will need Heroku app access to do this!  Once your config is set
up, just run `npm run checkStaging` to check the staging site for
functionality.
