TaskCluster Hooks
=================

A hooks service for triggering tasks from events.

Hooks supports automatically creating tasks:

 * At specific times
 * In respose to API calls
 * In response to webhooks

Development
-----------

From the project's base ``yarn install`` then ``yarn test``.
No special configuration is required.
Some of the tests will be skipped, but it is fine to make a pull request as long as no tests fail.

To run *all* tests, you will need appropriate Taskcluster credentials.
Using [taskcluster-cli](https://github.com/taskcluster/taskcluster-cli), run `eval $(taskcluster signin --scope assume:project:taskcluster:tests:taskcluster-hooks)`, then run `yarn test` again.

Service Owner
-------------

Service Owner: dustin@mozilla.com

Post-Deploy Verification
------------------------
This service will auto-deploy upon merging to master. Once it is deployed, you
can verify that it is functioning as expected by going to the [tools site](https://tools.taskcluster.net/hooks/)
and creating a new 'garbage' hook.
