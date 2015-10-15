TaskCluster Hooks
================
A hooks service for triggering tasks from events.

Testing
-------

TaskCluster components use "real" APIs for much of their testing, and thus require credentials that cannot be checked into the repository.
To run all of the tests, you will need a test credentials file.
Get this from one of the TaskCluster developers, and put it in the root of the repository as `taskcluster-hooks.conf.json`.

Then run `npm test`.
