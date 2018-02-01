TaskCluster Hooks
=================

A hooks service for triggering tasks from events.

API Documentation
-----------------
Please see https://docs.taskcluster.net/reference/core/hooks/api-docs.

Testing
-------
TaskCluster components use "real" APIs for much of their testing, and thus
require credentials that cannot be checked into the repository.  To run all of
the tests, you will need to set up a `user-config.yml` with credentials to
connect to an influx database, and a TaskCluster Queue and Auth endpoint. This
file should be placed in the root directory of your checkout. We recommend
copying the file `user-config-example.yml` as `user-config.yml` and then
editing the values.

Speak to the Taskcluster team on IRC via `irc.mozilla.org#taskcluster` channel
to obtain credentials if you need them.

Fetch dependencies with `yarn install`. Tests can then be executed with `yarn test`.

Service Owner
-------------

Service Owner: dustin@mozilla.com

Post-Deploy Verification
------------------------
This service will auto-deploy upon merging to master. Once it is deployed, you
can verify that it is functioning as expected by going to the [tools site](https://tools.taskcluster.net/hooks/)
and creating a new 'garbage' hook.
