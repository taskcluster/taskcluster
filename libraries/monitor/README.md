TaskCluster Metrics and Monitoring Library
==========================================

[![Build Status](https://travis-ci.org/taskcluster/taskcluster-lib-monitor.svg?branch=master)](https://travis-ci.org/taskcluster/taskcluster-lib-monitor)


Requirements
------------

This is tested on and should run on any of node `{0.12, 4, 5}`.

Usage
-----

Options and Defaults
--------------------

Testing
-------

To run the integration tests for this library, you'll need a taskcluster client with the `auth:sentry:tc-lib-monitor` and `auth:statsum:tc-lib-monitor` scopes available.
You can create this client with the [Taskcluster tools](https://tools.taskcluster.net/auth/clients). Once it's been created, you can copy
the `user-config-example.yml` file into `user-config.yml` and replace the proper fields with your new creds.

Once this is set up, you can `npm install` and `npm test`. You can set `DEBUG=taskcluster-lib-monitor,test` if you want to see what's going on.

The Sentry tests will create errors on [the tc-lib-monitor project](https://app.getsentry.com/taskcluster/tc-lib-monitor/), but notifications are
turned off for it.

License
-------

[Mozilla Public License Version 2.0](https://github.com/taskcluster/taskcluster-lib-monitor/blob/master/LICENSE)
