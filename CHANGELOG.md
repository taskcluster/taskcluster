# Change Log

<!-- `yarn release` will insert the existing changelog snippets here: -->
<!-- NEXT RELEASE HERE -->

## v30.0.1

### DEPLOYERS

▶ [patch] 
A typo causing index service not to start up in 30.0.0 is now fixed.

## v30.0.0

### GENERAL

▶ [patch] [bug 1638047](http://bugzil.la/1638047)
This release fixes a bug where the web UI opens the log viewer for any `text/plain` artifacts, which breaks for private artifacts. The web UI will now only use the log viewer for `text/plain` `*.log` files.

▶ [patch] [bug 1587145](http://bugzil.la/1587145)
taskcluster-client-web now only builds a single umd asset. This asset is
compatible with both cjs and esm.

### DEPLOYERS

▶ [minor] 
Database version 11 removes the `widgets` table that was used to test Postgres deployment.  It contains no useful data.
The hidden `notify.updateWidgets` API method, but this method was never meant to be used so this removal is not considered a breaking change.

▶ [patch] [bug 1639913](http://bugzil.la/1639913)
Worker-manager now logs when a worker is removed, and includes debug logging of provisioning and scanning.

### WORKER-DEPLOYERS

▶ [MAJOR] [bug 1636321](http://bugzil.la/1636321)
The generic-worker configuration parameters `livelogKey`, `livelogCertificate`, `livelogGETPort`, `livelogPUTPort`, and `livelogSecret` are no longer needed and are prohibited in the worker's configuration.

▶ [minor] [#2861](https://github.com/taskcluster/taskcluster/issues/2861)
The unused and unmaintained docker-worker features balrogVPNProxy, balrogStagingVPNProxy, and relengAPIProxy have been removed.

▶ [patch] [bug 1638370](http://bugzil.la/1638370)
Azure provider no longer has a race condition between `registerWorker` and `checkWorker`.

▶ [patch] 
Docker-worker will now fail early with a useful error message if the loopback audio or video devices are not available, but are configured.

▶ [patch] 
The docker-worker version is now logged in the `serviceContext.version` property of its structured logs.

### ADMINS

▶ [patch] [bug 1627769](http://bugzil.la/1627769)
Worker lifecycle defaults are now being properly applied.

### USERS

▶ [patch] [#1061](https://github.com/taskcluster/taskcluster/issues/1061)
In client-shell added flag --verbose/-v for getting log to stderr for all the commands.

▶ [patch] 
The docker-worker payload format is now available in Taskcluster's online documentation.

### DEVELOPERS

▶ [patch] [#2844](https://github.com/taskcluster/taskcluster/issues/2844)
All services are now invoked from the root of the monorepo directory.

### OTHER

▶ Additional changes not described here: [bug 1636164](http://bugzil.la/1636164), [bug 1636174](http://bugzil.la/1636174), [#2822](https://github.com/taskcluster/taskcluster/issues/2822), [#2838](https://github.com/taskcluster/taskcluster/issues/2838), [#2844](https://github.com/taskcluster/taskcluster/issues/2844).

## v29.6.0

### USERS

▶ [minor] [bug 1638002](http://bugzil.la/1638002)
The Azure, AWS, and Google worker provisioners now use an instance's region or location as `workerGroup`, instead of the worker pool's `providerId`.

### DEVELOPERS

▶ [minor] [#2811](https://github.com/taskcluster/taskcluster/issues/2811)
The Queue schema now allows for ssh:// source urls.

▶ [patch] 
An issue with building external urls with traceId'd clients has been fixed

### OTHER

▶ Additional change not described here: [bug 1637982](http://bugzil.la/1637982).

## v29.5.2



## v29.5.1

No changes

## v29.5.0

### GENERAL

▶ [patch] [bug 1633582](http://bugzil.la/1633582)
Fixes an issue in the worker-manager google provider where improperly configured disk tagging caused worker creation to fail.

### DEPLOYERS

▶ [minor] [bug 1619652](http://bugzil.la/1619652)
Taskcluster logs now include `traceId` and `requestId` fields on messages that have these in context.
A `requestId` is per http request and a `traceId` follows a request chain along as far as it goes so
for example a graphql request to web-server -> queue -> auth.authenticateHawk are all correlatable
as part of one trace.

As part of this change, by default in Kubernetes, requests between services are now routed directly using
Kubernetes dns service discovery. To disable this, you can set the top-level `useKubernetesDnsServiceDiscovery`
to `false` in your helm values.

▶ [patch] [bug 1637104](http://bugzil.la/1637104)
The livelog, taskcluster-proxy, and websocktunnel Docker images now use statically-linked binaries, meaning they will not fail on startup.

▶ [patch] [bug 1636189](http://bugzil.la/1636189)
The websocktunnel, livelog, and taskcluster-proxy images now have an `/app/version.json` as required by DockerFlow, and websocktunnel correctly services all three DockerFlow endpoints.  In additional, all `version.json` files including that in the main `taskcluster/taskcluster` image now have a correct build URL.

### WORKER-DEPLOYERS

▶ [patch] [#2788](https://github.com/taskcluster/taskcluster/issues/2788)
Docker-worker releases are now included in the assets on a Taskcluster release, with a well-documented format.

▶ [patch] [#2739](https://github.com/taskcluster/taskcluster/issues/2739)
Taskcluster-proxy assets, and a `taskcluster/askcluster-proxy` docker image, are now produced for every TC release.

▶ [patch] [bug 1636163](http://bugzil.la/1636163)
docker-worker docs now show on docs website

### USERS

▶ [patch] [bug 1635897](http://bugzil.la/1635897)
Taskcluster-GitHub now correctly determines the sha for releases from signed tags.

### OTHER

▶ Additional changes not described here: [bug 1561668](http://bugzil.la/1561668), [bug 1636165](http://bugzil.la/1636165), [#2783](https://github.com/taskcluster/taskcluster/issues/2783), [#2808](https://github.com/taskcluster/taskcluster/issues/2808).

## v29.4.1

### DEPLOYERS

▶ [patch] [bug 1636292](http://bugzil.la/1636292)
The bug in 29.4.0 which caused DB migration to fail given large WorkerPool table rows has been fixed with a patch to DB version 10.

### DEVELOPERS

▶ [patch] [bug 1635985](http://bugzil.la/1635985)
Docker Worker code now lives in this repository instead of taskcluster/docker-worker

## v29.4.0

### GENERAL

▶ [patch] [bug 1631829](http://bugzil.la/1631829)
Fixes an issue where azure-provider wasn't properly tagging resources.

### DEPLOYERS

▶ [minor] [bug 1630023](http://bugzil.la/1630023)
The worker manager's worker pools are now stored in a normal database table.  This table is small, and the DB migration should complete in seconds.

### DEVELOPERS

▶ [patch] 
Fix missing db TypeError in purge-cache.

▶ [patch] [bug 1633897](http://bugzil.la/1633897)
Remove outdated check for taskcluster.net when sending cookies. This was used
back when the UI was hosted in heroku.

### OTHER

▶ Additional change not described here: [bug 1633882](http://bugzil.la/1633882).

## v29.3.0

### GENERAL

▶ [minor] [bug 1630019](http://bugzil.la/1630019)
The purge_cache service now uses normalized db tables

▶ [patch] [bug 1633582](http://bugzil.la/1633582)
The worker-manager Google provider now labels worker disks with the same set of labels as VMs.

### USERS

▶ [patch] [#1536](https://github.com/taskcluster/taskcluster/issues/1536)
taskcluster-client-web no longer shows the 'hawk is undefined' regression error.

### DEVELOPERS

▶ [patch] [bug 1630023](http://bugzil.la/1630023)
DB version 8 introduces some utility functions that will be useful in migrating from (and downgrading to) tc-lib-entities-compatible tables.

▶ [patch] 
The morgan-debug logging for web services has been removed in favor of continued support of our api logging and iprepd logging in production

### OTHER

▶ Additional change not described here: [bug 1633882](http://bugzil.la/1633882).

## v29.2.0

### DEPLOYERS

▶ [patch] [bug 1606006](http://bugzil.la/1606006)
Services that use ephemeral queues now use a different queue name on each connection.  This avoids issues with RESOURCE-LOCKED from RabbitMQ.

### USERS

▶ [minor] [bug 1629807](http://bugzil.la/1629807)
Taskcluster login now includes a state token in the url search query during the login transaction to
conform with the recommendations in rfc-261.

▶ [patch] [bug 1631099](http://bugzil.la/1631099)
Taskcluster-GitHub now retries on 401 "Bad Credentials" errors from GitHub, as suggested by [GitHub developers](https://github.community/t5/GitHub-API-Development-and/Random-401-errors-after-using-freshly-generated-installation/m-p/23531/highlight/true#M1680).

▶ [patch] [bug 1633622](http://bugzil.la/1633622)
The taskcluster-client-web package now contains the `build` directory as expected.

## v29.1.3

### GENERAL

▶ [patch] 
A dependency that was mistakenly thought to be unused has been added back

▶ [patch] [bug 1627116](http://bugzil.la/1627116)
The worker manager AWS provider now tags EBS volumes created for EC2 instances with the same set of tags.

▶ [patch] [bug 1631829](http://bugzil.la/1631829)
The worker-manager Azure provider now tags all worker related Azure resources with the set of standard tags.

## v29.1.2

### DEVELOPERS

▶ [patch] [bug 1632325](http://bugzil.la/1632325)
release:publish tasks now save debug logs as artifacts

## v29.1.1

### WORKER-DEPLOYERS

▶ [patch] [bug 1631414](http://bugzil.la/1631414)
Worker-Runner is now properly documented in the Taskcluster documentation.

### OTHER

▶ Additional change not described here: [#2681](https://github.com/taskcluster/taskcluster/issues/2681).

## v29.1.0

### DEPLOYERS

▶ [minor] [bug 1551846](http://bugzil.la/1551846)
taskcluster-lib-app now includes endpoints `/__version__`, `/__heartbeat__`, and `/__lbheartbeat__` to be compatible with Dockerflow requirements.

▶ [patch] [bug 1631638](http://bugzil.la/1631638)
Overprovisioning alerts are now less spammy for small workerpool sizes

▶ [patch] [#2562](https://github.com/taskcluster/taskcluster/issues/2562)
The Websocktunnel repository has been moved into the monorepo, and websocktunnel is now released at the same time as the rest of the Taskcluster services, and with the same version number.  Aside from a (large) change in version number, nothing else about websocktunnel has changed since v2.0.0.

▶ [patch] [bug 1437952](http://bugzil.la/1437952)
The `yarn backup:..` commands have been removed, as backups should now be done at the Postgres database level.

▶ [patch] [bug 1628141](http://bugzil.la/1628141)
The default `cpu` and `memory` for each Kubernetes deployment are now set to better values based on experience at Mozilla.

▶ [patch] [#2395](https://github.com/taskcluster/taskcluster/issues/2395)
The deployment configuration now allows specification of some site-specific values.  While these are optional, adding these values will help users to better navigate the documentation.  See [the deployment docs](https://docs.taskcluster.net/docs/manual/deploying/ui#site-specific-documentation) for information on the available values.

### WORKER-DEPLOYERS

▶ [minor] [bug 1540804](http://bugzil.la/1540804)
Config property `publicIP` of generic-worker workers is now optional. When not
provided, rdp into Windows workers will no longer be possible, Chain of Trust
environment reports will no longer include the public IP, and livelogs via
stateless dns server will no longer work (however this will not affect livelog
served over websocktunnel).

▶ [minor] [#2647](https://github.com/taskcluster/taskcluster/issues/2647)
The Taskcluster livelog tool has been merged into the Taskcluster monorepo, and will now be released in concert with the rest of Taskcluster.  In the process of merging this tool, it was discovered that it handled HTTP Range requests incorrectly.  On the assumption that this functionality was never used, it has been removed.

▶ [patch] [bug 1591476](http://bugzil.la/1591476)
Worker-Runner now ignores any worker configuration in a cloud provider's user/meta/custom-data facility, instead using the configuration provided in response to the registerWorker REST API call.  This functionality requires that the service deployment run at least Taskcluster v26.0.0.

▶ [patch] 
Worker-runner now gives better error messages when it does not have information such as the RootURL in its tagged data.

▶ [patch] [bug 1516575](http://bugzil.la/1516575)
Worker-runner now protects itself and docker-worker from the Linux OOM killer

### ADMINS

▶ [patch] [bug 1629657](http://bugzil.la/1629657)
Workerpools are now a paginated list in the web ui.

### USERS

▶ [minor] [bug 1630113](http://bugzil.la/1630113)
Matrix integration now supports `m.text`, `m.emote`, and `m.notice` msgtypes. The default is
`m.notice` which was the only value supported previously.

▶ [patch] 
Make the error messages for custom checkrun text functionality clearer, so that the users don't have to read documentation.

### DEVELOPERS

▶ [patch] 
The Go implementation of the runner / worker protocol is now an internal library and not accessible from outside the Taskcluster repository.

▶ [patch] 
The `yarn dev:init` command since 28.2.3 would create `procs` entries for `write_docs` and `expireSentry` that would cause `yarn dev:apply` to fail.  That has been fixed, but such entries must be manually removed from `dev-config.yml` if they have already been added.

▶ [patch] [#2465](https://github.com/taskcluster/taskcluster/issues/2465)
The task for `yarn test:meta` was not failing properly in CI. This has been fixed, and failing meta checks have been resolved.

### OTHER

▶ Additional changes not described here: [bug 1548036](http://bugzil.la/1548036), [bug 1619286](http://bugzil.la/1619286), [bug 1629168](http://bugzil.la/1629168), [bug 1630023](http://bugzil.la/1630023), [bug 1630124](http://bugzil.la/1630124), [#2268](https://github.com/taskcluster/taskcluster/issues/2268), [#2631](https://github.com/taskcluster/taskcluster/issues/2631), [#2637](https://github.com/taskcluster/taskcluster/issues/2637), [#2534](https://github.com/taskcluster/taskcluster/issues/2534).

## v29.0.1

### DEPLOYERS

▶ [patch] 
The `db:upgrade` and `db:downgrade` commands now correctly roll back on error.

### DEVELOPERS

▶ [patch] [#2634](https://github.com/taskcluster/taskcluster/issues/2634)
taskcluster-lib-entities `.modify` no longer reaches out to the db when the data
is not modified.

## v29.0.0

### DEPLOYERS

▶ [MAJOR] [bug 1436478](http://bugzil.la/1436478)
The Taskcluster services now use a Postgres backend, instead of Azure Cables and Azure Containers.  All data in Azure must be migrated to Postgres during a downtime using `yarn importer:run`, and this is planned for all known deployments.  There should be no immediate user-visible impact from this change, aside from faster API responses, but it unlocks many planned improvements.

## v28.2.3

### USERS

▶ [patch] [#2615](https://github.com/taskcluster/taskcluster/issues/2615)
Fix error showing when creating new client/role in the UI.

▶ [patch] [bug 1525419](http://bugzil.la/1525419)
Generic worker tasks on Windows can now define environment variables that contain special characters `()%!^"<>&|`. Previously they were not escaped.

### DEVELOPERS

▶ [patch] 
Development environments now default to a lower per-pod CPU request, which should help reduce the compute cost of idle development environments.  Run `yarn dev:init` to update these defaults for your dev environment.

## v28.2.2

### WORKER-DEPLOYERS

▶ [patch] [bug 1624602](http://bugzil.la/1624602)
Worker-runner is now more careful to read all output from the worker when the worker exits.

### USERS

▶ [patch] [bug 1552323](http://bugzil.la/1552323)
Fixes the bug: https://sentry.prod.mozaws.net/operations/taskcluster-community/issues/7766271

## v28.2.1

### DEPLOYERS

▶ [patch] 
Fix error in notify service (monitor is required)

## v28.2.0

### GENERAL

▶ [patch] [bug 1618333](http://bugzil.la/1618333)
Changelog entries now are categorized by the audience that they are useful for

### WORKER-DEPLOYERS

▶ [patch] 
Now, if the worker process running in aws/gcp exits, it will be requested to worker-manager to terminate the instance.

### ADMINS

▶ [patch] [bug 1622943](http://bugzil.la/1622943)
The maximum value for a worker's `lifecycle.reregistrationTimeout` is now 30 days.  Values greater than this cannot be represented in the worker's temporary credentials anyway.

### USERS

▶ [minor] [bug 1552323](http://bugzil.la/1552323)
Adds ability to customize checks output in taskcluster-github Checks feature.
Apart from the bug mentioned, fixes the issue https://github.com/mozilla-mobile/fenix/issues/6760

▶ [patch] [#1389](https://github.com/taskcluster/taskcluster/issues/1389)
Taskcluster UI nows offers a breadcrumbs view to easily jump back and forth when
viewing indexes (/tasks/index/)

### DEVELOPERS

▶ [minor] [bug 1616998](http://bugzil.la/1616998)
taskcluster-worker-runner has been renamed to worker-runner and its docs have been added to the reference section of the docs portal.

▶ [patch] [#2522](https://github.com/taskcluster/taskcluster/issues/2522)
Services that use a database now log information about that database, including connection pool counts and stored-function invocations.

▶ [patch] [#2555](https://github.com/taskcluster/taskcluster/issues/2555)
The azure-queue emulation library now omits expired messages from its counts.  The visible effect is that pending counts for queues no longer include tasks past their deadline.

▶ [patch] [#2553](https://github.com/taskcluster/taskcluster/issues/2553)
The taskcluster-lib-azqueue library now returns "batches" of messages in the order they were inserted.

### OTHER

▶ Additional changes not described here: [#1615](https://github.com/taskcluster/taskcluster/issues/1615), [#2541](https://github.com/taskcluster/taskcluster/issues/2541).

## v28.1.0

▶ [minor] [bug 1436478](http://bugzil.la/1436478)
Add a new library taskcluster-lib-entities that exposes the same API as azure-entities but uses postgres rather than azure for its database. Note that all of the services are still using azure-entities. Services will eventually switch to using this new library. Date to be decided.

▶ [minor] [bug 1306494](http://bugzil.la/1306494)
Taskcluster UI now allow users to view the diff for scope changes (similar to the github write/preview functionality).

▶ [patch] [#2292](https://github.com/taskcluster/taskcluster/issues/2292)
Add a new library taskcluster-lib-azqueue that exposes the same API as the Azure Queue service but uses Postgres rather than Azure. Note that all of the services are still using Azure. Services will eventually switch to using this new library. Date to be decided.

▶ [patch] [bug 1616931](http://bugzil.la/1616931)
Generic-worker now transmits its logs via taskcluster-worker-runner, in preparation for supporting arbitrary log destinations.

▶ [patch] [bug 1621420](http://bugzil.la/1621420)
Prepare to update octokit dependency

▶ [patch] [#2503](https://github.com/taskcluster/taskcluster/issues/2503)
Some schemas in the Taskcluster documentation were not displayed with a "Cannot find .." error.  This has been fixed.

▶ [patch] [#2486](https://github.com/taskcluster/taskcluster/issues/2486)
Taskcluster UI now allows users to add matrix rooms to the denylist addresses.

▶ [patch] 
Taskcluster deployments now support sending results to New Relic (optionally).  See the deployment documentation for details.

▶ [patch] [bug 1618991](http://bugzil.la/1618991)
The Go client now correctly returns an error when 500 responses are retried to exhaustion.

▶ [patch] [#2498](https://github.com/taskcluster/taskcluster/issues/2498)
The database upgrade command now checks roles and permissions attributes for database users.

▶ [patch] 
The linux-arm builds of generic-worker are now considered [Tier-2](https://docs.taskcluster.net/docs/reference/workers/generic-worker/support-tiers), meaning that they are not tested in CI (but are still built).  Testing is also disabled on Windows 10 / amd64 due to lack of capacity, but continues for Windows 2012 / amd64 so Windows / amd64 remains a tier-1 platform.

▶ [patch] [#2536](https://github.com/taskcluster/taskcluster/issues/2536)
The node-postgres library is now configured to correctly handle timezones.  As no data was stored with timestamps until now, this is not a breaking change.

▶ [patch] [bug 1622052](http://bugzil.la/1622052)
The protocol between workers and worker manager now correctly negotiates capabilities.

▶ Additional changes not described here: [bug 1623183](http://bugzil.la/1623183), [#2527](https://github.com/taskcluster/taskcluster/issues/2527), [#2539](https://github.com/taskcluster/taskcluster/issues/2539).

## v28.0.0

▶ [MAJOR] [#2328](https://github.com/taskcluster/taskcluster/issues/2328)
This version adds a temporary "widgets" API method to the notify service.  This is intended to allow testing of the deployment process for Taskcluster services' backend database, and not for tracking of actual widgets.

This new API requires that Helm properties `notify.read_db_url` and `notify.write_db_url` be set correctly as documented in the [deployment documentation](https://docs.taskcluster.net/docs/manual/deploying/database).

▶ [minor] 
Add worker-runner binaries to the list of release artifacts

▶ [minor] [bug 1621630](http://bugzil.la/1621630)
Support for short-circuiting of boolean logic in JSON-e templates such as `.taskcluster.yml` is restored.

▶ [patch] 
AWS, GCP and Azure providers support the "shutdown" message, which requests
the worker-manager to terminate the instance

▶ [patch] [bug 1621167](http://bugzil.la/1621167)
The Taskcluster-GitHub service now uses structured logging to describe its handling of events from GitHub.  See [its logging documentation](https://docs.taskcluster.net/docs/reference/integrations/github/logs) for details.

▶ Additional change not described here: [bug 1621270](http://bugzil.la/1621270).

## v27.2.0

▶ [minor] [bug 1621630](http://bugzil.la/1621630)
JSON-e has been reverted to v3.0.1, meaning that short-circuit evaluation of boolean operators is again unsupported.  This support will return soon.

## v27.1.0

▶ [minor] [bug 1621630](http://bugzil.la/1621630)
JSON-e has been reverted to v3.0.2, meaning that short-circuit evaluation of boolean operators is again unsupported.  This support will return soon.

## v27.0.0

▶ [MAJOR] [bug 1620109](http://bugzil.la/1620109)
The long-deprecated `queue.defineTask` API method has been removed.

▶ [minor] [bug 1573192](http://bugzil.la/1573192)
A task's `metadata.owner` is no longer required to have the form of an email address, as discussed in [RFC#153](https://github.com/taskcluster/taskcluster-rfcs/blob/master/rfcs/0153-remove-email-validation-for-metadata-owner.md).

▶ [patch] 
Fixed worker-manager's azure-provider to properly report worker pool errors when provisioning workers fails.

▶ [patch] [bug 1547731](http://bugzil.la/1547731)
The web-server service now includes structured logging for web-server requests.

## v26.0.1

▶ [patch] 
Changes version imports for internal go libraries that weren't properly updated by the release script to v26.

## v26.0.0

▶ [MAJOR] [bug 1596177](http://bugzil.la/1596177)
Legacy create-task scopes without a priority, of the form `queue:create-task:<provisionerId>/<workerType>`, are no longer supported.

▶ [minor] 
Add support for a simple generic FreeBSD worker

▶ [minor] [bug 1473155](http://bugzil.la/1473155)
Schemas are now displayed in a two-column viewer to provide a more comprehensive understanding of the schema structures. The left panel shows the overall data structure while the right panel shows additional properties to keep in mind for certain data within the schemas. Users can also expand or shrink $ref schemas when needed.

▶ [minor] [bug 1618916](http://bugzil.la/1618916)
The Azure worker-manager provider now provides bootstrapping information to the worker in tags in addition to the `customData` instance metadata field, and worker-runner now expects to find data in tags.  This avoids the use of the barely-functional customData.  Reading this information from customData is now deprecated, but will continue to work at least until the next major Taskcluster release.

▶ [minor] 
The json-e library now supports short-circuiting in boolean logic, and so does Taskcluster for taskcluster.ymls now!

▶ [patch] [bug 1619925](http://bugzil.la/1619925)
Bug fix: taskcluster-proxy credential updates from task reclaims no longer race with taskcluster proxy process termination. Previously if a task completed just as the task was being reclaimed, it was possible for generic-worker to terminate the taskcluster-proxy process while it was HTTP posting updated credentials to it, which caused generic-worker to crash.

▶ [patch] [bug 1559434](http://bugzil.la/1559434)
Pulse passwords are now correctly encoded and can contain `/` characters.

▶ [patch] [#2386](https://github.com/taskcluster/taskcluster/issues/2386)
Taskcluster UI now no longer shows a cached view when a user deletes a role,
client or hook.

▶ [patch] [bug 1558240](http://bugzil.la/1558240)
The generic-worker logging change that appeared in v25.4.0 has been reverted.

▶ [patch] [bug 1617685](http://bugzil.la/1617685)
The queue service will now start up even if the AWS IP-to-region mapping file is not accessible.  In this case, it will use a local, cached copy of this information.

▶ [patch] [bug 1618983](http://bugzil.la/1618983)
The worker-manager's `static` provider type now supports worker lifecycles, and in particular `reregistrationTimeout`.

▶ [patch] 
Update `registerWorker` API to grant scopes for workers to terminate themselves

▶ [patch] [bug 1591476](http://bugzil.la/1591476)
worker-manager's `registerWorker()` now returns worker config, and worker-runner (for Azure and static providers, others coming soon) merges that configuration with other configuration sources.  This allows worker pools to include configuration for static workers, and allows Azure workers to fetch their config without referencing the non-functional customData instance metadata.

▶ Additional changes not described here: [bug 1596171](http://bugzil.la/1596171), [#2441](https://github.com/taskcluster/taskcluster/issues/2441), [bug 1455632](http://bugzil.la/1455632).

## v25.4.0

▶ [minor] [bug 1608185](http://bugzil.la/1608185)
Taskcluster-worker-runner now passes `--with-worker-runner` to generic-worker when running it directly.  When running generic-worker as a Windows service, this argument should be included in the service definition.

Only generic-worker versions 25.0.0 and higher support this argument.  In general, we recommend running matching versions of taskcluster-worker-runner and generic-worker.

▶ [minor] [bug 1522154](http://bugzil.la/1522154)
[Matrix](https://matrix.org/) notifications are now supported if a deployment is configured
with credentials for a homeserver. The three fields needed are:

```yaml
notify.matrix_base_url: foo # The homeserver where your client is registered
notify.matrix_user_id: bar # The user that will act on behalf of taskcluster
notify.matrix_access_token: baz # An access token for this user
```

If you are using riot, you can get the access token by following [this guide](https://t2bot.io/docs/access_tokens/).

▶ [patch] [bug 1600071](http://bugzil.la/1600071)
Avoid overprovisioning for instances that take a long time to boot.

▶ [patch] [#2404](https://github.com/taskcluster/taskcluster/issues/2404)
Fix worker type page when the latest task has no runs. Previously, an error
panel was being displayed with text "t.run is null".

▶ [patch] [bug 1616922](http://bugzil.la/1616922)
Generic-Worker documentation is now included in the Taskcluster documentation site,
and the generic-worker task payload has been slightly tightened.

* `task.payload.artifacts` must contain unique items
* `task.payload.onExitStatus.retry` must contain unique items

▶ [patch] [bug 1558240](http://bugzil.la/1558240)
Generic-worker now outputs a newline before `=== Task Finished ===`, to ensure that line is separated from other output in the logs.

▶ [patch] [bug 1433854](http://bugzil.la/1433854)
Task directories from previous task runs on Windows are now more aggressively
purged.

This should reduce the amount of time spent trying to delete task directories
between task runs, and also the amount of logging, in addition to freeing up
more disk space.

This issue always existed on the Windows version of generic-worker. A similar
issue existed on macOS and Linux but was fixed in bug 1615312 which was
initially tagged for release in v25.0.0, but first appeared in release 25.3.0
due to some problems with the release process.

▶ [patch] [#2004](https://github.com/taskcluster/taskcluster/issues/2004)
The Task Details panel in the Task view now wraps the payload text in order to
be able to see the complete payload without scrolling.

▶ [patch] [bug 1618066](http://bugzil.la/1618066)
fix bug where workerInfo could have NaN values

▶ [patch] [bug 1616649](http://bugzil.la/1616649)
reimplements azure-provider's use of the azure SDK to avoid blocking operations that can hold up worker-manager iterations
resource creation operations that were previously waiting for completion in the provisioner now are tracked and checked on as part of the worker-scanner iteration

▶ Additional change not described here: [bug 1616900](http://bugzil.la/1616900).

## v25.3.0

▶ [minor] [bug 1616214](http://bugzil.la/1616214)
Source code repositories taskcluster-worker-runner and jsonschema2go have been
migrated to the taskcluster monorepo. This is an internal change that should
not impact the release. However, it is a reasonably significant change to the
build/release process.

▶ [patch] [#2377](https://github.com/taskcluster/taskcluster/issues/2377)
Editing a task that contains ISO-8601 dates embedded in larger strings no longer fails with "Invalid Date".

▶ [patch] [bug 1616022](http://bugzil.la/1616022)
Fixes the version number reported by generic-worker. This was first attempted (unsuccessfully) in release 25.2.0.

▶ [patch] [bug 1606874](http://bugzil.la/1606874)
The Taskcluster-GitHub service now checks that the person who *filed* a pull request is a collaborator and the repo from which the changes are being pulled belongs to a collaborator or is the usptream repository.

▶ [patch] 
This version removes the undocumented, deprecated WebListener class from taskcluster-client-web.

▶ Additional changes not described here: [bug 1437193](http://bugzil.la/1437193), [#2371](https://github.com/taskcluster/taskcluster/issues/2371), [#2375](https://github.com/taskcluster/taskcluster/issues/2375).

## v25.2.0

▶ [minor] [bug 1616022](http://bugzil.la/1616022)
Generic worker now correctly reports its version number. The version number was incorrectly reported in release 25.1.1.

▶ Additional changes not described here: [bug 1615762](http://bugzil.la/1615762), [#2367](https://github.com/taskcluster/taskcluster/issues/2367).

## v25.1.1

No changes

## v25.1.0

▶ [minor] [bug 1587511](http://bugzil.la/1587511)
Worker pools that use cloud providers (aws, azure, google) now support a `lifecycle.reregistrationTimeout` config that
will make the credentials we hand to these workers expire within that amount of seconds. If the worker still exists
at that time, the instance will be terminated. This lays the groundwork for a subsequent release where you will
be able to have your workers reregister to continue working.

## v25.0.0

▶ [MAJOR] [bug 1608828](http://bugzil.la/1608828)
Generic worker is now shipped as part of the taskcluster platform release. The generic-worker codebase has been integrated into the monorepo. The former generic-worker github repo is now archived.  Consequently, the generic worker version number now matches the taskcluster platform release number.  The generic-worker binaries are published to https://github.com/taskcluster/taskcluster/releases.

With this change, the import path for the Taskcluster Go client library changes from `github.com/taskcluster/taskcluster/clients/client-go/vNN` to `github.com/taskcluster/taskcluster/vNN/clients/client-go`.  Functionality of the library remains unchanged.

▶ [patch] [bug 1588099](http://bugzil.la/1588099)
InsufficientScopes errors now contain a simplfied scope expression describing the missing scopes.  In most cases, this will be a single scope.

▶ [patch] [bug 1615312](http://bugzil.la/1615312)
Old generic-worker task directories on POSIX systems (Linux/macOS) are now
deleted more aggressively, by first running `chmod u+w -R <task dir>` before
running `rm -rf <task dir>`.

This bug always existed, and could leave files on the filesystem from previous
tasks. Those files were not readable to other task users under the
generic-worker multiuser engine where they were owned by a different OS user,
but they did consume disk space. The files were readable by other tasks under
the generic-worker simple engine, where all tasks run as the same user, but
simple engine is not used for tasks that contain sensitive/private information.

This bug was present in both the simple and multisuer engine, and has been
fixed on both.

Cleanup of Windows task directories will be handled separately in [bug
1433854](https://bugzilla.mozilla.org/show_bug.cgi?id=1433854).

▶ [patch] [bug 1608185](http://bugzil.la/1608185)
The `generic-worker` binary now accepts a `--with-worker-runner` argument and expects to interact with worker-runner if that option is given.  Otherwise, it will assume it is running alone and will not use any worker-runner features.

▶ Additional changes not described here: [bug 1615631](http://bugzil.la/1615631), [#2312](https://github.com/taskcluster/taskcluster/issues/2312), [#2321](https://github.com/taskcluster/taskcluster/issues/2321).

## v24.3.1

▶ [patch] [bug 1611266](http://bugzil.la/1611266)
azure-provider now ensures generated adminPasswords meet all passwords requirements

## v24.3.0

▶ [minor] [#2293](https://github.com/taskcluster/taskcluster/issues/2293)
The Taskcluster Python client now has an helper function to easily upload artifacts.

▶ [minor] [bug 1604175](http://bugzil.la/1604175)
The maximum "deadline" has been reverted to 5 days, after its change to 10 days in v24.1.3.  Values over 7 days caused internal server errors anyway, because the Azure queue backend cannot handle delays greater than that value.  Since this functionality never worked, the revert is considered minor.

▶ [patch] [bug 1606874](http://bugzil.la/1606874)
Changes behavior of tc-github when checking the user permissions on PR: now tc-github always checks the permissions 
of the PR author (or the organization of the PR origin if the PR was made from a fork in an org)

▶ [patch] [bug 1611266](http://bugzil.la/1611266)
Limit azure-provider name generation to alphanumeric to reduce invalid name errors (previously characters such as _ and - were included in some names and could be the ending character, resulting in errors)

▶ [patch] [bug 1613150](http://bugzil.la/1613150)
Taskcluster services now run with Node version 12.15.0.

▶ [patch] [bug 1584208](http://bugzil.la/1584208)
The client libraries' documentation has been throughly refactored and is now more helpful and contains better links to the documentation site.

▶ [patch] 
The deployment documentation now contains information on how Pulse users should be set up, as well as a complete schema for the Helm values file.

▶ [patch] [bug 1604649](http://bugzil.la/1604649)
The queue now avoids calling GetEntity for a worker in claimWork when no work was claimed, providing a very minor reduction in Azure load.

▶ [patch] [bug 1436478](http://bugzil.la/1436478)
This version includes the `taskcluster-lib-postgres` library, but does not use that library at runtime.

▶ Additional changes not described here: [bug 1537922](http://bugzil.la/1537922), [bug 1588083](http://bugzil.la/1588083), [bug 1611694](http://bugzil.la/1611694), [bug 1611696](http://bugzil.la/1611696), [#1963](https://github.com/taskcluster/taskcluster/issues/1963), [#2130](https://github.com/taskcluster/taskcluster/issues/2130).

## v24.2.0

▶ [minor] [bug 1600966](http://bugzil.la/1600966)
Adds a provider for azure vm instances to worker-manager.

▶ [patch] 
The Python client now normalizes the root URL in `optionsFromEnvironment()`.

▶ [patch] [#2269](https://github.com/taskcluster/taskcluster/issues/2269)
Links to specific log lines now autoscroll to correct location.

▶ Additional changes not described here: [#2266](https://github.com/taskcluster/taskcluster/issues/2266), [#2232](https://github.com/taskcluster/taskcluster/issues/2232).

## v24.1.10

▶ [patch] [#2031](https://github.com/taskcluster/taskcluster/issues/2031)
Taskcluster UI revamped the date picker component to allow selecting the hour and the minute in addition to the date.

▶ [patch] [bug 1608176](http://bugzil.la/1608176)
The go client's `client.SignedURL(..)` function can now accept and sign full URLs in its first argument.  This allows signing arbitrary URLs, even if they are not on the same RootURL as the client.

▶ Additional changes not described here: [bug 1606948](http://bugzil.la/1606948), [#2201](https://github.com/taskcluster/taskcluster/issues/2201).

## v24.1.9

▶ [patch] [bug 1598649](http://bugzil.la/1598649)
Final bits of release debugging (sorry!)

## v24.1.8

▶ [patch] [bug 1598649](http://bugzil.la/1598649)
Final bit of debugging of the release process.  No other changes.

## v24.1.7

▶ [patch] [bug 1598649](http://bugzil.la/1598649)
Further debugging of the release process.

## v24.1.6

▶ [patch] [bug 1598649](http://bugzil.la/1598649)
Additional changes to the release process.

## v24.1.5

▶ [patch] 
Changes only to the release process.

## v24.1.4

No changes

## v24.1.3

▶ [patch] [bug 1604175](http://bugzil.la/1604175)
A task's deadline can now be up to 10 days in the future (replacing the previous limit of 5 days).

▶ [patch] [bug 1605933](http://bugzil.la/1605933)
Fix possible XSS vulnerability with the lazylog viewer

▶ [patch] [#1660](https://github.com/taskcluster/taskcluster/issues/1660)
Taskcluster UI now properly displays the error panel in the docs site.

▶ Additional changes not described here: [bug 1588083](http://bugzil.la/1588083), [bug 1598643](http://bugzil.la/1598643), [bug 1598649](http://bugzil.la/1598649), [bug 1602985](http://bugzil.la/1602985), [#1684](https://github.com/taskcluster/taskcluster/issues/1684), [#2130](https://github.com/taskcluster/taskcluster/issues/2130), [#2187](https://github.com/taskcluster/taskcluster/issues/2187), [bug 1598649](http://bugzil.la/1598649).

## v24.1.2

▶ [patch] [#2159](https://github.com/taskcluster/taskcluster/issues/2159)
Taskcluster UI /auth/scopes view has been revamped to improve the experience and avoid confusions with the Clients and Roles views.

▶ [patch] [#2166](https://github.com/taskcluster/taskcluster/issues/2166)
Taskcluster UI Worker view now gracefully allows a user to quarantine a worker when a recent task has expired.

▶ [patch] [bug 1537922](http://bugzil.la/1537922)
The `auth.createClient` API method is now properly idempotent, allowing the same call multiple times in short succession.

▶ [patch] [bug 1603197](http://bugzil.la/1603197)
The notify service's irc process now logs a bit more contextual information about what it is up to, and ignores some common replies from IRC servers instead of considering them "unhandled".

▶ Additional changes not described here: [#2125](https://github.com/taskcluster/taskcluster/issues/2125), [#2179](https://github.com/taskcluster/taskcluster/issues/2179).

## v24.1.1

▶ [patch] 
Fix regression in Taskcluster UI custom actions in the task view not being triggered.

▶ [patch] 
Provisioning logic now counts workers correctly

▶ [patch] [#2155](https://github.com/taskcluster/taskcluster/issues/2155)
Taskcluster UI no longer takes the user to a different run when expanding the artifacts dropdown.

▶ Additional change not described here: [#2152](https://github.com/taskcluster/taskcluster/issues/2152).

## v24.1.0

▶ [minor] [bug 1599122](http://bugzil.la/1599122)
Worker Manager now does a better job at keeping provisioning in-sync with reality.

* Workers now have a top-level `capacity` field which is how many tasks it can run at once.
* Workers now have `lastModified` and `lastChecked` fields which are useful for determining
  the state the worker is actually in vs what state Taskcluster thinks it is in.
* When calling `createWorker` manually, you can now specify a capacity for the worker.

▶ [minor] [bug 1587511](http://bugzil.la/1587511)
WorkerPools can now be configured to terminate workers that fail to register after some amount of time.
Both of the google and aws providers now support a `lifecycle` object that for now has a single key
of `registrationTimeout`. It is optional and if it is provided the value is an integer with the number
of seconds a worker has to register before it is terminated.

This helps catch misconfigured or broken workers before they become zombies or worse.

▶ [patch] [#217](https://github.com/taskcluster/taskcluster/issues/217)
Taskcluster UI no longer displays duplicated app bars when connecting via SSH.

▶ [patch] [bug 1595749](http://bugzil.la/1595749)
Taskcluster login now properly handles an edge case where a couple of users were hitting which prevented them to login.

▶ [patch] [bug 1599550](http://bugzil.la/1599550)
The `auth.sentry_*` Helm parameters are no longer required.  If they are omitted, then the service will start up but the `auth.sentryDSN` REST API method will return 404's.

▶ [patch] [bug 1599893](http://bugzil.la/1599893)
Worker Manager now takes optional configuration to change the timings on the lib-iterate loops
that control provisioning. The values are `worker_manager.provisioner_iterate_config` and
`worker_manager.worker_scanner_iterate_config`. Each is a JSON object where you can set the following:

* `maxFailures` - Which sets how many iterations in a row can fail before the task crashes
* `maxIterationTime` - How long (in ms) an iteration is allowed to take before it is ended
* `waitTime` - How long (in ms) to wait in between loops

▶ Additional changes not described here: [#2114](https://github.com/taskcluster/taskcluster/issues/2114), [#2130](https://github.com/taskcluster/taskcluster/issues/2130), [bug 1577839](http://bugzil.la/1577839).

## v24.0.2

▶ [patch] [bug 1602642](http://bugzil.la/1602642)
The typo in configuration for aws s3 bucket credentialing is fixed.

It was set as `allowdBuckets` and is now `allowedBuckets`

## v24.0.1

▶ [patch] [bug 1601149](http://bugzil.la/1601149)
The `github.github_private_pem` Helm configuration now correctly accepts a configuration containing raw (unescaped) newlines.
A change to how configuration values are escaped in the Helm templates caused this support to regress in 24.0.0.

▶ [patch] [#2096](https://github.com/taskcluster/taskcluster/issues/2096)
Workers in the UI are now displayed in a table instead of cards.

## v24.0.0

▶ [MAJOR] [bug 1598758](http://bugzil.la/1598758)
Credentials for the `auth.awsS3Credentials` method are no longer specified in Helm properties `auth.aws_access_key_id`, `auth.aws_secret_access_key`, and `auth.aws_region`.  Instead this information is now configured in `auth.aws_credentials_allowed_buckets` as described in [the deployment docs](https://docs.taskcluster.net/docs/manual/deploying/cloud-credentials).  The region is no longer required, but the configuration must now include a list of supported buckets.  For a quick update, set `auth.aws_credentials_allowed_buckets` to `[{"accessKeyId": "<access_key_id>", "secretAccessKey": "<secret_access_key>", "buckets": ["<bucket_name>"]}]`.

▶ [MAJOR] 
Services that previously used hard-coded values despite advertising Helm parameters now honor those optional Helm parameters:
* `notify.irc_port`
* `github.provisioner_id`
* `github.worker_type`

The last two parameters name a worker pool (`<provisioner_id>/<worker_type>`) that is used as a default for older (v0) `.taskcluster.yml` files.
Rather than set these parameters, users should be encouraged to set the values explicitly in `.taskcluster.yml`.

The notify service no longer accepts Helm configuration property `notify.irc_pulse_queue_name`.  No known deployment has this value set.

▶ [MAJOR] [bug 1577785](http://bugzil.la/1577785)
The Helm configuration properties `queue.public_blob_artifact_bucket`,  `queue.private_blob_artifact_bucket`,  and `queue.blob_artifact_region` are no longer allowed, as the artifact types these configured are no longer supported.

▶ [MAJOR] [bug 1598329](http://bugzil.la/1598329)
The long-deprecated `queue.pollTaskUrls` API method has been removed.

▶ [minor] [bug 1585157](http://bugzil.la/1585157)
All current worker-manager's API endpoints, queue's artifact-related endpoints, working and non-checks-related github's endpoints, and the listLastFires endpoint are being graduated from experimental status to stable.

▶ [minor] [bug 1596615](http://bugzil.la/1596615)
Switch to Node 12.13.0

▶ [minor] [#895](https://github.com/taskcluster/taskcluster/issues/895)
Taskcluster UI now uses the v4 version of material-ui. It was previously running on v3.

▶ [minor] [#450](https://github.com/taskcluster/taskcluster/issues/450)
Taskcluster docs now supports quick search.

▶ [minor] [bug 1518190](http://bugzil.la/1518190)
Taskcluster now supports backups, restores, and verification of Azure tables and containers.  See the [deployment docs](https://docs.taskcluster.net/docs/manual/deploying/backups) for details.

▶ [minor] [#2028](https://github.com/taskcluster/taskcluster/issues/2028)
The Taskcluster Python client now has helper classes to ease integration into customers' projects.

▶ [patch] [bug 1599291](http://bugzil.la/1599291)
Added logging around worker provisioning logic to keep better track of workers.

* `worker-requested`, `worker-running`, `worker-stopped` are all three new log messages
  that allow you to track the lifecycle of workers
* `scan-seen` reports on the state of the world that the worker-scanner
  has observed on each run
* `simple-estimator` messages now have an error status if `runningCapacity` is greater
   than `maxCapacity`. This state occurs due to a bug in worker-manager and should be
   reported to the taskcluster team if it occurs
*  This state will also report an error to a configured error reporter if you have one.

▶ [patch] 
Fix URL construction for signing in with multiple scopes.

▶ [patch] [bug 1597331](http://bugzil.la/1597331)
Instances created by the AWS provider now have an explicit `WorkerPoolId` tag.  The Google provider now supplies `created-by` and `owner` tags.

▶ [patch] [#1398](https://github.com/taskcluster/taskcluster/issues/1398)
Taskcluster UI "Compare Scopesets" and "Expand Scopesets" views now deeply linked. In other words, you can share the URL and still preserve state.

▶ [patch] [bug 1600125](http://bugzil.la/1600125)
Taskcluster UI Secret view no longer requires the save button to be under the code editor to save a secret.

▶ [patch] [bug 1600127](http://bugzil.la/1600127)
Taskcluster UI Secret view now allows making modifications to the secret multiple times without having to reload the page.

▶ [patch] [#2073](https://github.com/taskcluster/taskcluster/issues/2073)
Taskcluster UI Task view now properly links to the Worker view when clicking on the Worker ID.

▶ [patch] [#2078](https://github.com/taskcluster/taskcluster/issues/2078)
Taskcluster UI Workers view now include quarantined workers by default without having to toggle the filter dropdown.

▶ [patch] [#1909](https://github.com/taskcluster/taskcluster/issues/1909)
Taskcluster UI log viewer now displays the log name in the app bar.

▶ [patch] [#1558](https://github.com/taskcluster/taskcluster/issues/1558)
Taskcluster UI no longer requires two clicks to return back to the list of resources after editing a resource (e.g., a secret).

▶ [patch] [#1913](https://github.com/taskcluster/taskcluster/issues/1913)
Taskcluster UI no longer uses the same status color for pending and unscheduled labels.

▶ [patch] [#2005](https://github.com/taskcluster/taskcluster/issues/2005)
Taskcluster UI now adds more accuracy when displaying the distance between given dates in words.

▶ [patch] [#1685](https://github.com/taskcluster/taskcluster/issues/1685)
Taskcluster UI now allows editing a worker pool that is scheduled for deletion.

▶ [patch] [bug 1597276](http://bugzil.la/1597276)
Taskcluster UI now doesn't open artifacts in the log viewer by default when the file is not plain text.

▶ [patch] [#1874](https://github.com/taskcluster/taskcluster/issues/1874)
Taskcluster UI now properly aligns menu items in  action menu (speed dial).

▶ [patch] [#2076](https://github.com/taskcluster/taskcluster/issues/2076)
Taskcluster UI speed dial component no longer toggles on hover.

▶ [patch] 
Taskcluster login no longer throws a TypeError when a profile from the PersonAPI has no identities when logging in via auth0.

▶ [patch] [bug 1597922](http://bugzil.la/1597922)
Taskcluster now has the necessary CSP headers to avoid clickjacking.

▶ [patch] [bug 1596098](http://bugzil.la/1596098)
The Queue and Hooks services now return a 400 error when an entity is too large for the storage backend, instead of a 500.

▶ [patch] [#1949](https://github.com/taskcluster/taskcluster/issues/1949)
The Task view in Taskcluster UI now allows users to have the artifacts panel expanded on page load  if the url has the artifacts hash (i.e., #artifacts)

▶ [patch] [#1900](https://github.com/taskcluster/taskcluster/issues/1900)
The Taskcluster UI Task view now shows "Reason Resolved" above the fold. You previously had to click "See More" to find this field.

▶ [patch] [#1997](https://github.com/taskcluster/taskcluster/issues/1997)
The log view in Taskcluster UI now properly scrolls horizontally. Some users were experiencing text truncation for long lines as well as scrolling issues on mobile.

▶ [patch] [bug 1599564](http://bugzil.la/1599564)
The purge-cache service now recovers better from Azure errors, where previously a single Azure error would cause subsequent API calls to also fail until the service was restarted.

▶ [patch] [#1455](https://github.com/taskcluster/taskcluster/issues/1455)
The schema viewer in Taskcluster UI now properly shows a tooltip when pattern is cut off.

▶ [patch] [bug 1491551](http://bugzil.la/1491551)
When an API request times out, the JS client now correctly retuns an error describing a timeout with `err.code === 'ECONNABORTED'`, instead of `err.code === 'ABORTED'`.

▶ [patch] [#1715](https://github.com/taskcluster/taskcluster/issues/1715)
Worker Manager UI now provides a more recent version of workerPool configs for initial values.

▶ [patch] [bug 1599122](http://bugzil.la/1599122)
Worker-manager's AWS provider now more precisely aligns its worker-spawning counts to the desired capacity.  Due to rounding, it may previously have spawned up to one additional instance per launchConfig.

▶ [patch] [bug 1586839](http://bugzil.la/1586839)
getInstallations endpoint was renamed to listInstallations in octokit. This patch fixes our call to the API

▶ Additional changes not described here: [bug 1511676](http://bugzil.la/1511676), [bug 1579496](http://bugzil.la/1579496), [bug 1588096](http://bugzil.la/1588096), [bug 1596171](http://bugzil.la/1596171), [bug 1598643](http://bugzil.la/1598643), [bug 1598788](http://bugzil.la/1598788), [bug 1599299](http://bugzil.la/1599299), [#1244](https://github.com/taskcluster/taskcluster/issues/1244), [#1412](https://github.com/taskcluster/taskcluster/issues/1412), [#1421](https://github.com/taskcluster/taskcluster/issues/1421), [#1658](https://github.com/taskcluster/taskcluster/issues/1658), [#1747](https://github.com/taskcluster/taskcluster/issues/1747), [#1751](https://github.com/taskcluster/taskcluster/issues/1751), [#1774](https://github.com/taskcluster/taskcluster/issues/1774), [#1822](https://github.com/taskcluster/taskcluster/issues/1822), [#1908](https://github.com/taskcluster/taskcluster/issues/1908), [#1953](https://github.com/taskcluster/taskcluster/issues/1953), [#2019](https://github.com/taskcluster/taskcluster/issues/2019), [#677](https://github.com/taskcluster/taskcluster/issues/677), [#1911](https://github.com/taskcluster/taskcluster/issues/1911), [#1968](https://github.com/taskcluster/taskcluster/issues/1968), [#1754](https://github.com/taskcluster/taskcluster/issues/1754), [#1934](https://github.com/taskcluster/taskcluster/issues/1934), [bug 1596417](http://bugzil.la/1596417), [#1773](https://github.com/taskcluster/taskcluster/issues/1773).

## v23.0.0

▶ [MAJOR] 
Support for several deprecated services has been removed.
* The login service has been removed from the codebase and from all client libraries.  It was retired on November 9, 2019 when the external services that depended on it migrated to third-party login support.  It was never part of the Helm deployment.
* Support for the deprecated ec2-manager and aws-provisioner services has been removed from all client libraries.  These services are no longer running, so this should have minimal impact.
* Support for the long-removed events service and the never-released gce-provisioner service has been removed from the Go client.

▶ [MAJOR] 
The Taskcluster Go client no longer uses the deprecated concept of BaseURL, instead requiring a RootURL.  Users of the `New` and `NewFromEnv` functions do not need to change anything.  However, any code that has manually constructed a client object, or set such an object's `BaseURL` property, must be updated to use `RootURL` instead.

▶ [MAJOR] 
The `auth.statsumToken` method has been removed.  The service for which this returns a token has not run for over a year, so the impact is minimal.

▶ [MAJOR] [bug 1577785](http://bugzil.la/1577785)
The artifact types `blob` and `azure` are no longer supported.  Neither of these types has seen real use, and both are broken in all known deployments of Taskcluster.

The [Object Service](https://bugzilla.mozilla.org/show_bug.cgi?id=1471582) will implement much of the same functionality, but likely with subtle differences.  Removing these unused artifact types now will simplify migration to the Object Service once it is developed.

▶ [MAJOR] 
The auth service no longer accepts Helm configuration properties `auth.client_table_name` or `auth.role_container_name`.  These values are now assumed to be `Clients` and `auth-production-roles`, respectively.  No known deployments of Taskcluster use any other value.

The auth service now honors `sentry_organization`, `sentry_host`, `sentry_team`, and `sentry_key_prefix`.  Previously, the values of these properties were ignored.

▶ [minor] [#1923](https://github.com/taskcluster/taskcluster/issues/1923)
The web-server service now uses its own azure session table to keep track of sessions. This solves the following issues:
* Restarting the web-server service clears all user sessions
* Spinning up multiple werb-server services for load balancing is not possible since we stored sessions in memory and the latter belong to a single instance

▶ [patch] [bug 1595221](http://bugzil.la/1595221)
Adds an LRU cache to getTask method, so that we don't have to make too many calls to Azure (tasks are immutable anyways)
The default value for the cache size is 10. The name of the optional prop in the dev-config.yml is `queue.task_cache_max_size`

▶ [patch] [bug 1595838](http://bugzil.la/1595838)
Errors completing a blob artifact upload are no longer returned with statusCode 500.

▶ [patch] [#1962](https://github.com/taskcluster/taskcluster/issues/1962)
Taskcluster UI error panels are now scrollable.

▶ [patch] [bug 1574854](http://bugzil.la/1574854)
Taskcluster UI now does not show a "404" text when a page could not be found in the UI so as not to pretend an HTTP response code that didn't occur.

▶ [patch] [bug 1595734](http://bugzil.la/1595734)
Taskcluster UI now properly creates interactive tasks from the task creator.

▶ [patch] [#1881](https://github.com/taskcluster/taskcluster/issues/1881)
Taskcluster UI now properly renders the task title in the app bar.

▶ [patch] [bug 1595418](http://bugzil.la/1595418)
Taskcluster UI now properly shows task dependencies of tasks that don't have a decision task.
A task with no decision task is a common thing to have outside the firefox-ci cluster.

▶ [patch] [#1951](https://github.com/taskcluster/taskcluster/issues/1951)
Taskcluster UI now properly shows the Quarantine Until date.

▶ [patch] [#1972](https://github.com/taskcluster/taskcluster/issues/1972)
Taskcluster UI now shows up to 1000 workers and worker-types in the paginated table. We previously only showed ~15 rows per page.

▶ [patch] [bug 1595667](http://bugzil.la/1595667)
Taskcluster third-party login  UI now instructs users to sign in to provide credentials to a third party registered client instead of showing them the home page.

▶ [patch] [bug 1596523](http://bugzil.la/1596523)
Taskcluster web-server process will stop crashing when something goes wrong when logging in.

▶ [patch] [#1988](https://github.com/taskcluster/taskcluster/issues/1988)
The built-in retrigger action no longer removes fields like `taskId` from within the task definition.

▶ [patch] [bug 1593762](http://bugzil.la/1593762)
The google provider now accepts workerpools with underscores in the name

▶ [patch] [bug 1595238](http://bugzil.la/1595238)
The queue service now polls Azure queues for deadline, dependency, and task claims less frequently when those queues are empty.  This should reduce the rate of GetMessageRead and GetMessagesRead Azure API calls.

▶ [patch] [bug 1579065](http://bugzil.la/1579065)
This release upgrades Hawk, the underlying authentication mechanism for REST API access, to `@hapi/hawk` since the older `hawk` dependency is depreciated.

▶ Additional changes not described here: [bug 1596531](http://bugzil.la/1596531), [bug 1585141](http://bugzil.la/1585141), [#1946](https://github.com/taskcluster/taskcluster/issues/1946), [#1995](https://github.com/taskcluster/taskcluster/issues/1995).

## v22.1.1

▶ [patch] 
Third-Party Logins now correctly intersect the requested scopes with the user's *expanded* scopes.
Previous versions would result in a client with an empty set of scopes, when the required scopes were associated with a role given to the user.

## v22.1.0

▶ [minor] [#1875](https://github.com/taskcluster/taskcluster/issues/1875)
Taskcluster UI now adds the ability to cancel a task from the Task view

▶ [minor] [#1919](https://github.com/taskcluster/taskcluster/issues/1919)
Taskcluster UI now exposes an additional env var `BANNER_MESSAGE` to inform users with important messages (e.g., "Taskcluster will be down for maintenance on November 11") in the UI.

▶ [patch] [bug 1588083](http://bugzil.la/1588083)
Deployment smoketests can now be run from a `taskcluster/taskcluster-devel:v<version>` Docker image.
See the deployment documentation for details.

▶ [patch] [#1857](https://github.com/taskcluster/taskcluster/issues/1857)
Errors regarding `authorizedScopes` are now formatted in Markdown, and thus more readable in error messages in the Taskcluster UI.

▶ [patch] [#1895](https://github.com/taskcluster/taskcluster/issues/1895)
Taskcluster UI CLI login now uses the intersection of scopes (?scope=...) with the user's scopes to generate the set of scopes added to the client.

▶ [patch] [#1892](https://github.com/taskcluster/taskcluster/issues/1892)
Taskcluster UI now adds the ability to retrigger a task from the Task view.

▶ [patch] [#1879](https://github.com/taskcluster/taskcluster/issues/1879)
Taskcluster UI now allows users to copy artifact links from index browser
through the normal right-click-copy-link.

▶ [patch] [bug 1593809](http://bugzil.la/1593809)
The taskcluster-github service now correctly uses the `github.bot_username` configuration to look up the latest status for a branch.
Deployments of Taskcluster should double-check that this value is set correctly; see the [deployment docs](https://docs.taskcluster.net/docs/manual/deploying/github) for details.

▶ [patch] 
The taskcluster-index service now responds with a 404 and "Indexed task not found" when a task is not found, instead of the misleading "Indexed task has expired".

▶ [patch] [bug 1593754](http://bugzil.la/1593754)
The web-server service now uses the correct Pulse namespace to listen for pulse messages.  This fixes one more bug preventing task and task-group UI from dynamically updating.

## v22.0.0

▶ [MAJOR] [bug 1591591](http://bugzil.la/1591591)
The deployment Helm variable `ui.application_name` has been renamed to a top-level `applicationName`.  This value is now used as context in the GitHub status and check posts to PRs and commits.

▶ [MAJOR] [bug 1590175](http://bugzil.la/1590175)
Worker pools now support instance capacity in configuration such that larger instances can handle more tasks if desired. The configuration option, `instanceCapacity` was already accepted but previously had no effect.  As long as this value is set to 1 for all aws and google worker pools, this change will have no effect.

▶ [minor] [#1758](https://github.com/taskcluster/taskcluster/issues/1758)
Taskcluster shell client 'signin' command can now interact with the new UI.

▶ [patch] [#1842](https://github.com/taskcluster/taskcluster/issues/1842)
API documentation display is fixed.

▶ [patch] [bug 1593142](http://bugzil.la/1593142)
AWS Providers in Worker Manager now handle `RequestLimitExceeded` errors from AWS gracefully with exponential backoff

▶ [patch] [#1771](https://github.com/taskcluster/taskcluster/issues/1771)
Taskcluster now properly allows a client to be saved when the "Delete on expiration" switch is changed when updating an existent client.

*This release includes additional changes that were not considered important enough to mention here; see https://github.com/taskcluster/taskcluster/tree/v22.0.0%5E/changelog for details.*

## v21.3.0

▶ [minor] [bug 1588834](http://bugzil.la/1588834)
* AWS Provider worker pools now allow specifying additional userdata beyond that generated by the provider itself.

▶ [minor] [#1529](https://github.com/taskcluster/taskcluster/issues/1529)
When a third party site tries to login to the deployment, Taskcluster now attempts to auto login when there is only one login strategy configured. Previously, a user had to click on "Sign In" then click on the login strategy.

▶ [patch] [#1839](https://github.com/taskcluster/taskcluster/issues/1839)
Sign-In buttons now work properly with Firefox Nightly, instead of failing with a blank tab.

▶ [patch] [#1835](https://github.com/taskcluster/taskcluster/issues/1835)
Taskcluster now properly read the expires query parameter for whitelisted third-party login clients.
It was previously creating third-party login clients using the maxExpires value.
This issue was only seen with clients that are whitelisted.

▶ [patch] [#1840](https://github.com/taskcluster/taskcluster/issues/1840)
The Taskcluster UI can now fire actions with type 'task' without causing a schema validation error.

▶ [patch] [#1838](https://github.com/taskcluster/taskcluster/issues/1838)
The task-group and task views now update dynamically as tasks change status.

*This release includes additional changes that were not considered important enough to mention here; see https://github.com/taskcluster/taskcluster/tree/v21.3.0%5E/changelog for details.*

## v21.2.0

▶ [minor] [bug 1589449](http://bugzil.la/1589449)
* Implements remove worker functionality in Worker Manager AWS provider.
* Corrects a typo in the route of remove worker api endpoint of Worker Manager

▶ [minor] [#1713](https://github.com/taskcluster/taskcluster/issues/1713)
Taskcluster now supports command-line logins via the UI. Query parameters
are `client_id` and `callback_url`.

▶ [minor] [bug 1590848](http://bugzil.la/1590848)
The JSON-e context used to render `.taskcluster.yml` in GitHub repositories now contains `taskcluster_root_url` giving the root URL.
This can be used for conditionals in the file, or to generate URLs.

▶ [patch] [bug 1545939](http://bugzil.la/1545939)
All long-runnning processes are now restarted once every 24 hours by kubernetes. This
is partially to replicate how Heroku ran the services and partially just because it
is a good idea.

*This release includes additional changes that were not considered important enough to mention here; see https://github.com/taskcluster/taskcluster/tree/v21.2.0%5E/changelog for details.*

## v21.1.1

No changes

## v21.1.0

▶ [minor] [bug 1589449](http://bugzil.la/1589449)
* Implements remove worker functionality in Worker Manager AWS provider.
* Corrects a typo in the route of remove worker api endpoint of Worker Manager

▶ [minor] [#1713](https://github.com/taskcluster/taskcluster/issues/1713)
Taskcluster now supports command-line logins via the UI. Query parameters
are `client_id` and `callback_url`.

▶ [minor] [bug 1590848](http://bugzil.la/1590848)
The JSON-e context used to render `.taskcluster.yml` in GitHub repositories now contains `taskcluster_root_url` giving the root URL.
This can be used for conditionals in the file, or to generate URLs.

▶ [patch] [bug 1545939](http://bugzil.la/1545939)
All long-runnning processes are now restarted once every 24 hours by kubernetes. This
is partially to replicate how Heroku ran the services and partially just because it
is a good idea.

*This release includes additional changes that were not considered important enough to mention here; see https://github.com/taskcluster/taskcluster/tree/v21.1.0%5E/changelog for details.*

## v21.0.0

[MAJOR] ([bug 1578900](http://bugzil.la/1578900)) * Worker Manager AWS Provider now requires the `ec2:DescribeRegions` permission in addition to the previous permissions.
  The full permissions set is documented in the  deploying workers section of the manual.
* Worker Manager AWS Provider now uses all the configs from the array of `launchConfigs` worker pools use, rather than a
  single, randomly selected config. This allows per-region and per-zone resources to be specified. MinCapacity and 
  MaxCapacity are now specified for the whole worker pool as opposed to for every individual config.

```diff
some/worker:
  config:
    minCapacity: 25
    maxCapacity: 50
-   regions: [us-central1, ...]
-   capacityPerInstance: 1
-   ...
+   launchConfigs:
+     - region: us-central1
+       capacityPerInstance: 1
+       ...
```

[minor] ([#1576](https://github.com/taskcluster/taskcluster/issues/1576)) AWS Provisioner support has been removed from the UI and it is no longer a navigation menu item.
This service has not been a part of the Taskcluster deployment for some time.

([bug 1589403](http://bugzil.la/1589403)) Fix a regression in Github logins. A header was not being set.

([#1573](https://github.com/taskcluster/taskcluster/issues/1573)) The UI now properly listens to pulse messages.
It was previously hard-coded to a value that would only
work on https://taskcluster-ui.herokuapp.com/.
We now read the pulse namespace from `PULSE_USERNAME`.

([#1665](https://github.com/taskcluster/taskcluster/issues/1665)) The web-server service now properly configures CORS for
its third party login endpoints `/login/oauth/token` and
`/login/oauth/credentials`.

([bug 1589368](http://bugzil.la/1589368)) Taskcluster-GitHub now correctly reports InsufficientScopes errors, instead of "Cannot read property 'unsatisfied' of undefined".

## v20.0.0

[MAJOR] The worker-manager service's `google` provider type now requires that worker pool definitions contain an array of possible variations of workers for the pool, in the `launchConfig` property.
See [google provider type](https://docs.taskcluster.net/docs/reference/core/worker-manager/google) for more detail.
Note that this is a breaking change that will cause all `google`-based worker pools to stop provisioning until they have been updated to the new format.
To update, change the `config` field by moving all fields *except* `minCapacity` and `maxCapacity` into an array in `launchConfigs`:

```diff
some/worker:
  config:
    minCapacity: 25
    maxCapacity: 50
-   region: us-central1
-   zone: us-central1-a
-   capacityPerInstance: 1
-   minCpuPlatform: "Intel Skylake"
-   ...
+   launchConfigs:
+     - region: us-central1
+       zone: us-central1-a
+       capacityPerInstance: 1
+       minCpuPlatform: "Intel Skylake"
+       ...
```

([bug 1585102](http://bugzil.la/1585102)) The GitHub service now posts a more useful comment to pull requests and commits when an InsufficientScopes error occurs.
The message now includes the scopes used to make the API call, including the `assume:repo:..` role.

## v19.0.0

[MAJOR] ([bug 1584321](http://bugzil.la/1584321)) Scopes for the Taskcluster services themselves are now handled internally to the platform, although access tokens must still be managed as part of the deployment process.
When deploying this version, remove all `scopes` and `description` properties from `static/taskcluster/..` clients in the array in the Auth service's `STATIC_CLIENTS` configuration.
See [the new docs on static clients](https://docs.taskcluster.net/docs/manual/deploying/static-clients) for more background on this setting.

[minor] ([bug 1586102](http://bugzil.la/1586102)) The github service now adds scopes for check/status scopes and its scheduler-id, where previously it had relied on specific configuration of the `repo:github.com/*` role.
There is no longer a need to add such scopes scopes to the role `repo:github.com/*`.

[minor] ([#1486](https://github.com/taskcluster/taskcluster/issues/1486)) The Worker-Manager `google` provider implementation now supports terminating instances in response to `workerManager.removeWorker(..)`  API calls.

([#1495](https://github.com/taskcluster/taskcluster/issues/1495)) In the previous version, indirect go dependency `github.com/streadway/amqp` had an invalid pseudo-version.
This has been fixed, and the tool that generated the incorrect dependency (renovate) has been disabled.

## v18.0.3

([bug 1585135](http://bugzil.la/1585135)) The fix in 18.0.2 is updated to replace *all* escaped newlines in the `GITHUB_PRIVATE_PEM` config, not just the first.

## v18.0.2

([bug 1585135](http://bugzil.la/1585135)) The `github.private_pem` configuration in `GITHUB_PRIVATE_PEM` can now be specified with "regular" newlines or with encoded newlines (`\` `\n`).
This works around a bug in the generation of multiline secrets present in the Mozilla deployment pipeline.

## v18.0.1

No changes

## v18.0.0

[MAJOR] ([bug 1583935](http://bugzil.la/1583935)) Administrative scopes for worker pools are now `worker-manager:manage-worker-pool:<workerPoolId>`.
Existing `worker-manager:{create,update}-worker-type:<workerPoolId>` scopes are no longer recognized.

[minor] ([bug 1323871](http://bugzil.la/1323871)) Taskcluster now issues scopes based on repo access for Github logins. 
Static clients need to be updated in deployments.

([bug 1582376](http://bugzil.la/1582376)) Taskcluster now uses the AMQP server's value for `frame_max`, rather than enforcing its own limit of 4k.
The server level should be configured to 128k.
This is the default for RabbitMQ, so in most cases no change is required.

## v17.0.0

[MAJOR] ([bug 1561905](http://bugzil.la/1561905)) 1. Static clients need to be updated in deployments.
2. The web-server service now requires azure credentials configured for login to work properly, namely
`AZURE_ACCOUNT_ID`, `AZURE_SIGNING_KEY`, and `AZURE_CRYPTO_KEY`.
3. For a third party to get TC credentials, it first needs to have a client registered in the deployment of the
web-server service. This is governed by the `REGISTERED_CLIENTS` configuration.
See https://docs.taskcluster.net/docs/manual/deploying/third-party for the shape of a client.

[MAJOR] ([#1260](https://github.com/taskcluster/taskcluster/issues/1260)) Google provider in worker-manager now requires you to manually set up
a service account for your workers to run under. If you are migrating
from a previously deployed worker-runner, you can just use the account
we created for you automatically before. It always had the name
`taskcluster-workers`.

Your config will changein the following way:

```yaml
# Old
providers:
  google-project:
    providerType: google
    project: ...
    creds: ...
    instancePermissions:
      - ...
      - ...

# New
providers:
  google-project:
    providerType: google
    project: ...
    creds: ...
    workerServiceAccountId: ...
```

([#778](https://github.com/taskcluster/taskcluster/issues/778)) User-created clients are regularly scanned, and disabled if the owning user no longer has the relevant scopes.
Such users are now also disabled if the owning user has been removed from the identity provider.

([#1216](https://github.com/taskcluster/taskcluster/issues/1216)) Users of taskcluster-ui are now logged out if they are not logged-in in the eyes of web-server.
This would avoid having web-server be out-of-sync when restarted for example.

## v16.2.0

[minor] ([bug 1561320](http://bugzil.la/1561320)) Taskcluster deployments now support sentry error reporting. You can configure this option by setting
an `errorConfig` at the top-level of your config:

```
rootUrl: ...
errorConfig:
  reporter: SentryReporter
  dsn: <your sentry dsn>
```

Errors will be reported to this project and tagged with service/process names in addition to taskcluster
release version.

([bug 1574656](http://bugzil.la/1574656)) Worker-pool configurations for google-based providers now accept a `workerConfig` property, which is passed to new workers.
The existing `userData` property is deprecated.

## v16.1.0

[minor] ([bug 1572775](http://bugzil.la/1572775)) * All lib-loader `setup` functions now get passed their own
  name to allow logging more usefully.
* There is now a document in dev-docs explaining recommended
  monitoring practices.

[minor] ([bug 1553953](http://bugzil.la/1553953)) The `workerType` identifier now has a more restrictive pattern:
 * consisting of lower-case alphanumeric plus dash (`-`)
 * from 1 to 38 characters long
 * beginning with a lower-case alphabetic character
 * ending with a lower-case alphanumeric character (not a dash)
Any worker types not matching this pattern will no longer function as of this version.

This is considered a minor change because no known workerTypes (aside from some
internal testing workerTypes) violate this pattern.

[minor] ([bug 1572764](http://bugzil.la/1572764)) The go client doesn't log the full request in case of an error anymore.
It logs only the method, hostname, port and response body. It logs the
full request when the environment variable `TASKCLUSTER_DEBUG` is
defined.

[minor] ([#1190](https://github.com/taskcluster/taskcluster/issues/1190)) Updates a number of config variables including:

* Setting `pulse-namespace` per service is no longer supported
* Services that no longer use aws directly no longer take credentials
* Setting table names for secrets, notify, and hooks services is no longer supported

The name of the hooks last fires table has changed so you must update your static
client scopes in your deployment from including `auth:azure-table:read-write:${azureAccountId}/LastFire`
to `auth:azure-table:read-write:${azureAccountId}/LastFire3`.

## v16.0.0

[MAJOR] ([bug 1552970](http://bugzil.la/1552970)) The `auth.gcpCredentials` method no longer modifies the *granting* service account.
Instead, that service account must be configured with the "Service Account Token Creator" role prior to deployment of Taskcluster.
The format of configuration for these credentials has changed as well, now taking `GCP_CREDENTIALS_ALLOWED_PROJECTS`.
See the deployment documentation for more information.

[MAJOR] ([bug 1570723](http://bugzil.la/1570723)) The deployment configuration value `ui.ui_login_strategy_names` is now required.
It should be a space-separated list of the names of the strategies in `web_server.ui_login_strategies`.

[minor] ([#1140](https://github.com/taskcluster/taskcluster/issues/1140)) Add Chain of Trust documentation for taskcluster worker implementations and maintenance.

[minor] ([#1062](https://github.com/taskcluster/taskcluster/issues/1062)) The taskcluster cli `rerun` action now takes a `--force` option. It will refuse to rerun non-exception, non-failed tasks without `--force`.

([#1108](https://github.com/taskcluster/taskcluster/issues/1108)) The development process has been improved to use kubectl directly instead of helm.
Helm is still used to render templates because we need to support it.

## v15.0.0

[MAJOR] The web-server application no longer generates a JWT when logging in. It uses sessions to keep track of users.
The `JWT_KEY` configuration variable in web-server should be replaced with `SESSION_SECRET` which is used to compute
the session hash.

[MAJOR] ([#1005](https://github.com/taskcluster/taskcluster/issues/1005)) There is now a checked-in helm chart in `infrastructure/k8s`. Using this anyone should
be able to deploy taskcluster by just setting up the configuration.

To facilitate this, some environment variables for configuring services have changed:

* All services now take `AZURE_ACCOUNT_ID` instead of `AZURE_ACCOUNT` or `AZURE_ACCOUNT_NAME`
* Hooks takes `AZURE_CRYPTO_KEY` and `AZURE_SIGNING_KEY` instead of `TABLE_CRYPTO_KEY` and `TABLE_SIGNING_KEY`

[minor] ([#1084](https://github.com/taskcluster/taskcluster/issues/1084)) The Dockerfile for the Taskcluster services is now checked-in rather than
generated at build time. It has been reordered so that changes to things
other than package.json won't re-install packages.

## v14.3.1

Include generated APIs in python package.

## v14.3.0

[minor] Pulse messages now include a task's tags for better classification of the messages that are received.

[minor] ([bug 1563545](http://bugzil.la/1563545)) The `apiMethod` log structure has been updated so that it now splits out query params into their own field and only logs the useful part of paths for resources.

[minor] ([bug 1558345](http://bugzil.la/1558345)) The experimental `workerManager.credentialsGoogle` API method has been removed and replaced with a similar but more provider-agnostic `workerManager.registerWorker` method.

[minor] ([bug 1523807](http://bugzil.la/1523807)) The taskcluster command-line interface (taskcluster-cli) has been incorporated into the main repository and will be relased with the same version numbers as the Taskcluster services.

[minor] The web-server application now uses CORS headers to limit access to the `/graphql` and `/subscription` endpoints to requests from the root URL origin.
An additional, optional configuration value, `ADDITIONAL_ALLOWED_CORS_ORIGIN`, provides a way to allow additional origins.
If it begins and ends with `/`, it is treated as a regular expression, allowing matching e.g., pull-request draft deployments.

[minor] What was previously the `/worker-pools-errors/:workerPoolId` API route is now spelled `/worker-pool-errors/:workerPoolId`.
This endpoint is still experimental so while this might someday be a breaking change, it is currently considered minor.

[minor] ([bug 1563341](http://bugzil.la/1563341)) Worker-manager now allows getting workers by worker group and singly by worker ID, and creating and removing workers (for some providers).
The static provider uses this capability to manage static workers, each authoritatively identified by a shared secret.

([bug 1547077](http://bugzil.la/1547077)) Emails now use the modern Taskcluster logo

The `GRAPHQL_SUBSCRIPTION_ENDPOINT` config for taskcluster-ui can now have scheme `http` or `https` instead of `ws`/`wss`.
This allows easier generation of this configuration as `${TASKCLUSTER_ROOT_URL}/subscription`.
The existing schemas are still accepted so no configuration change is required.

With the proper scopes, github repositories can now override the default scheduler. Adding custom schedulerId to the task definition while using github's Statuses API might break the status reporting functionality of tc-github in the case of successful build. Therefore, this only works with experimental `checks` status reporting.

## v14.2.0

[minor] The AWS Provisioner and Provisioner views are no longer available, as the AWS provisioner itself will be removed in favor of the worker manager service.

[minor] ([bug 1560649](http://bugzil.la/1560649)) The Go client is now hosted in the repository together with the services and other clients, and co-versioned with them.
See [the docs](https://github.com/taskcluster/taskcluster/tree/master/clients/client-go#readme).

[minor] ([bug 1559471](http://bugzil.la/1559471)) The web-server configuration for sign-in now requires a single JWT HS256 key (`JWT_KEY`) instead of a public/private key (`JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`).

Changes are now recorded in the CHANGELOG.md file.

([bug 1547729](http://bugzil.la/1547729)) Hook fire attempts are now logged using structured logging, including when a hook "declines" to create a task.

([bug 1556526](http://bugzil.la/1556526)) The `workerManager.updateWorkerType` API method now allows extra fields such as `lastModified`, making read-modify-write usages easier to implement.

The search box in the log viewer now searches on enter.

The task group inspector now shows the full task name.

([bug 1558346](http://bugzil.la/1558346)) Workers can now report errors directly to the worker manager for display in the worker-manager UI.

## Older Releases

Changes were not tracked for older releases of Taskcluster
