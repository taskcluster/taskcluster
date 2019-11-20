# Change Log

<!-- `yarn release` will insert the existing changelog snippets here: -->
<!-- NEXT RELEASE HERE -->

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
