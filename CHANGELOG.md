# Change Log

<!-- `yarn release` will insert the existing changelog snippets here: -->
<!-- NEXT RELEASE HERE -->

## v94.1.1



### Automated Package Updates

<details>
<summary>1 Dependabot updates</summary>

* build(deps): bump jws from 3.2.2 to 3.2.3 (da9d202243)

</details>

## v94.1.0

### GENERAL

▶ [patch]
Client (python): upgrades many dependencies to latest minor/patch releases using `uv lock --upgrade`.

▶ [patch]
Upgrades to Node.js v24.11.1 and rust v1.91.1. Additionally upgrades yarn to 4.12.0.

Replaces `backoff` crate with `backon` due to https://rustsec.org/advisories/RUSTSEC-2025-0012

▶ [patch]
Upgrades to go1.25.5 [SECURITY].

See more [here](https://go.dev/doc/devel/release#go1.25.5).

### WORKER-DEPLOYERS

▶ [patch] [#8115](https://github.com/taskcluster/taskcluster/issues/8115)
Generic Worker (windows): reverts #8030 to use `CREATE_NEW_CONSOLE` over `CREATE_NO_WINDOW` so that child processes can call `AllocConsole()` to create new consoles.

### DEVELOPERS

▶ [minor] [#8093](https://github.com/taskcluster/taskcluster/issues/8093)
Github webhook endpoint returns 200 instead of 400 for unsupported events. 200 means we received and processed webhook,
even if we don't actually support such event at the moment. 400 is only for validation issues.

### Automated Package Updates

<details>
<summary>8 Dependabot updates</summary>

* build(deps): bump the go-deps group with 2 updates (a50efca685)
* build(deps): bump the client-node-deps group (c70a6f6bc1)
* build(deps-dev): bump eslint (c39ca3d277)
* build(deps): bump tokio-util (e1a85b8485)
* build(deps): bump actions/checkout from 5 to 6 (4d2553a4dd)
* build(deps): bump express from 4.21.2 to 4.22.0 (d638d580a4)
* build(deps): bump express from 4.21.0 to 4.22.0 in /ui (7de97b46b7)
* build(deps): bump node-forge from 1.3.1 to 1.3.2 (63ffe5deaa)

</details>

## v94.0.1

### WORKER-DEPLOYERS

▶ [patch]
Fixes errors handling for upgraded googleapis packages. Instance creation errors were sent differently,
which didn't allow to log some provision exceptions.

## v94.0.0

### WORKER-DEPLOYERS

▶ [patch]
Azure provider logs additional error details for failed ARM deployments.

### USERS

▶ [MAJOR] [#7765](https://github.com/taskcluster/taskcluster/issues/7765)
Spaces in artifact names are now correctly preserved instead of being replaced with `+`

▶ [MAJOR]
Increase the buffer size of websocktunnel on the worker side to make livelogs a lot faster.

This is a breaking change, since the pre-v94 Websock Tunnel service will no longer work with newer (v94+) clients (workers). However, older clients (pre-v94 workers) will continue to work with the new Websock Tunnel service.

IMPORTANT: Therefore, it is imperative, that the Websock Tunnel service should be updated to v94+ before any clients (workers) are updated to v94+.

▶ [patch] [#7829](https://github.com/taskcluster/taskcluster/issues/7829)
Fix a bug that prevented all-resolved tasks from getting scheduled if they
depended on a task that was also part of an all-completed dependency and that
all-completed task was processed before the all-resolved one

▶ [patch] [#8121](https://github.com/taskcluster/taskcluster/issues/8121)
The taskcluster CLI now encodes URL path parameters as path parametes rather than as query string parameters.

### Automated Package Updates

<details>
<summary>2 Dependabot updates</summary>

* build(deps): bump golang.org/x/crypto from 0.43.0 to 0.45.0 (2e133883c1)
* build(deps): bump glob from 10.4.5 to 10.5.0 in /clients/client (3192cf9895)

</details>

## v93.1.5

### GENERAL

▶ [patch] [#8102](https://github.com/taskcluster/taskcluster/issues/8102)
Don't try to chown caches when using d2g as this is a long no-op anyway

### USERS

▶ [patch]
Make livelogs faster when passing through websocktunnel by increasing the buffer size on the proxy

## v93.1.4

### WORKER-DEPLOYERS

▶ [patch]
Worker-manager improves handling of workers created for ARM deployment that failed validation step

▶ [patch] [#8083](https://github.com/taskcluster/taskcluster/issues/8083)
Generic Worker (windows): adds retry logic around `CreateUserProfile` method to ensure the task user's profile path is created successfully before continuing on to `LoadUserProfile`.

### Automated Package Updates

<details>
<summary>2 Dependabot updates</summary>

* build(deps): bump js-yaml from 4.1.0 to 4.1.1 in /clients/client (afd0340c8d)
* build(deps): bump js-yaml from 4.1.0 to 4.1.1 in /clients/client-web (3bcf9fe500)

</details>

## v93.1.3

### DEPLOYERS

▶ [patch]
Worker registration metrics exposed from all relevant pods.

### Automated Package Updates

<details>
<summary>2 Dependabot updates</summary>

* build(deps): bump js-yaml from 4.1.0 to 4.1.1 in /ui (38a6032881)
* build(deps): bump js-yaml from 4.1.0 to 4.1.1 (b5eed40995)

</details>

## v93.1.2

### DEPLOYERS

▶ [patch] [#8086](https://github.com/taskcluster/taskcluster/issues/8086)
Worker-manager Azure ARM deployment fix for stuck worker in removal/stopping loop, better descriptions in reported errors.

### WORKER-DEPLOYERS

▶ [patch] [#8083](https://github.com/taskcluster/taskcluster/issues/8083)
Generic Worker (windows): fixes intermittent issue calling `LoadUserProfile` win32 API when the device isn't ready.

### USERS

▶ [patch] [#8082](https://github.com/taskcluster/taskcluster/issues/8082)
Relax GitHub webhook identifier regex to accept [bot] senders.

## v93.1.1

### DEPLOYERS

▶ [patch]
Worker-manager web services exposes metrics now.

### WORKER-DEPLOYERS

▶ [patch] [#8079](https://github.com/taskcluster/taskcluster/issues/8079)
Generic Worker: logs artifact upload status to worker logs instead of the task log, unless there was an error uploading.

## v93.1.0

### WORKER-DEPLOYERS

▶ [minor]
Worker-manager adds extra Prometheus metrics for worker registration timing:
`worker_manager_worker_registration_seconds` - time from being requested to registered (running)
`worker_manager_worker_lifetime_seconds` - total lifetime of a worker (until stopped or removed)
`worker_manager_worker_registration_failures_total` - count of workers that were removed before register

▶ [patch] [#8077](https://github.com/taskcluster/taskcluster/issues/8077)
Azure provider reports ARM template deployments errors on the worker pool level.
When deployment fails and one or more resources were not created, errors were hidden in operations list,
which made it difficult to debug.

### USERS

▶ [patch] [#8075](https://github.com/taskcluster/taskcluster/issues/8075)
Web-server improves graphql validation

## v93.0.0

### GENERAL

▶ [MAJOR] [#7965](https://github.com/taskcluster/taskcluster/issues/7965)
GitHub service now validates webhook payloads against a schema to prevent TypeErrors from missing or malformed fields. This ensures that webhook handlers receive properly structured data, the webhook now returns a 400 status and does not create an unprocessable event.

The `githubWebHookConsumer` endpoint has been removed from client libraries as it was not intended for client use (only for GitHub webhook integrations).

▶ [minor] [#8068](https://github.com/taskcluster/taskcluster/issues/8068)
Client (python): adds python 3.9 support back due to Taskgraph still needing to support it.

▶ [patch]
Upgrades to go1.25.4

## v92.0.2



### OTHER

▶ Additional change not described here: [#8065](https://github.com/taskcluster/taskcluster/issues/8065).

## v92.0.1

### GENERAL

▶ [patch] [#8061](https://github.com/taskcluster/taskcluster/issues/8061)
Updates the python client's `uv.lock` file to properly bump the `taskcluster` version on `yarn release`.

### OTHER

▶ Additional change not described here: [#8061](https://github.com/taskcluster/taskcluster/issues/8061).

## v92.0.0

### GENERAL

▶ [MAJOR]
Client (python): Removes python 3.9 support. Adds support/testing for python 3.14.

### DEPLOYERS

▶ [patch] [#8059](https://github.com/taskcluster/taskcluster/issues/8059)
Azure provider improves handling of ARM template deployments removal to avoid some conflicts that may happen when resources are being removed too fast.

### WORKER-DEPLOYERS

▶ [patch]
Generic Worker (Windows): properly logs out `win32.LoadUserProfile()` errors with the user's `syscall.Token` in hex format instead of a quoted string.

### DEVELOPERS

▶ [MAJOR] [#8010](https://github.com/taskcluster/taskcluster/issues/8010)
Client (python): doesn't follow redirects for both the sync and async python clients.

### Automated Package Updates

<details>
<summary>5 Dependabot updates</summary>

* build(deps): bump github/codeql-action from 3 to 4 (4d1d9d9924)
* build(deps): bump the client-rust-deps group (b6bd0d0659)
* build(deps): bump the go-deps group with 6 updates (74396e3bb7)
* build(deps-dev): bump the client-web-node-deps group (9a15c50b37)
* build(deps): bump the client-node-deps group (f067e558ac)

</details>

## v91.1.2

### GENERAL

▶ [patch]
Upgrades to Node.js v24.11.0

### DEPLOYERS

▶ [patch]
Worker-scanner azure now exposes metrics to prometheus too.

### DEVELOPERS

▶ [patch] [#8042](https://github.com/taskcluster/taskcluster/issues/8042)
DB adds primary key to the tcversion table

▶ [patch] [#7376](https://github.com/taskcluster/taskcluster/issues/7376)
Check-in the initial code for generating Firefox Profiler profiles for task logs and
task groups.

### Automated Package Updates

<details>
<summary>1 Dependabot updates</summary>

* build(deps): bump @messageformat/runtime from 3.0.1 to 3.0.2 (6b40347a05)

</details>

## v91.1.1

### GENERAL

▶ [patch]
Upgrades to Node.js latest LTS, v24.10.0

### WORKER-DEPLOYERS

▶ [patch] [#8012](https://github.com/taskcluster/taskcluster/issues/8012)
Generic Worker (windows): creates no `cmd.exe` window that appeared during task execution.

▶ [patch]
Worker Runner now doesn't allow workers to be bootstrapped with zip files containing the Zip Slip vulnerability.

### USERS

▶ [patch]
Fixes documentation typos and links

### DEVELOPERS

▶ [patch]
Replace minio with localstack for local development

## v91.1.0

### WORKER-DEPLOYERS

▶ [minor] [#7979](https://github.com/taskcluster/taskcluster/issues/7979)
Azure worker pools can now provision via ARM templates in launch configs,
reducing provisioning latency and letting Azure cascade resource creation/cleanup automatically.

▶ [patch] [#7979](https://github.com/taskcluster/taskcluster/issues/7979)
Azure ARM template deployments allow keeping history for debug purposes by using `workerManager.keepDeployment: true`

▶ [patch] [#8023](https://github.com/taskcluster/taskcluster/issues/8023)
Generic Worker: limits concurrent artifact uploads to 100 at a time.

### USERS

▶ [patch] [#8031](https://github.com/taskcluster/taskcluster/issues/8031)
GitHub service handles missing users (404 from getByUsername) when processing webhooks.

▶ [patch] [bug 1990567](http://bugzil.la/1990567)
Python client exceptions are now picklable.

## v91.0.4

### DEVELOPERS

▶ [patch]
Client (python): fixes release of client. v91.0.3 did not work in fixing.

## v91.0.3

### DEVELOPERS

▶ [patch]
Client (python): fixes release of client.

## v91.0.2

### WORKER-DEPLOYERS

▶ [patch] [#8025](https://github.com/taskcluster/taskcluster/issues/8025)
Generic Worker (macOS): updates the socket-based communication between the LaunchAgent and LaunchDaemon to handle any size of payload.

### DEVELOPERS

▶ [patch] [#8020](https://github.com/taskcluster/taskcluster/issues/8020)
Client (python): declares what python versions are supported. Moves to modern standards with `pyproject.toml` and `uv` usage.

## v91.0.1

### GENERAL

▶ [patch]
Switches CI tasks to use `uv` tool and to the latest stable Debian release (`trixie`).

▶ [patch]
Upgrades to taskgraph v16.2.1

### WORKER-DEPLOYERS

▶ [patch]
Improves Azure resource deprovisioning by skipping checks on already deleted resources.
Previously implemented logic was flawed in a way that same resources would be queried over and over.
Which led to an increased number of cloud api calls and was likely causing some minor delays per each worker being deprovisioned

## v91.0.0

### GENERAL

▶ [patch]
Upgrades to go1.25.3

### DEVELOPERS

▶ [MAJOR] [#8010](https://github.com/taskcluster/taskcluster/issues/8010)
Python client follows redirects in artifact download for both async and sync code.
This was partially fixed in the past in #4057

## v90.0.5

### GENERAL

▶ [patch]
Upgrades to Node.js v22.20.0, go1.25.2 [SECURITY], yarn 4.10.3, and golangci-lint 4.5.0.

### USERS

▶ [patch] [#8004](https://github.com/taskcluster/taskcluster/issues/8004)
D2G: always pulls named docker images to fetch latest tag.

### Automated Package Updates

<details>
<summary>9 Dependabot updates</summary>

* build(deps): bump taskcluster from 88.0.5 to 90.0.4 in /taskcluster (ef55684a67)
* build(deps): bump taskcluster-taskgraph in /taskcluster (e77e96731f)
* build(deps): bump the client-rust-deps group (ef66adc8d6)
* build(deps): bump pyyaml in /taskcluster in the python-deps group (e107bc2cd5)
* build(deps): bump the go-deps group with 9 updates (a42d2e1b63)
* build(deps-dev): bump the client-web-node-deps group (a800bf4397)
* build(deps): bump the client-node-deps group (d828bb8ffd)
* build(deps): bump actions/checkout from 4 to 5 (0a6c085f71)
* build(deps): bump actions/setup-go from 5 to 6 (5b7aa019ff)

</details>

## v90.0.4

### USERS

▶ [patch] [bug 1990389](http://bugzil.la/1990389)
D2G: add stderr logging if any docker commands fail within the task feature.

▶ [patch] [#7974](https://github.com/taskcluster/taskcluster/issues/7974)
D2G: fixes `docker: invalid env file (env.list): bufio.Scanner: token too long` error when providing the `docker run` command an `--env-file` that contains a line longer than 64KiB. D2G now passes the variable directly to the run command with `-e <envVarName>=<envVarValue>` to work around this constraint.

▶ [patch]
D2G: removes exit codes 125, 128 from `payload.onExitStatus.retry` array, as docker pulls now happen outside of the payload being run (inside the D2G task feature startup).

## v90.0.3

### USERS

▶ [patch] [#7969](https://github.com/taskcluster/taskcluster/issues/7969)
D2G: fixes issue with loading the docker image artifact if the image already exists with a separate ID, causing the following output to be improperly parsed by D2G: `The image <imageName> already exists, renaming the old one with ID <sha> to empty string`.

## v90.0.2

### USERS

▶ [patch] [#7967](https://github.com/taskcluster/taskcluster/issues/7967)
D2G: accounts for image artifacts that may contain multiple tags for the same image, previously causing a worker error: `runtime error: index out of range [1] with length 1`.

## v90.0.1

### GENERAL

▶ [patch]
D2G: creates a `Config` struct type for D2G-specific config used in the repo.

### USERS

▶ [patch]
D2G: remove call out to bash shell that ran the `docker run` command. Directly call `docker` as the resulting Generic Worker payload command.

## v90.0.0

### DEPLOYERS

▶ [patch] [#7942](https://github.com/taskcluster/taskcluster/issues/7942)
New metrics are being exposed to prometheus for scraping:
- `http_requests_total` http requests per service/method/name
- `http_request_duration_seconds` http request duration histogram
- `auth_success_total` successful authentication attempt per clientId and scheme
- `auth_failure_total` failed authentication attempts and reasons

Existing queue metrics `queue_failed_tasks`, `queue_exception_tasks` now includes `reasonResolved` label

### WORKER-DEPLOYERS

▶ [MAJOR] [#7947](https://github.com/taskcluster/taskcluster/issues/7947)
Generic Worker (Windows): Windows/386 platform is now unsupported and no longer built/released. Windows arm64 support has been added as a Tier-2 platform (guaranteeing to build).

### USERS

▶ [patch]
D2G: remove call out to bash during garbage collection of docker images

### OTHER

▶ Additional change not described here: [#7942](https://github.com/taskcluster/taskcluster/issues/7942).

## v89.0.0

### USERS

▶ [MAJOR]
The `dind` and `dockerSave` features are no longer supported in docker-worker
payloads (whether in docker-worker itself or in generic-worker via D2G).  Tasks
requesting those features will fail with an exception.

▶ [patch] [#7605](https://github.com/taskcluster/taskcluster/issues/7605)
Fixes duplicate tasks shown in claimed tasks list. This can happen when task is being reclaimed
and multiple entries might still exist in queue_claimed_tasks table

▶ [patch]
D2G: don't write env vars out to Generic Worker's environment. Instead, pass them as `-e <name>=<value>`. Follow-up to https://github.com/taskcluster/taskcluster/pull/7945#discussion_r2348906304.

▶ [patch] [#7938](https://github.com/taskcluster/taskcluster/issues/7938)
D2G: pass Docker Worker environment variables to container using `--env-file` in `docker run` command.

▶ [patch]
D2G: remove calls out to bash shells to load docker image and create chain of trust additional data file.

### DEVELOPERS

▶ [patch] [#7500](https://github.com/taskcluster/taskcluster/issues/7500)
Github build is marked as failed after there are no retries left, instead of staying "neutral"

### Automated Package Updates

<details>
<summary>1 Dependabot updates</summary>

* build(deps): bump axios from 1.11.0 to 1.12.1 (472e669404)

</details>

## v88.1.3

### WORKER-DEPLOYERS

▶ [patch]
Worker Runner (Windows): capture Generic Worker service exit code and exit early if the worker is rebooting, preventing a Worker Manager `removeWorker` API call.

## v88.1.2

### GENERAL

▶ [patch]
Upgrades to Node.js 22.19.0, go1.25.1, and yarn 4.9.4.

### WORKER-DEPLOYERS

▶ [patch]
Worker Runner: adds additional logging around sending `graceful-termination` request to worker.

Worker Runner (windows): fixes protocol pipe connection so that Generic Worker can communicate with Worker Runner. This allows `graceful-termination` requests to be properly sent and received, among other message types. You must include `--with-worker-runner` in your Generic Worker service configuration on the `run` subcommand.

## v88.1.1

### GENERAL

▶ [patch]
Bumps `github.com/ulikunitz/xz` from v0.5.14 to v0.5.15 to fix our release process. v88.1.0 was broken due to https://github.com/ulikunitz/xz/issues/65.

## v88.1.0

### WORKER-DEPLOYERS

▶ [minor] [#7918](https://github.com/taskcluster/taskcluster/issues/7918)
Worker-manager updates launch config when only "workerManager" part is updated,
to make sure dynamic properties like `publicIp`, `capacityPerInstance` or `maxCapacity` are being updated

### USERS

▶ [patch] [#7796](https://github.com/taskcluster/taskcluster/issues/7796)
UI data loading optimizations for hooks page - first screen only show hook groups, and the second one shows all hooks for a given hook group.
This way we avoid loading and displaying all possible hooks on a single page.

▶ [patch] [#7928](https://github.com/taskcluster/taskcluster/issues/7928)
UI data loading optimizations on worker pools page.

### DEVELOPERS

▶ [minor] [#5265](https://github.com/taskcluster/taskcluster/issues/5265)
Removed neutrino. The UI now uses webpack/jest directly

### Automated Package Updates

<details>
<summary>5 Dependabot updates</summary>

* build(deps): bump github.com/ulikunitz/xz from 0.5.12 to 0.5.14 (b781871e53)
* build(deps): bump cipher-base from 1.0.4 to 1.0.6 in /clients/client-web (089f8b2128)
* build(deps): bump sha.js from 2.4.11 to 2.4.12 in /ui (4ea4a70e71)
* build(deps): bump sha.js from 2.4.11 to 2.4.12 in /clients/client-web (7e50b237fc)
* build(deps): bump cipher-base from 1.0.4 to 1.0.6 in /ui (5e44e35dca)

</details>

## v88.0.5

### GENERAL

▶ [patch]
Reverts taskcluster/taskcluster#7920 due to https://github.com/google/go-containerregistry/issues/2072 which broke release v88.0.4.

## v88.0.4

### GENERAL

▶ [patch]
Upgrades to go1.25.0.

### WORKER-DEPLOYERS

▶ [patch]
Worker Runner/Generic Worker (Azure): polls the metadata service for events the worker should gracefully terminate on every second (down from 15s). This frequency is recommended by Microsoft [here](https://learn.microsoft.com/en-us/azure/virtual-machines/windows/scheduled-events#polling-frequency) and will hopefully reduce tasks resolving as `claim-expired`.

### Automated Package Updates

<details>
<summary>1 Dependabot updates</summary>

* build(deps): bump github.com/docker/docker (b106d595e3)

</details>

## v88.0.3

### GENERAL

▶ [patch]
Upgrades to Node.js v22.18.0 and go1.24.6 [SECURITY].

▶ [patch] [#7903](https://github.com/taskcluster/taskcluster/issues/7903)
Worker Manager (Azure): uses `Standard` SKU public IP addresses, as `Basic` will be retired on September 30, 2025. [Official announcement](https://azure.microsoft.com/en-us/updates?id=upgrade-to-standard-sku-public-ip-addresses-in-azure-by-30-september-2025-basic-sku-will-be-retired)

▶ [patch] [#7914](https://github.com/taskcluster/taskcluster/issues/7914)
Worker Manager (Azure): uses `Static` public IP allocation with the `Standard` SKU.

### WORKER-DEPLOYERS

▶ [patch] [#7905](https://github.com/taskcluster/taskcluster/issues/7905)
Generic Worker launch agent on macOS for multiuser engine was crashing due to a bug in the launch daemon that was garbage collecting file handles while the agent was using them. This resulted in the launch agent crashing. This has been fixed by keeping file handles alive in the daemon.

### Automated Package Updates

<details>
<summary>7 Dependabot updates</summary>

* build(deps-dev): bump eslint (a58d067a5e)
* build(deps): bump the python-deps group in /taskcluster with 2 updates (0e24bd2ac3)
* build(deps): bump tmp from 0.2.1 to 0.2.5 in /ui/test/e2e (ed9d0409c2)
* build(deps): bump the client-rust-deps group across 1 directory with 3 updates (30b03ebaf3)
* build(deps): bump the go-deps group across 1 directory with 6 updates (35817ce475)
* build(deps): bump the node-deps group across 1 directory with 11 updates (7b5b1c43e0)
* build(deps): bump tmp from 0.2.1 to 0.2.4 in /clients/client-web (cdb41112c0)

</details>

## v88.0.2

### GENERAL

▶ [patch]
UI: use `@taskcluster/client-web` package.

▶ [patch] [#7680](https://github.com/taskcluster/taskcluster/issues/7680)
Worker Manager (AWS): terminates workers that are in the stopped state.

### OTHER

▶ Additional change not described here: [#6854](https://github.com/taskcluster/taskcluster/issues/6854).

### Automated Package Updates

<details>
<summary>3 Dependabot updates</summary>

* build(deps): bump axios from 1.10.0 to 1.11.0 (8cdc1849b7)
* build(deps): bump taskcluster from 86.0.2 to 87.1.3 in /taskcluster (eca9d426f6)
* build(deps-dev): bump aws-sdk-client-mock from 3.1.0 to 4.1.0 (8a8b006c81)

</details>

## v88.0.1

### GENERAL

▶ [patch]
Fix releases of `@taskcluser/client` and `@taskcluster/client-web` by making their access public by default.

### Automated Package Updates

<details>
<summary>5 Dependabot updates</summary>

* build(deps): bump the node-deps group with 11 updates (5b4dda73b8)
* build(deps): bump the go-deps group with 5 updates (a725a57f99)
* build(deps-dev): bump the client-web-node-deps group (af59ea099e)
* build(deps): bump the client-rust-deps group (586d3f5ecb)
* build(deps): bump dominikh/staticcheck-action (c285fbb710)

</details>

## v88.0.0

### GENERAL

▶ [MAJOR] [#7854](https://github.com/taskcluster/taskcluster/issues/7854)
Renames all Node packages to be in the `@taskcluster` scope.

 * `taskcluster-client` --> `@taskcluster/client`
 * `taskcluster-client-web` --> `@taskcluster/client-web`

## v87.1.3

### USERS

▶ [patch] [#7719](https://github.com/taskcluster/taskcluster/issues/7719)
Expired secrets leave an audit event/record.

▶ [patch]
Fixes UI actions form that was broken with the last refactoring.

### Automated Package Updates

<details>
<summary>2 Dependabot updates</summary>

* build(deps): bump form-data from 3.0.1 to 3.0.4 in /ui (c313008655)
* build(deps): bump golang.org/x/oauth2 from 0.26.0 to 0.27.0 (2927b91eba)

</details>

## v87.1.2

### GENERAL

▶ [patch] [#7861](https://github.com/taskcluster/taskcluster/issues/7861)
Generic Worker (D2G): fixes docker image caching issue when the worker loaded different images with the same image name, overwriting the previously loaded docker image.

▶ [patch] [#7863](https://github.com/taskcluster/taskcluster/issues/7863)
Generic Worker (D2G): reloads cache on d2g task feature start to fix `Unable to find image '<image>' locally` issue due to garbage collection running between tasks and pruning all docker images.

### USERS

▶ [patch] [#7844](https://github.com/taskcluster/taskcluster/issues/7844)
Worker Manager: bumps Azure SDKs to use latest API versions in order to deploy v6 SKUs.

## v87.1.1

### GENERAL

▶ [patch] [#7849](https://github.com/taskcluster/taskcluster/issues/7849)
Generic Worker (D2G): caches loaded docker images.

▶ [patch]
Upgrades decision task to v14.4.1, rust toolchain to 1.88.0, and golangci-lint version to 2.2.2.

▶ [patch]
Upgrades to Node.js v22.17.1 [SECURITY].

https://nodejs.org/en/blog/vulnerability/july-2025-security-releases

### USERS

▶ [patch] [#7856](https://github.com/taskcluster/taskcluster/issues/7856)
Fixes `queue.taskQueueCounts()` numbers for the total claimed tasks.
Due to the internal structure some task/runs might have had duplicate entries in the `queue_claimed_tasks` table
which led to slightly higher counts returned by `queue_claimed_tasks_count(taskQueue)` function.

### Automated Package Updates

<details>
<summary>1 Dependabot updates</summary>

* build(deps): bump aiohttp from 3.10.2 to 3.12.14 in /taskcluster (433a83c71c)

</details>

## v87.1.0

### WORKER-DEPLOYERS

▶ [minor] [#7840](https://github.com/taskcluster/taskcluster/issues/7840)
Generic Worker: adds `status` subcommand to output task ID if a task is currently being executed.

Example output while a task is running:

```bash
$ generic-worker status
{
  "currentTaskIds": [
    "fz7IO4uCTtevuLBoq8Qz3w"
  ]
}
```

Example output while worker is idle:

```bash
$ generic-worker status
{
  "currentTaskIds": []
}
```

### USERS

▶ [patch] [#7842](https://github.com/taskcluster/taskcluster/issues/7842)
The `task-running` event now includes `task.tags`, consistent with other lifecycle events.

▶ [patch] [#7846](https://github.com/taskcluster/taskcluster/issues/7846)
UI: properly handle Worker Pool config changes and enable/disable `Save Worker Pool` button dynamically.

▶ [patch] [#7842](https://github.com/taskcluster/taskcluster/issues/7842)
task-pending and task-exception pulse message now consistently include the task's tags.

### DEVELOPERS

▶ [patch] [#7833](https://github.com/taskcluster/taskcluster/issues/7833)
Node deprecated `url.parse` in favor of `URL.parse()`

## v87.0.0

### GENERAL

▶ [patch]
Upgrades to Node.js 22.17.0 and yarn 4.9.2

▶ [patch]
Upgrades to go1.24.5 [SECURITY].

Go release notes [here](https://go.dev/doc/devel/release#go1.24.5).

### USERS

▶ [MAJOR]
Client (python): Drops python 3.8 support, adds support and tests for 3.12 and 3.13.

### Automated Package Updates

<details>
<summary>8 Dependabot updates</summary>

* build(deps-dev): bump mocha from 10.8.2 to 11.7.1 in /clients/client (1853c97ab3)
* build(deps-dev): bump open-editor from 3.0.0 to 5.1.0 (114a914b6a)
* build(deps): bump the node-deps group with 14 updates (1ea24128f8)
* build(deps): bump the client-rust-deps group (e4e55a9e9d)
* build(deps-dev): bump the client-web-node-deps group (bb9b1dcb61)
* build(deps): bump taskcluster-taskgraph (ebeaba0a9f)
* build(deps): bump taskcluster from 84.0.2 to 86.0.2 in /taskcluster (bf2b5c068e)
* build(deps): bump the go-deps group with 6 updates (5e14931dc2)

</details>

## v86.0.2

### WORKER-DEPLOYERS

▶ [patch]
Generic Worker: prefer `strconv.ParseUint()` over `strconv.Atoi()` when resulting int is converted to an int type of smaller size to prevent unexpected values.

### USERS

▶ [patch] [#6951](https://github.com/taskcluster/taskcluster/issues/6951)
Fixes UI issue with state when tasks change. Sometimes actions could be fired against wrong task group.

▶ [patch]
Generic Worker multiuser on macOS now ensures finalisers are not called on
launch agent pipes while they are still in use.

## v86.0.1

### WORKER-DEPLOYERS

▶ [patch]
Generic Worker: Fix for intermittent "sendmsg: bad file descriptor" on macOS multiuser.

## v86.0.0

### USERS

▶ [MAJOR] [#7356](https://github.com/taskcluster/taskcluster/issues/7356)
Generic Worker multiuser engine on macOS now executes all task commands via a
Launch Agent running in the context of the desktop session. This means that
task commands now have full access to desktop session services, such as the
clipboard.

# Deployment Instructions - macOS

On macOS it is *essential* that after updating the generic-worker binary,
before starting the worker up, that the file `next-task-user.json` is deleted.
This file should only be deleted when upgrading the worker, not every time the
worker runs. This will cause Generic Worker to create new task users, which is
needed for the launch agent to work. Otherwise the new Generic Worker would try
to use task users created by the old Generic Worker user, which would not work.
Note, the full path to this file can be seen in the generic worker logs, if you
are not sure where to find it on the file system.

Note, this only needs to be done once when installing the new version of
Generic Worker. After that, Generic Worker will continue to mange this file
itself as normal.

### Automated Package Updates

<details>
<summary>4 Dependabot updates</summary>

* build(deps): bump newrelic from 7.5.2 to 12.20.0 (80c25f9efb)
* build(deps): bump pbkdf2 from 3.1.2 to 3.1.3 in /clients/client-web (790be611e0)
* build(deps): bump pbkdf2 from 3.1.2 to 3.1.3 in /ui (7a87b74d2a)
* build(deps): bump urllib3 from 2.2.2 to 2.5.0 in /taskcluster (32210df987)

</details>

## v85.0.1

### WORKER-DEPLOYERS

▶ [patch] [#7789](https://github.com/taskcluster/taskcluster/issues/7789)
Generic Worker: Artifact uploads properly fail on 4xx status codes. Issue first noticed in v84.1.1

### USERS

▶ [patch] [#7786](https://github.com/taskcluster/taskcluster/issues/7786)
Github service comments back when taskcluster command in issue comment didn't produce any tasks

▶ [patch] [bug 1559766](http://bugzil.la/1559766)
d2g adds `localhost.localdomain` to /etc/hosts

## v85.0.0

### WORKER-DEPLOYERS

▶ [MAJOR]
Generic Worker: renamed the following worker configuration options to avoid confusion:

  * `absoluteHighMemoryThreshold` --> `minAvailableMemoryBytes`
  * `relativeHighMemoryThreshold` --> `maxMemoryUsagePercent`

## v84.2.1

### USERS

▶ [patch] [#7498](https://github.com/taskcluster/taskcluster/issues/7498)
Further UI memory optimizations for the TaskGroup page to avoid using too much memory during intensive updates.

## v84.2.0

### WORKER-DEPLOYERS

▶ [minor] [#7770](https://github.com/taskcluster/taskcluster/issues/7770)
Generic Worker: adds additional resource monitoring auto-abortion configuration to better fine-tune how your worker aborts running task processes.

  * `absoluteHighMemoryThreshold`: The minimum amount of available memory (in bytes) required before considering task abortion. If available memory drops below this value, it may trigger an abort. Default: `524288000` (500MiB).
  * `relativeHighMemoryThreshold`: The percentage of total system memory usage that, if exceeded, contributes to the decision to abort the task. Default: `90`.
  * `allowedHighMemoryDurationSecs`: The maximum duration (in seconds) that high memory usage conditions can persist before the task is aborted. Default: `5`.

Generic Worker will auto-abort a task if the total system memory used percentage is greater than `relativeHighMemoryThreshold` _AND_ the available memory is less than `absoluteHighMemoryThreshold` for longer than `allowedHighMemoryDurationSecs`, unless `disableOOMProtection` is enabled.

### USERS

▶ [patch] [#7769](https://github.com/taskcluster/taskcluster/issues/7769)
Generic Worker: resource monitor will print out its usage summary after aborting the task.

### Automated Package Updates

<details>
<summary>5 Dependabot updates</summary>

* build(deps): bump brace-expansion from 1.1.11 to 1.1.12 in /ui/test/e2e (9730050be2)
* build(deps): bump brace-expansion from 1.1.11 to 1.1.12 (6298cb2045)
* build(deps): bump brace-expansion from 1.1.11 to 1.1.12 in /ui (f3154fd82e)
* build(deps): bump brace-expansion in /clients/client-web (e1544fb357)
* build(deps): bump github.com/cloudflare/circl from 1.3.8 to 1.6.1 (c8320ed1c1)

</details>

## v84.1.2

### DEPLOYERS

▶ [patch] [#7763](https://github.com/taskcluster/taskcluster/issues/7763)
Helm chart forces metrics-only deployments to have `replicas: 0` if `prometheus.enabled` is `false`

### USERS

▶ [patch] [#7771](https://github.com/taskcluster/taskcluster/issues/7771)
Fixes UI error on TaskGroup page

## v84.1.1

### GENERAL

▶ [patch]
Upgrades to Node.js v22.16.0 and go1.24.4 [SECURITY].

### USERS

▶ [patch] [#7498](https://github.com/taskcluster/taskcluster/issues/7498)
Optimizes UI memory usage for some pages that were caching table data

### OTHER

▶ Additional change not described here: [bug 1971309](http://bugzil.la/1971309).

### Automated Package Updates

<details>
<summary>1 Dependabot updates</summary>

* build(deps): bump requests from 2.32.3 to 2.32.4 in /taskcluster (8c55b3772c)

</details>

## v84.1.0

### GENERAL

▶ [patch] [#7712](https://github.com/taskcluster/taskcluster/issues/7712)
Upgrades to go1.24.3 [SECURITY].

More details [here](https://go.dev/doc/devel/release#go1.24.3).

### DEPLOYERS

▶ [minor] [#7707](https://github.com/taskcluster/taskcluster/issues/7707)
Adds Prometheus metrics support to the monitor via a new plugin. Metrics can now be registered using `MonitorManager.registerMetric()`, similar to log types. When enabled, each configured service and background job starts a separate server on port `9100` to expose metrics for Prometheus scraping.

Example minimal Kubernetes `values.yml` configuration:
```yaml
prometheus:
  enabled: true
  prefix: tc
  server:
    ip: 0.0.0.0
    port: 9100
```

If your cluster does not support the `monitoring.googleapis.com/v1/PodMonitoring` resource, add `"podmonitoring"` to `.skipResourceTypes[]` to prevent deployment failures.

### ADMINS

▶ [minor] [#7646](https://github.com/taskcluster/taskcluster/issues/7646)
The github service will now respect github rate limits instead of hammering against it as fast as it can

### USERS

▶ [patch] [#7757](https://github.com/taskcluster/taskcluster/issues/7757)
Fixed input validation for some queue service endpoints to return a 400 error instead of a 500 error when validation fails.

### DEVELOPERS

▶ [patch] [#7612](https://github.com/taskcluster/taskcluster/issues/7612)
Exposes worker-manager provision loop metrics to prometheus.

▶ [patch]
Modernized logger interface by replacing deprecated `logger.warn` with `logger.warning` to avoid DeprecationWarning in Python environments.

### Automated Package Updates

<details>
<summary>10 Dependabot updates</summary>

* build(deps-dev): bump the client-web-node-deps group (77d81f2f3d)
* build(deps): bump github.com/shirou/gopsutil/v4 in the go-deps group (562d2925c9)
* build(deps): bump the node-deps group with 17 updates (d146d04abe)
* build(deps): bump taskcluster from 83.7.0 to 84.0.2 in /taskcluster (8bca2bb982)
* build(deps): bump taskcluster-taskgraph (b88065dff3)
* build(deps): bump debug in /clients/client in the client-node-deps group (9b413949b7)
* build(deps): bump dependabot/fetch-metadata in the gh-actions-deps group (d6b8b95eb4)
* build(deps): bump the client-rust-deps group (16c9599f28)
* build(deps): bump github.com/go-jose/go-jose/v4 from 4.0.4 to 4.0.5 (303865a185)
* build(deps): bump github.com/golang-jwt/jwt/v5 from 5.2.1 to 5.2.2 (4e1a71989f)

</details>

## v84.0.2

### USERS

▶ [patch] [#4943](https://github.com/taskcluster/taskcluster/issues/4943)
Fixes UI error "buildSignedUrl missing required credentials" shown directly after login due to missing credentials.

## v84.0.1

### GENERAL

▶ [patch]
Upgrades to Node.js v22.15.1 (SECURITY).

More info [here](https://nodejs.org/en/blog/vulnerability/may-2025-security-releases).

### WORKER-DEPLOYERS

▶ [patch] [bug 1967254](http://bugzil.la/1967254)
Generic Worker (d2g): uses info log level when uploading error artifacts if the artifact was marked optional. Previously, the log would contain `[taskcluster:error]` which Treeherder would identify as a failure, even if the task is successful.

▶ [patch] [#7630](https://github.com/taskcluster/taskcluster/issues/7630)
Generic Worker: improves artifact upload process by parallelizing the scanning of the system for file/directory artifacts from the payload.

## v84.0.0

### DEPLOYERS

▶ [MAJOR] [#7287](https://github.com/taskcluster/taskcluster/issues/7287)
Helm chart includes HorizontalPodAutoscaler for all web services which is not enabled by default.
Can be enabled per-service, and when enabled, deployment's "replicas" field will be ignored.

### USERS

▶ [minor]
Pass /dev/nvidia* devices to `docker run` when `allowGPUs` is true. This works around the issue described in https://github.com/NVIDIA/nvidia-container-toolkit/issues/48, where GPUs disappear if a systemd daemon reload happens.

## v83.10.1

### USERS

▶ [patch] [#7686](https://github.com/taskcluster/taskcluster/issues/7686)
Fixed task retrigger for tasks with underscored priority values (like `very_low`).

▶ [patch] [#7575](https://github.com/taskcluster/taskcluster/issues/7575)
Taskcluster Yaml debugger properly simulates issue comment events, previously it was failing.

▶ [patch] [#7474](https://github.com/taskcluster/taskcluster/issues/7474)
UI: fixes hamburger menu closing too quickly

▶ [patch]
Generic Worker (D2G): no longer logs translated payload and our recommendation to migrate all tasks to Generic Worker payload format. Worker config `d2gConfig.logTranslation` is now unused and will be removed in a future release.

▶ [patch] [#7716](https://github.com/taskcluster/taskcluster/issues/7716)
Generic Worker code internal refactoring: moved task startup/teardown steps into task features. No change to behaviour other than slight changes to both worker logs and task logs.

## v83.10.0

### WORKER-DEPLOYERS

▶ [minor] [#7628](https://github.com/taskcluster/taskcluster/issues/7628)
Generic Worker: adds a `Metadata` feature (controlled with worker config `enableMetadata` [default: `true`], not controllable in the task payload) that writes out a file `generic-worker-metadata.json` (in the current working directory of the generic worker process) containing information about the last task run.

Currently, the file will look something like this:

```json
{
	"lastTaskUrl": "https://firefox-ci-tc.services.mozilla.com/tasks/Klc17PU-TMmo4axlfihKJQ/runs/0"
}
```

Additional data may be added to this file in future releases.

## v83.9.1



## v83.9.0

### GENERAL

▶ [patch]
Upgrades to go 1.24.3 [SECURITY].

### USERS

▶ [minor] [#7548](https://github.com/taskcluster/taskcluster/issues/7548)
Auth service exposes `ListAuditHistory` endpoint for retrieving audit history by entity ID, entity type, and client ID.

### DEVELOPERS

▶ [minor] [#7612](https://github.com/taskcluster/taskcluster/issues/7612)
Introduce internal metrics library to export metrics to prometheus.

### Automated Package Updates

<details>
<summary>1 Dependabot updates</summary>

* build(deps): bump cron-parser from 4.9.0 to 5.1.1 (42e7bb29ef)

</details>

## v83.8.0

### WORKER-DEPLOYERS

▶ [minor] [#7678](https://github.com/taskcluster/taskcluster/issues/7678)
D2G: pre and post-task-processing (image pulling/loading/saving, copying artifacts out of container, creating chain of trust additional data file, removing container/volumes, handling max runtime) now happens within the D2G Task Feature in Generic Worker, as opposed to within the resulting translated task payload. This slims the translated task payload to only the `docker run ...` command.

▶ [patch] [#7685](https://github.com/taskcluster/taskcluster/issues/7685)
Fixes node-forge issue with certificates being removed during chain verification process,
which allowed Azure `registerWorker()` calls fail after some time.
This happened when multiple certs had same subject hash but different issuers.

▶ [patch] [#5786](https://github.com/taskcluster/taskcluster/issues/5786)
Properly reap proxy processes when stopping the taskcluster proxy feature

### Automated Package Updates

<details>
<summary>6 Dependabot updates</summary>

* build(deps): bump the python-deps group in /taskcluster with 2 updates (501c8adc14)
* build(deps): bump the node-deps group with 18 updates (fe67ad2c2e)
* build(deps): bump github.com/shirou/gopsutil/v4 in the go-deps group (1008f65d9e)
* build(deps-dev): bump the client-web-node-deps group (76b7158f6b)
* build(deps): bump the client-rust-deps group (c927822da6)
* build(deps): bump base-x from 5.0.0 to 5.0.1 (0f33f56af5)

</details>

## v83.7.0

### GENERAL

▶ [patch]
Upgrades to Node.js v22.15.0 and yarn v4.9.1

### WORKER-DEPLOYERS

▶ [minor] [#7670](https://github.com/taskcluster/taskcluster/issues/7670)
Removed ECC Azure certificate and include extra information in errors.

## v83.6.0

### DEPLOYERS

▶ [minor] [#3924](https://github.com/taskcluster/taskcluster/issues/3924)
Removed bundled root CAs that exist in node already.

### WORKER-DEPLOYERS

▶ [minor] [#7670](https://github.com/taskcluster/taskcluster/issues/7670)
Azure provider includes up-to-date intermediate certificates to speed up worker registration process,
expired certificates has been removed.

### USERS

▶ [minor]
Add support for windows interactive tasks

## v83.5.8

### WORKER-DEPLOYERS

▶ [patch] [#7671](https://github.com/taskcluster/taskcluster/issues/7671)
D2G: removes unneeded `kvm` and `libvirt` OS groups for generic worker task user if KVM device is requested.

### USERS

▶ [patch] [#7664](https://github.com/taskcluster/taskcluster/issues/7664)
Fix an issue where taskcluster would try to report checks to github that exceeded the max allowed length if the log contained long lines in its tail

## v83.5.7

### GENERAL

▶ [patch]
Upgrades to go1.24.2.

### DEVELOPERS

▶ [patch] [#7099](https://github.com/taskcluster/taskcluster/issues/7099)
Updated azure test certificates.

## v83.5.6

### WORKER-DEPLOYERS

▶ [patch] [#7368](https://github.com/taskcluster/taskcluster/issues/7368)
Generic Worker: increase performance of artifact uploads by removing a redundant file copy operation.

### USERS

▶ [patch]
UI: don't show `Requested` filter option on `Queue Workers` view, link to `W-M Workers` filtered view when clicking on `Requested Capacity` or `Stopping Capacity` buttons, don't redirect to Worker Manager Worker Pools page after saving Worker Pool config changes.

## v83.5.5

### WORKER-DEPLOYERS

▶ [patch] [#7652](https://github.com/taskcluster/taskcluster/issues/7652)
Generic Worker: remove temp file created while adding additional data to chain of trust file.

### USERS

▶ [patch]
Fixes duplicate taskcluster windows after external signin.

## v83.5.4

### GENERAL

▶ [patch]
Refactor web-server middleware

### DEVELOPERS

▶ [patch]
UI: Improves login window after redirect

## v83.5.3

### GENERAL

▶ [patch]
Fix 3rd party login header issue

### WORKER-DEPLOYERS

▶ [patch] [#7650](https://github.com/taskcluster/taskcluster/issues/7650)
Generic Worker (windows): fixes cache mount issue where generic worker fails to reset permissions on the cache directory. First noticed in [v81.0.3](https://docs.taskcluster.net/docs/changelog?version=v81.0.3).

## v83.5.2

### GENERAL

▶ [patch] [#7643](https://github.com/taskcluster/taskcluster/issues/7643)
Upgrades to rust 1.86.0.

### DEVELOPERS

▶ [patch]
Generic Worker now handles artifact upload inside a task feature rather than the main processing loop of the task execution. This refactor improves code modularity.

### Automated Package Updates

<details>
<summary>5 Dependabot updates</summary>

* build(deps): bump crossbeam-channel in /clients/client-rust (19918f0136)
* build(deps): bump the node-deps group with 21 updates (c73c37aa06)
* build(deps): bump the python-deps group in /taskcluster with 2 updates (ba5ee4b929)
* build(deps-dev): bump eslint (f0b65711be)
* build(deps): bump the go-deps group with 4 updates (6051fc8b9e)

</details>

## v83.5.1

### WORKER-DEPLOYERS

▶ [patch]
Generic Worker: adds additional worker logs around the artifact upload process to help debug artifact upload performance.

### USERS

▶ [patch] [#7625](https://github.com/taskcluster/taskcluster/issues/7625)
Generic Worker now supports running Taskcluster Proxy on the docker bridge network outside of D2G.

## v83.5.0

### GENERAL

▶ [patch] [#7611](https://github.com/taskcluster/taskcluster/issues/7611)
Fixes worker-manager events that didn't include `launchConfigId` in pulse messages.

▶ [patch]
Upgrades to go1.23.8 (SECURITY) and yarn 4.8.1

### USERS

▶ [minor] [#6783](https://github.com/taskcluster/taskcluster/issues/6783)
Docs: adds Generic Worker Configuration help page to the reference docs.

▶ [patch] [#7606](https://github.com/taskcluster/taskcluster/issues/7606)
UI displays paginated quarantine history on the worker page.

### DEVELOPERS

▶ [minor] [#7543](https://github.com/taskcluster/taskcluster/issues/7543)
Fixes broken local development UI container.

### Automated Package Updates

<details>
<summary>4 Dependabot updates</summary>

* build(deps): bump the go-deps group with 6 updates (9122a95706)
* build(deps): bump got in /clients/client in the client-node-deps group (5800faaafa)
* build(deps-dev): bump the client-web-node-deps group (ce7d5b35b8)
* build(deps): bump taskcluster in /taskcluster in the python-deps group (22f859b4f4)

</details>

## v83.4.0

### GENERAL

▶ [patch]
Upgrades to go1.23.7, Node.js 22.14.0, and yarn 4.7.0

### DEPLOYERS

▶ [patch]
Improves worker manager launch configurations documentation

### WORKER-DEPLOYERS

▶ [minor] [#6464](https://github.com/taskcluster/taskcluster/issues/6464)
Generic Worker: adds memory usage monitoring during tasks and reports average and peak memory used, in addition to the system's total available memory.

If the total percentage of memory used exceeds 90% for 5 consecutive measurements at 0.5s intervals, the worker will abort the task to prevent OOM crashes and errors. If `disableOOMProtection` (default `false`) is set to `true` in the worker configuration, the worker will continue to monitor and report on memory usage, but will not abort the task if memory consumption is high.

Resource monitoring can be disabled with worker config `enableResourceMonitor` (default `true`) or per task via `payload.features.resourceMonitor` (default `true`).

▶ [patch]
Generic Worker: only warn about missing `audio`/`video` os groups for non-d2g tasks.

### USERS

▶ [minor] [#7594](https://github.com/taskcluster/taskcluster/issues/7594)
Docker Worker (D2G): adds `volume` type for artifacts. This is strictly used for D2G purposes only. Use this type to have D2G volume mount your artifact path instead of `docker cp`'ing the artifact at the end of the task run. This can be useful under spot termination instances where the `docker cp` command doesn't get a chance to run, instead a volume mount will have the files on the host ready for upload as soon as the spot termination requests comes in.

▶ [patch] [#7603](https://github.com/taskcluster/taskcluster/issues/7603)
UI shows all dates in UTC.

### Automated Package Updates

<details>
<summary>5 Dependabot updates</summary>

* build(deps): bump github.com/golang-jwt/jwt/v4 from 4.5.1 to 4.5.2 (2534d51f13)
* build(deps): bump golang.org/x/net from 0.35.0 to 0.36.0 (86d00b581d)
* build(deps): bump @babel/helpers from 7.17.2 to 7.26.10 in /ui (3804ecc951)
* build(deps): bump @babel/runtime from 7.23.2 to 7.26.10 (0d00c3c953)
* build(deps): bump @babel/runtime from 7.18.6 to 7.26.10 in /ui (3211ce06f3)

</details>

## v83.3.0

### GENERAL

▶ [patch]
Upgrades `goreleaser` to v2.7.0 for building `client-shell` binaries during releases.

### WORKER-DEPLOYERS

▶ [patch] [#7581](https://github.com/taskcluster/taskcluster/issues/7581)
D2G: add `audio`/`video` os-groups and scopes needed when the Docker Worker task payload requests these loopback devices.

### USERS

▶ [minor]
UI shows launch configs for worker pool with details and runtime worker/error statistics.
Improved navigation between pages.

▶ [minor]
Worker-Manager introduces new endpoints:
* `listWorkerPoolLaunchConfigs(workerPoolId)` to fetch all active and archived launch configs for worker pool.
* `workerPoolStats(workerPoolId)` to return workers capacity and counts grouped by launch config

## v83.2.4

### GENERAL

▶ [patch]
Generic Worker: fix `panic` when the taskcluster proxy task feature tries to terminate the taskcluster proxy PID.

### WORKER-DEPLOYERS

▶ [patch]
Generic Worker: fix detection of docker bridge gateway address in the presence of ipv6

### Automated Package Updates

<details>
<summary>1 Dependabot updates</summary>

* build(deps): bump prismjs from 1.29.0 to 1.30.0 in /ui (e7d659894f)

</details>

## v83.2.3

### DEPLOYERS

▶ [patch]
Fixes worker-manager provisioner behaviour for worker pools with capacityPerInstance > 1

### WORKER-DEPLOYERS

▶ [patch] [#7427](https://github.com/taskcluster/taskcluster/issues/7427)
Generic Worker now writes file-caches.json and directory-caches.json after each task that uses mounts feature.

### Automated Package Updates

<details>
<summary>1 Dependabot updates</summary>

* build(deps): bump jinja2 from 3.1.5 to 3.1.6 in /taskcluster (f39bb30e57)

</details>

## v83.2.2



## v83.2.1

### WORKER-DEPLOYERS

▶ [patch] [#7568](https://github.com/taskcluster/taskcluster/issues/7568)
Generic Worker: fixes panic while trying to refresh `taskcluster-proxy` credentials.

## v83.2.0

### GENERAL

▶ [patch] [#7541](https://github.com/taskcluster/taskcluster/issues/7541)
Added missing primary keys for several db tables.

### WORKER-DEPLOYERS

▶ [minor] [#7552](https://github.com/taskcluster/taskcluster/issues/7552)
D2G: use the default docker bridge network instead of the host network.

▶ [minor]
Generic Worker: when running a task through d2g, the taskcluster proxy now listens on the docker bridge instead of localhost.

### Automated Package Updates

<details>
<summary>1 Dependabot updates</summary>

* build(deps): bump fast-azure-storage from 3.1.6 to 4.0.0 (9e093e4ff1)

</details>

## v83.1.0

### USERS

▶ [minor] [#7545](https://github.com/taskcluster/taskcluster/issues/7545)
D2G: sets each payload artifact as `optional` so tasks won't resolve as `failed/failed` if the artifact doesn't exist, like Docker Worker does.

▶ [minor] [#7545](https://github.com/taskcluster/taskcluster/issues/7545)
Generic Worker: adds `optional` field to payload artifacts to ignore any artifact upload errors, for example, if the artifact isn't known to exist at the end of a task but you don't want the task to resolve as `failed/failed`. This makes the transition from Docker Worker --> Generic Worker (through d2g) more seamless, as Docker Worker does not resolve tasks as `failed/failed` if the artifact doesn't exist.

▶ [patch] [#7411](https://github.com/taskcluster/taskcluster/issues/7411)
Generic Worker: no longer `chown` loopback video/audio devices to the task user. Explicitly change group of the devices to `video`/`audio`, respectively, so that users in those groups may still access them.

### Automated Package Updates

<details>
<summary>4 Dependabot updates</summary>

* build(deps): bump the go-deps group with 6 updates (84deac48d4)
* build(deps): bump got in /clients/client in the client-node-deps group (8af8bc3d9e)
* build(deps-dev): bump the client-web-node-deps group (6771b0038e)
* build(deps): bump taskcluster from 79.0.0 to 83.0.1 in /taskcluster (cf16b31c9a)

</details>

## v83.0.1

### USERS

▶ [patch] [#5438](https://github.com/taskcluster/taskcluster/issues/5438)
Fixes hook id in audit history table.
Changes `worker_pool` to `worker-pool` for consistency as entity type.

## v83.0.0

### USERS

▶ [MAJOR] [#5438](https://github.com/taskcluster/taskcluster/issues/5438)
Added audit history tracking for clients, roles, secrets, and hooks.
History can be queried using `auth.getEntityHistory(type, entityId)` and is retained for 30 days.

## v82.1.0

### USERS

▶ [minor]
Worker manager introduces `listWorkerPoolsStats()` endpoint to return worker stats for all worker pools.
Fixes UI not showing capacity for worker pools.

## v82.0.1

### WORKER-DEPLOYERS

▶ [patch]
Fixes an error in worker manager's provisioner when no launch configs are defined.

## v82.0.0

### WORKER-DEPLOYERS

▶ [MAJOR] [#7086](https://github.com/taskcluster/taskcluster/issues/7086)
Worker Manager introduces `launchConfigId` and schema changes:

* New `workerManager` configuration object in launch configs that includes:
  * `launchConfigId` - unique identifier for tracking and error attribution
  * `capacityPerInstance` - specify worker capacity per instance (old top-level propert is supported but is deprecated)
  * `initialWeight` - control provisioning probability (0-1)
  * `maxCapacity` - hard limit on number of instances per config

The provisioner distributes load across configs by:
* Dynamically adjusting weights based on error rates and capacity limits
* Temporarily reducing usage of configs experiencing errors
* Maintaining error history in a 1-hour sliding window

## v81.0.3

### GENERAL

▶ [patch] [#7532](https://github.com/taskcluster/taskcluster/issues/7532)
Generic Worker (windows): fix cache ownership issues. Clean up ACLs so prior task users aren't referenced anymore.

### USERS

▶ [patch] [#7527](https://github.com/taskcluster/taskcluster/issues/7527)
Fixes an issue introduced in Generic Worker 81.0.0 where the Chain of Trust
certificate would not contain all of the additional data specified in the
task-provided `chain-of-trust-additional-data.json` file.

Generic Worker 81.0.0 enhanced the Chain of Trust task payload feature to
support adding arbitrary additional data to the `public/chain-of-trust.json`
artifact. This was implemented in [PR
#7507](https://github.com/taskcluster/taskcluster/pull/7507) by allowing the
task to write additional data to the file `chain-of-trust-additional-data.json`
in the task directory. The feature was meant to merge the content of this file
with the generated `chain-of-trust.json` file before publishing it as an
artifact. However, the merge of the two json objects was broken if they
contained common ancestors.  For example, the generated `chain-of-trust.json`
file contains a top level object property `environment`. If the task-provided
`chain-of-trust-additional-data.json` file also contained a top level object
property `environment` containing further properties, they would be omitted
from the resulting `environment` property in the published Chain of Trust
certificate.

▶ [patch] [#7014](https://github.com/taskcluster/taskcluster/issues/7014)
Generic Worker now adds `environment.imageHash` (always), and
`environment.imageArtifactHash` (when present) to `public/chain-of-trust.json`
when running Docker Worker Chain of Trust tasks, to match Docker Worker
behaviour.

### DEVELOPERS

▶ [patch] [#7479](https://github.com/taskcluster/taskcluster/issues/7479)
Add a way to update d2g test expectations by setting the
`D2G_UPDATE_TEST_EXPECTATIONS` environment variable while running tests

## v81.0.2

### WORKER-DEPLOYERS

▶ [patch] [#7521](https://github.com/taskcluster/taskcluster/issues/7521)
Generic Worker: fixes an issue introduced in v81.0.0 where `TASK_USER_CREDENTIALS` env var wasn't written to the task's environment if `task.payload.features.runTaskAsCurrentUser` was enabled.

### Automated Package Updates

<details>
<summary>2 Dependabot updates</summary>

* build(deps): bump elliptic from 6.6.0 to 6.6.1 in /ui (a0eb01744)
* build(deps): bump elliptic from 6.6.0 to 6.6.1 in /clients/client-web (e17fc4ed4)

</details>

## v81.0.1

### WORKER-DEPLOYERS

▶ [patch] [#7517](https://github.com/taskcluster/taskcluster/issues/7517)
Generic Worker: fixes `fork/exec` issue on headless, multiuser engine introduced in v81.0.0.

## v81.0.0

### GENERAL

▶ [patch]
Upgrades to go1.23.6 and golangci-lint 1.63.4

### DEPLOYERS

▶ [minor] [#7508](https://github.com/taskcluster/taskcluster/issues/7508)
Removes Cloud Armor specific policy config from deployment templates as it was applied incorrectly.

### WORKER-DEPLOYERS

▶ [MAJOR]
Generic Worker: feature `runTaskAsCurrentUser` (note: `Task` not `Tasks`) has been added to replace the previous global task config setting `runTasksAsCurrentUser` (which is no longer supported). Worker pools can elect to enable or disable the feature with boolean config setting `enableRunTaskAsCurrentUser`. Tasks with the feature enabled (`task.payload.features.runTaskAsCurrentUser = true`) require scope `generic-worker:run-task-as-current-user:<provisionerID>/<workerType>`.

This change was introduced in order that access to this privileged feature are guarded not only by worker config settings, but also by task scopes, and furthermore the feature must be explicitly requested, in order that tasks do not unintentionally inherit the feature by virtue of overgenerous scopes or unintentionally running on a pool with the feature enabled.

▶ [patch] [#7462](https://github.com/taskcluster/taskcluster/issues/7462)
Generic Worker (D2G): prune docker images during garbage collection, if needed.

### USERS

▶ [MAJOR]
The interactive feature will now drop users in the task container instead of the host

▶ [minor] [#7506](https://github.com/taskcluster/taskcluster/issues/7506)
Generic Worker Chain Of Trust feature now allows tasks to inject additional
data into `public/chain-of-trust.json`. Tasks wishing to add additional fields
should write them as json to the file `chain-of-trust-additional-data.json` in
the task directory. In this initial release, there are no provisions to
customise the name or path of the file. The file contents will be merged with
the default chain of trust certificate, with the default field values taking
precedence over any provided in `chain-of-trust-additional-data.json`. If the
file is not created by the task, no merging will take place, and the feature
will operate as before.

▶ [minor]
Set TASK_WORKDIR environment variable for generic-worker tasks.

▶ [patch]
Fixed the `--completed` flag for `taskcluster group list` so it actually works instead of returning an empty list all the time

## v80.0.0

### WORKER-DEPLOYERS

▶ [MAJOR]
D2G: Drop support for `podman`. Docker worker `payload.capabilities.containerEngine` is removed. Generic Worker config `d2gConfig.containerEngine` is removed.

### Automated Package Updates

<details>
<summary>6 Dependabot updates</summary>

* build(deps-dev): bump the client-web-node-deps group (76b590caa)
* build(deps): bump taskcluster from 77.0.0 to 79.0.0 in /taskcluster (17fa89a7e)
* build(deps): bump taskcluster-taskgraph in /taskcluster (3cd394e86)
* build(deps): bump the node-deps group with 23 updates (f2915637d)
* build(deps): bump the go-deps group with 5 updates (4ebb48d43)
* build(deps): bump dependabot/fetch-metadata in the gh-actions-deps group (abda5e681)

</details>

## v79.0.0

### WORKER-DEPLOYERS

▶ [MAJOR] [#7464](https://github.com/taskcluster/taskcluster/issues/7464)
Static workers always receive workerPool's workerConfig.
Previously workerConfig was stored in the worker.providerData,
which made it impossible to update config without creating new worker

▶ [minor] [#7465](https://github.com/taskcluster/taskcluster/issues/7465)
`WorkerManager.createWorker()` API call handles non-unique errors and responds with `409`
if worker with same `workerId` already exists in the pool

▶ [patch] [#7463](https://github.com/taskcluster/taskcluster/issues/7463)
D2G: Pull docker image as initial command to ensure latest image version is used during task execution.

## v78.2.0

### WORKER-DEPLOYERS

▶ [patch] [#7218](https://github.com/taskcluster/taskcluster/issues/7218)
Generic Worker: Unset cached interactive username when we unexpectedly receive a non-task username.

This will fix errors like: `interactive username gdm does not match task user task_173764785573833`.

### USERS

▶ [minor]
Generic Worker: Stop leaking anonymous volumes created by docker containers when using d2g with tasks that have artifacts declared in the task

## v78.1.0

### GENERAL

▶ [patch]
Upgrades to Node.js v22.13.1 (SECURITY).

### WORKER-DEPLOYERS

▶ [minor]
Worker-manager scanner and provisioner logs cloud api call times and statistics.
New metric will be logged with 'cloud-api-metrics' type at the end of each scan and provision loop.

## v78.0.0

### GENERAL

▶ [patch]
Upgrades to Node.js v22.13.0, rust v1.84.0, and yarn v4.6.0.

▶ [patch]
Upgrades to go1.23.5 (SECURITY).

### WORKER-DEPLOYERS

▶ [MAJOR] [#7443](https://github.com/taskcluster/taskcluster/issues/7443)
Worker-pool's lifecycle `queueInactivityTimeout` minimum allowed value is increased
to `1200` (20min) to avoid having workers being incorrectly considered idling
while they were working on a task.

### USERS

▶ [minor]
Generic Worker: Improve cache mounting speed on linux, especially when they contain a lot of tiny files

## v77.3.1

### WORKER-DEPLOYERS

▶ [patch]
Generic Worker: fixes permissions issues with ReadOnlyDirectory mounts.

## v77.3.0

### USERS

▶ [minor]
The notify service includes `rootUrl` in the json-e context when rendering the `link` included in emails.

## v77.2.0

### ADMINS

▶ [minor]
Allows the ability to attach a Cloud Armor policy to a BackendConfig and to use
that BackendConfig in the ingress configuration. (OPST-1755)

### USERS

▶ [patch]
Web-Server: fixes missing callback function in passport req.logout.

## v77.1.0

### USERS

▶ [minor] [#7404](https://github.com/taskcluster/taskcluster/issues/7404)
Re-apply the patch to fix docker cache issues and fix the issues when using
podman as the container engine.

### DEVELOPERS

▶ [minor]
Adding type checks with jsdoc and typescript.

### Automated Package Updates

<details>
<summary>5 Dependabot updates</summary>

* build(deps): bump taskcluster from 75.0.0 to 77.0.0 in /taskcluster (1cb203ecc)
* build(deps-dev): bump the client-web-node-deps group (b73bd5464)
* build(deps): bump jinja2 from 3.1.4 to 3.1.5 in /taskcluster (d2003e3f8)
* build(deps): bump the go-deps group with 2 updates (3d8bd1bbb)
* build(deps): bump debug in /clients/client in the client-node-deps group (a6146f51c)

</details>

## v77.0.0

### WORKER-DEPLOYERS

▶ [MAJOR]
Generic Worker: adds worker config feature toggles to quickly/easily enable/disable features across entire worker pools. All features are enabled, by default.

Generic Worker: adds `d2gConfig` worker config to configure D2G translations. `enableD2G` and `containerEngine` config settings have been moved into this new config. The following is the new structure (with default values shown):

```json
{
    ...
    "d2gConfig": {
        "enableD2G": false,
        "allowChainOfTrust": true,
        "allowDisableSeccomp": true,
        "allowHostSharedMemory": true,
        "allowInteractive": true,
        "allowKVM": true,
        "allowLoopbackAudio": true,
        "allowLoopbackVideo": true,
        "allowPrivileged": true,
        "allowPtrace": true,
        "allowTaskclusterProxy": true,
        "containerEngine": "docker"
    },
    ...
}
```

Tasks using disabled features will be resolved as `exception/malformed-payload`.

▶ [minor] [#7390](https://github.com/taskcluster/taskcluster/issues/7390)
Generic Worker: adds `d2gConfig.allowGPUs` (default: `false`) and `d2gConfig.gpus` (default: `all`) worker config to provide NVIDIA GPU access to the running container for d2g-translated task payloads.

The translation will add the gpus flag: `--gpus <d2gConfig.gpus>` to the `docker run ...` command. Read more about the usage [here](https://docs.docker.com/reference/cli/docker/container/run/#gpus).

▶ [minor]
Generic Worker: adds `disableNativePayloads` (default: `false`) worker config option (`linux` only) to require all task payloads to be Docker Worker payloads. If this option is set to `true`, the task log will no longer contain the translated task definition and the warning about using Docker Worker payloads.

Tasks submitted with native payloads will be resolved as `exception/malformed-payload`.

Generic Worker: adds `d2gConfig.logTranslation` (default: `true`) worker config to control whether the D2G-translated task definition is logged to the task logs.

### Automated Package Updates

<details>
<summary>2 Dependabot updates</summary>

* build(deps): bump nanoid from 3.3.6 to 3.3.8 (e451def2d)
* build(deps): bump golang.org/x/crypto from 0.29.0 to 0.31.0 (e2f947058)

</details>

## v76.0.0

### GENERAL

▶ [patch]
Upgrades to Node.js v22.12.0, go v1.23.4, and yarn v4.5.3.

### USERS

▶ [MAJOR] [#3823](https://github.com/taskcluster/taskcluster/issues/3823)
Add authentication to websockets at the time of subscribing to pulse messages

This introduces new scope `web:read-pulse` that needs to be added to the existing `anonymous` role
in order to keep Pulse subscriptions public.

▶ [patch] [#4086](https://github.com/taskcluster/taskcluster/issues/4086)
`queue.getArtifact()` checks if artifact is expired and returns `ResourceExpired - 410` in such cases

### Automated Package Updates

<details>
<summary>1 Dependabot updates</summary>

* build(deps): bump the node-deps group across 1 directory with 4 updates (2edd60b1a)

</details>

## v75.0.1

### WORKER-DEPLOYERS

▶ [patch] [#7404](https://github.com/taskcluster/taskcluster/issues/7404)
Generic Worker: Reverting 61b985dd009210a204da3bb354eab2037d132bef due to issue #7404 with cache permissions.

### Automated Package Updates

<details>
<summary>6 Dependabot updates</summary>

* build(deps): bump the node-deps group across 1 directory with 17 updates (8607b9d44)
* build(deps): bump taskcluster from 74.0.0 to 75.0.0 in /taskcluster (3565e2b7e)
* build(deps): bump taskcluster-taskgraph (94375c104)
* build(deps): bump the go-deps group with 5 updates (b724509a7)
* build(deps-dev): bump the client-web-node-deps group (5a81717fa)
* build(deps): bump the client-node-deps group (76501c53a)

</details>

## v75.0.0

### USERS

▶ [MAJOR] [#7128](https://github.com/taskcluster/taskcluster/issues/7128)
Generic Worker now only changes file ownership of files inside caches, if the
file was owned by the previous task user. Previously Generic Worker changed the
ownership of all files inside a cache to be the new task user, which caused
problems if files were modified inside containers using different subuids.

▶ [patch] [#7386](https://github.com/taskcluster/taskcluster/issues/7386)
Fixes UI issue where "No WorkerPool exists" error was shown in pending/claimed tasks list.

### Automated Package Updates

<details>
<summary>6 Dependabot updates</summary>

* build(deps): bump cross-spawn from 7.0.3 to 7.0.6 in /clients/client (8f1ae7081)
* build(deps): bump cross-spawn from 7.0.3 to 7.0.6 in /ui/test/e2e (ba80be7ae)
* build(deps): bump cross-spawn from 6.0.5 to 6.0.6 in /ui (b61b37312)
* build(deps): bump cross-spawn from 7.0.3 to 7.0.6 in /clients/client-web (34e12e170)
* build(deps): bump cross-spawn from 6.0.5 to 6.0.6 (1204a00e5)
* build(deps): bump @eslint/plugin-kit in /clients/client-web (df1f054b9)

</details>

## v74.0.1

### GENERAL

▶ [patch]
D2G: `ConvertScopes()` additionally checks scopes for `loopbackAudio` and `loopbackVideo`.

▶ [patch]
D2G: `ConvertScopes()` checks all scopes at once so users would see all missing scopes in one run.

▶ [patch]
Upgrades to go1.23.3.

▶ [patch]
Upgrades to the new Node.js LTS version 22.11.0

### DEVELOPERS

▶ [patch] [#7246](https://github.com/taskcluster/taskcluster/issues/7246)
Add linting rule for spaces before and after keywords
Add linting rule to remove spaces inside round parenthesis

### Automated Package Updates

<details>
<summary>8 Dependabot updates</summary>

* build(deps): bump matrix-js-sdk from 34.9.0 to 34.11.1 (221b10b53)
* build(deps): bump the client-node-deps group across 1 directory with 2 updates (8a7ee712a)
* build(deps): bump github.com/golang-jwt/jwt/v4 from 4.5.0 to 4.5.1 (19586b5bf)
* build(deps): bump taskcluster-taskgraph in /taskcluster (b05031f76)
* build(deps): bump the node-deps group with 30 updates (7c778cb1c)
* build(deps-dev): bump the client-web-node-deps group (08362e208)
* build(deps): bump taskcluster from 72.0.1 to 74.0.0 in /taskcluster (bc8269d34)
* build(deps): bump the go-deps group with 6 updates (1e5054f9e)

</details>

## v74.0.0

### GENERAL

▶ [patch]
Upgrades to Node.js 20.18.0 and yarn 4.5.1

### WORKER-DEPLOYERS

▶ [MAJOR]
D2G: Renamed methods `Convert()` --> `ConvertPayload()` and `Scopes()` --> `ConvertScopes()`.

D2G: `ConvertScopes()` checks that the provided docker worker payload is valid with the supplied scopes. Generic Worker will now resolve a docker worker task as `exception/malformed-payload` if any required docker worker scopes are missing for its payload.

▶ [MAJOR] [#7320](https://github.com/taskcluster/taskcluster/issues/7320)
Reverts PR #7324. Taskcluster Proxy will now only listen on 127.0.0.1.

### USERS

▶ [patch] [#7340](https://github.com/taskcluster/taskcluster/issues/7340)
D2G: Use unique task container names to avoid container naming conflicts.

### DEVELOPERS

▶ [patch]
Fixed the rust library for uploading artifact when the object service returned
a `content-length` header. It will now avoid duping the header which was
resulting in 400s from upstream object storages.

▶ [patch]
The rust client will now properly fail when the PUT url call returns an error
while uploading an artifact.

### Automated Package Updates

<details>
<summary>3 Dependabot updates</summary>

* build(deps): bump elliptic from 6.5.7 to 6.6.0 in /ui (11ebddccd)
* build(deps): bump elliptic from 6.5.7 to 6.6.0 in /clients/client-web (eef39b199)
* build(deps): bump matrix-js-sdk from 25.1.1 to 34.8.0 (#7330) (73da29d98)

</details>

## v73.0.0

### GENERAL

▶ [patch] [#7322](https://github.com/taskcluster/taskcluster/issues/7322)
Worker Manager: AWS and GCP workers now transition into stopping state on call to `removeWorker`.

### WORKER-DEPLOYERS

▶ [MAJOR] [#7320](https://github.com/taskcluster/taskcluster/issues/7320)
D2G: containers no longer use the host's network namespace

### USERS

▶ [patch] [#7327](https://github.com/taskcluster/taskcluster/issues/7327)
D2G: Don't provide `--privileged` flag for dind and host shared memory use. Only using now as a one-to-one mapping to Docker Worker's privileged payload flag.

### OTHER

▶ Additional change not described here: [#7286](https://github.com/taskcluster/taskcluster/issues/7286).

## v72.1.1

### USERS

▶ [patch] [#7309](https://github.com/taskcluster/taskcluster/issues/7309)
D2G: No longer pass `--init` to the `docker run ...` command. This was breaking docker image build tasks that Taskgraph creates. To kill the running docker container, we now pass `-s KILL` to the `timeout` command.

▶ [patch] [#6858](https://github.com/taskcluster/taskcluster/issues/6858)
D2G: Translated payload or task definition will no longer contain the default `expires` string for artifacts, `"0001-01-01T00:00:00.000Z"`.

## v72.1.0

### GENERAL

▶ [patch] [#7307](https://github.com/taskcluster/taskcluster/issues/7307)
Generic Worker (D2G): Pass devices through to the `docker run ...` command using `--device` instead of a volume mount.

▶ [patch]
Upgrades to go1.23.2 and yarn 4.5.0

### USERS

▶ [minor]
The notify service includes `rootUrl` in the json-e context when rendering slack/matrix/email messages.

▶ [patch]
D2G: No longer specify file mount format on image if compressed with gzip, bzip2, xz, or zstd when using docker. Generic Worker will now no longer decompress these files before running `docker load`. Docs [here](https://docs.docker.com/reference/cli/docker/image/load/).

▶ [patch] [#7305](https://github.com/taskcluster/taskcluster/issues/7305)
Generic Worker multiuser engine task log headers now include generic-worker
config properties `runTasksAsCurrentUser` and `headlessTasks` in order to help
troubleshoot unexpected behaviour. These properties fundamentally affect how
the task runs, so it is useful to log them together with the other worker
environment information.

Sentry reports also now include this information.

### OTHER

▶ Additional change not described here: [#6923](https://github.com/taskcluster/taskcluster/issues/6923).

### Automated Package Updates

<details>
<summary>5 Dependabot updates</summary>

* build(deps-dev): bump eslint (bb654ed93)
* build(deps): bump debug in /clients/client in the client-node-deps group (6b285333f)
* build(deps): bump taskcluster from 68.0.3 to 72.0.1 in /taskcluster (5b5b8b614)
* build(deps): bump taskcluster-taskgraph in /taskcluster (0077af900)
* build(deps): bump the go-deps group with 5 updates (4145de19d)

</details>

## v72.0.1

### WORKER-DEPLOYERS

▶ [patch] [#7052](https://github.com/taskcluster/taskcluster/issues/7052)
Fixes edge-case in estimation that was introduced in #7283 where claimed count might be greater than the existing capacity.

## v72.0.0

### WORKER-DEPLOYERS

▶ [minor] [#7052](https://github.com/taskcluster/taskcluster/issues/7052)
Worker-manager now uses number of claimed tasks during estimation process to avoid having too many idling workers.
`queue.pendingTasks` is being deprecated in favour of `queue.taskQueueCounts` which includes both pending and claimed tasks counts.

▶ [patch] [#7222](https://github.com/taskcluster/taskcluster/issues/7222)
Worker Runner: Replaces deprecated `/proc/<pid>/oom_adj` with `/proc/<pid>/oom_score_adj`.

### USERS

▶ [MAJOR] [#7174](https://github.com/taskcluster/taskcluster/issues/7174)
Queue service now emits pulse messages to the `exchange/taskcluster-queue/v1/task-exception` exchange when a task has an exception that is automatically retried.

▶ [patch] [#7151](https://github.com/taskcluster/taskcluster/issues/7151)
Fixes Task dependencies not being reloaded in the UI when switching between tasks.

▶ [patch]
Fixes continuation token error handling

## v71.0.0

### GENERAL

▶ [patch] [#7278](https://github.com/taskcluster/taskcluster/issues/7278)
Adds `containerEngine` docs in `Capabilities` section of Docker Worker docs.

### WORKER-DEPLOYERS

▶ [MAJOR] [#7235](https://github.com/taskcluster/taskcluster/issues/7235)
Generic Worker (windows): Removes calls to `wmic` (being [deprecated](https://techcommunity.microsoft.com/t5/windows-it-pro-blog/wmi-command-line-wmic-utility-deprecation-next-steps/ba-p/4039242)) and `net` in favor of a more modern approach using PowerShell cmdlets.

The `powershell` executable is required to be in the path.

## v70.0.0

### WORKER-DEPLOYERS

▶ [MAJOR]
Generic Worker: Adds `containerEngine` worker config option to select between `docker` and `podman` to be used during D2G payload translations.

Default is `docker` and this value will be overridden by `task.payload.capabilities.containerEngine`, if specified.

▶ [MAJOR]
Generic Worker: Adds `enableD2G` worker config option to internally process Docker Worker payloads using D2G. Defaults to `false` and will return a `malformed-payload` if a Docker Worker payload is detected and this config isn't set to `true`.

### USERS

▶ [minor]
D2G: Adds `capabilities.containerEngine` to the Docker Worker payload schema strictly to use as a `docker`/`podman` toggle for the d2g-translated payload.

▶ [minor] [#4595](https://github.com/taskcluster/taskcluster/issues/4595)
Generic Worker can now be run in headless mode, meaning tasks do not have a
dedicated graphical user environment. To do this, the Generic Worker config
setting `headlessTasks` should be set to true. This can only be enabled or
disabled at the Worker level, tasks cannot choose if they run in a headless
environment or not, it depends on the worker settings (i.e. the Worker Pool
configuration).

There are no reboots in headless mode, and multiple worker instances can
be run concurrently on the same host (e.g. Worker Pool definitions may have
`capacity` greater than one).

Furthermore, on Linux, Gnome Desktop is no longer required.

▶ [patch] [#7151](https://github.com/taskcluster/taskcluster/issues/7151)
Fixes a bug in UI where task dependencies were not having colours.

▶ [patch] [#7255](https://github.com/taskcluster/taskcluster/issues/7255)
D2G now passes `--init` to the `podman run`/`docker run` command it generates,
in order that signals are properly received and processed by the container.

### OTHER

▶ Additional change not described here: [#7269](https://github.com/taskcluster/taskcluster/issues/7269).

### Automated Package Updates

<details>
<summary>1 Dependabot updates</summary>

* build(deps): bump body-parser in /clients/client-web (7f33c0332)

</details>

## v69.0.1

### USERS

▶ [patch] [#7263](https://github.com/taskcluster/taskcluster/issues/7263)
Improve github checks output - handle 404 cases for empty artifact list.
Adds artifact redirect page in UI to redirect user to the actual artifact.

## v69.0.0

### GENERAL

▶ [patch]
Upgrades to Node.js v20.17.0 and go1.23.1 (security release).

### WORKER-DEPLOYERS

▶ [minor] [#7257](https://github.com/taskcluster/taskcluster/issues/7257)
Worker-manager provides an option to request public IP for generic-worker in Azure that is skipped by default.
Passing `publicIp = true` in the launch configuration will enable the public IP request.

```json
{
  "workerManager": {
    "publicIp": true
  }
}
```

### USERS

▶ [minor] [#7151](https://github.com/taskcluster/taskcluster/issues/7151)
Queue service supports up to 10.000 dependencies for a single task.

### DEVELOPERS

▶ [MAJOR]
Update dependencies in the rust client

▶ [patch] [#5669](https://github.com/taskcluster/taskcluster/issues/5669)
Enhanced github integration with information: task runtime, head of logs, status information, link of task group, list of 50 artifacts.

▶ [patch] [#5669](https://github.com/taskcluster/taskcluster/issues/5669)
Fix incorrect artifact url generation
Fix artifact fetch with listArtifact due to permission issues

### OTHER

▶ Additional change not described here: [#5669](https://github.com/taskcluster/taskcluster/issues/5669).

### Automated Package Updates

<details>
<summary>4 Dependabot updates</summary>

* build(deps): bump express from 4.19.2 to 4.21.0 in /ui (b72d4e5ce)
* build(deps): bump express from 4.19.2 to 4.20.0 (8156c765c)
* build(deps): bump body-parser from 1.20.2 to 1.20.3 (0f97eb560)
* build(deps): bump dset from 3.1.3 to 3.1.4 (9c896b41c)

</details>

## v68.0.4

### USERS

▶ [patch] [#7233](https://github.com/taskcluster/taskcluster/issues/7233)
getArtifact now encodes artifact names to return valid URLs even when
the name contains unsafe characters.

### Automated Package Updates

<details>
<summary>3 Dependabot updates</summary>

* build(deps-dev): bump webpack in /ui in the ui-node-deps group (b70132394)
* build(deps): bump taskcluster from 67.0.1 to 68.0.3 in /taskcluster (9ad8b9965)
* build(deps): bump golang.org/x/sys in the go-deps group (2d8e970a0)

</details>

## v68.0.3

### WORKER-DEPLOYERS

▶ [patch] [#7218](https://github.com/taskcluster/taskcluster/issues/7218)
Generic Worker Multiuser engine on Linux, macOS and FreeBSD now waits for the
required task user to be logged in to the console session, rather than waiting
for any user to be logged in, and then checking whether it is the anticipated
user. This subtle change in behaviour means that temporarily a different user
may be (or appear to be) logged into the console session without causing
Generic Worker to panic. It is hoped that this will reduce intermittent issues
where a different user appears to be logged in (such as gdm user on Linux)
since it is suspected that this might just be a fleeting login that passes due
to some race condition in the start up of the Gnome Desktop.

If this doesn't resolve the issue, and under certain circumstances, the gdm
user instead remains logged in, i.e. it is not a fleeting login, we may need to
restore the previous behaviour, since otherwise when the issue does occur, it
would take a full 5 minutes before timing out, adding to costs unnecessarily.
However, we hope that that will not be the case.

## v68.0.2

### WORKER-DEPLOYERS

▶ [patch] [#7012](https://github.com/taskcluster/taskcluster/issues/7012)
Generic Worker retains the interactive username it determines inside WaitForLoginCompletion (by returning it) to avoid needing to re-determine it later. The intention is to reduce intermittent errors caused by the underlying method to determine the interactive username itself intermittently failing. So long as the interactive username can be determined just once during the specidied timeout period, the value can be retained and used when required.

## v68.0.1

### GENERAL

▶ [patch] [#7172](https://github.com/taskcluster/taskcluster/issues/7172)
Fixes UI js error on dashboard on some deployments

### USERS

▶ [patch] [#6304](https://github.com/taskcluster/taskcluster/issues/6304)
GitHub service no longer skips CI based on PR description. It will only skip CI based on the PR title or the commit message, [as GitHub does](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/skipping-workflow-runs).

### Automated Package Updates

<details>
<summary>7 Dependabot updates</summary>

* build(deps-dev): bump the client-web-node-deps group across 1 directory with 3 updates (74c56a294)
* build(deps): bump the client-node-deps group across 1 directory with 4 updates (2f9e3602b)
* build(deps): bump the ui-node-deps group across 1 directory with 7 updates (e21bc7c47)
* build(deps): bump taskcluster-taskgraph in /taskcluster (65efa87a0)
* build(deps): bump pyyaml (74e680c54)
* build(deps): bump the go-deps group across 1 directory with 7 updates (c02a2eec9)
* build(deps): bump elliptic from 6.5.4 to 6.5.7 in /clients/client-web (00e31a477)

</details>

## v68.0.0

### GENERAL

▶ [patch] [#7202](https://github.com/taskcluster/taskcluster/issues/7202)
Fixes `github.renderTaskclusterYml` rendering error for the payloads including invalid params

▶ [patch] [#7195](https://github.com/taskcluster/taskcluster/issues/7195)
Fixes worker-manager intermittent test failure

▶ [patch] [bug 1907075](http://bugzil.la/1907075)
Web server graphql endpoints return 413 instead of 500 error.

▶ [patch]
Upgrades to Node.js v20.16.0, go v1.23.0, and yarn v4.4.0.

### DEPLOYERS

▶ [MAJOR] [#7036](https://github.com/taskcluster/taskcluster/issues/7036)
Secrets are being introduced in services configuration. All sensitive values that are marked as secrets would be deployed in kubernetes as Secrets (as they used to be).
All non-sensitive values would be stored inside ConfigMap resources.
Deployments and CronJobs would fetch values from both secrets and configuration maps.

▶ [patch] [#7167](https://github.com/taskcluster/taskcluster/issues/7167)
Change the polling period for EC2 spot instance interruption notices to 5 seconds, as recommended by AWS documentation.

### WORKER-DEPLOYERS

▶ [MAJOR] [#7073](https://github.com/taskcluster/taskcluster/issues/7073)
Generic Worker now logs to standard error instead of standard out. This is a bug fix, it seems it has always been logging to standard out.

▶ [minor]
Change `adduser` usage to `useradd`

`adduser` is a debian specific wrapper around `useradd` and friends. By
changing to `useradd`, we allow workers to be deployed on non debian
derivative distributions.

Generic Worker multiuser engine on Linux/FreeBSD now depends on:

  * /usr/bin/chfn
  * /usr/sbin/useradd
  * /usr/sbin/userdel

and no longer depends on:

  * /usr/sbin/adduser
  * /usr/sbin/deluser

### USERS

▶ [minor] [#7145](https://github.com/taskcluster/taskcluster/issues/7145)
Fixes inconsistency in the internal queue implementation that could lead to tasks being visible as pending in the UI
after they were resolved with `deadline-exceeded`.

▶ [patch] [#7128](https://github.com/taskcluster/taskcluster/issues/7128)
Generic Worker / D2G partial bug fix: support has been improved for running Docker Worker tasks with caches under Generic Worker. Previously, caches from a Docker Worker task running under Generic Worker containing files owned by a user other than root would not be owned by the same (container) user when the cache was mounted in a future task. D2G now consistently maps container uids and gids to host subuids and subgids (when caches are used) in order that cache file ownership, as seen from inside the container, is maintained across task runs. However, this fix does not apply when the privileged capability is enabled in the Docker Worker payload, since privileged tasks are executed under docker rather than podman. This fix only applies when podman is used.

▶ [patch] [#7128](https://github.com/taskcluster/taskcluster/issues/7128)
Generic Worker multiuser engine on Linux now uses `/usr/sbin/deluser --remove-home` instead of `/usr/sbin/deluser --remove-all-files` when deleting previous task users. This ensures that caches that may still be owned (in whole or in part) by the task user are not deleted.

### Automated Package Updates

<details>
<summary>5 Dependabot updates</summary>

* build(deps): bump elliptic from 6.5.4 to 6.5.7 in /ui (d3d895095)
* build(deps): bump braces from 3.0.2 to 3.0.3 in /clients/client-test (7fc112e28)
* build(deps): bump aiohttp from 3.9.5 to 3.10.2 in /taskcluster (84db9103c)
* build(deps): bump dependabot/fetch-metadata in the gh-actions-deps group (f57c0aa4d)
* build(deps): bump the node-deps group with 18 updates (5af31a687)

</details>

## v67.1.0

### WORKER-DEPLOYERS

▶ [patch] [#7073](https://github.com/taskcluster/taskcluster/issues/7073)
CLI tools and generic-worker now returns short-version string if executed with `--short-version` argument:

- `generic-worker --short-version`
- `livelog --short-version`
- `websocktunnel --short-version`
- `start-worker --short-version`
- `taskcluster version --short-version`

▶ [patch] [#7129](https://github.com/taskcluster/taskcluster/issues/7129)
Worker-manager would avoid sending emails with duplicate error messages, as long as error message and information are the same.

### USERS

▶ [minor] [#7139](https://github.com/taskcluster/taskcluster/issues/7139)
Generic Worker now sets environment variable `TASK_GROUP_ID` to the `taskGroupId` of the currently running task.

▶ [patch] [#7132](https://github.com/taskcluster/taskcluster/issues/7132)
Bug fix: Generic Worker multiuser on Linux/macOS was previously executing task
commands as processes that did not include the supplementary groups of the task
user, only its primary group. Until upgrading from Ubuntu 22.04 to Ubuntu 24.04
task users did not have supplementary groups, so this had no negative
consequences. However, `/usr/sbin/adduser` on Ubuntu 24.04 by default gives
newly generated users the supplementary group `users`, which introduced a
discrepency between the groups that the task command process was in, and the
groups that the user was in.  Generic Worker multiuser on Linux and macOS now
ensures that the launched processes of task commands are given not only the
primary group of the task user, but also any supplementary groups that it has.

### Automated Package Updates

<details>
<summary>3 Dependabot updates</summary>

* build(deps): bump the ui-node-deps group across 1 directory with 3 updates (b55fb4d50)
* build(deps-dev): bump chai-as-promised in /clients/client-web (0809b9ea8)
* build(deps): bump certifi from 2023.7.22 to 2024.7.4 in /taskcluster (c0fa41ae2)

</details>

## v67.0.1

### USERS

▶ [patch] [#7085](https://github.com/taskcluster/taskcluster/issues/7085)
Adds `timestamp` to the worker related pulse events that were added in #7085.

### DEVELOPERS

▶ [patch]
Switch CI to use Ubuntu 24.04

## v67.0.0

### USERS

▶ [MAJOR] [#7126](https://github.com/taskcluster/taskcluster/issues/7126)
d2g no longer includes `--privileged` in all generated `podman run` commands. This was previously introduced as a breaking change in release 61.0.0 (PR #6891) but has broken some tasks. The original reason for adding it (#6890) seems to no longer apply, as the original bug report is no longer reproducible. This therefore reverts the d2g treatment of the --privileged flag to how it was before release 61.0.0.

▶ [minor] [#7085](https://github.com/taskcluster/taskcluster/issues/7085)
Worker-manager publishes more events to new exchanges in Pulse:
- `worker-pool-error`
- `worker-requested`
- `worker-running`
- `worker-stopped`

▶ [patch] [#7120](https://github.com/taskcluster/taskcluster/issues/7120)
Removed memory, pid, and ulimits for d2g payloads.

### DEVELOPERS

▶ [patch]
Updated azure test certificates.

### OTHER

▶ Additional change not described here: [#7095](https://github.com/taskcluster/taskcluster/issues/7095).

### Automated Package Updates

<details>
<summary>20 Dependabot updates</summary>

* build(deps): bump the ui-node-deps group across 1 directory with 10 updates (b83e7dbe2)
* build(deps): bump markdown-it from 12.3.2 to 14.1.0 in /ui (99770261c)
* build(deps): bump react-codemirror2 from 7.3.0 to 8.0.0 in /ui (967f5f1fe)
* build(deps): bump the go-deps group with 7 updates (fdb61b7a4)
* build(deps): bump taskcluster from 65.1.0 to 66.0.0 in /taskcluster (15fe4fa58)
* build(deps): bump taskcluster-taskgraph in /taskcluster (e92ef7929)
* build(deps): bump ws from 8.5.0 to 8.17.1 in /workers/docker-worker (9604329d4)
* build(deps): bump the client-node-deps group across 1 directory with 3 updates (d614b4b68)
* build(deps): bump pug from 3.0.2 to 3.0.3 (f53a74456)
* build(deps): bump @octokit/plugin-retry from 3.0.9 to 7.1.1 (6ff6da85c)
* build(deps-dev): bump @testing-library/jest-dom in /ui (b5c00189f)
* build(deps): bump the node-deps group across 1 directory with 22 updates (0f93c1e59)
* build(deps-dev): bump the client-web-node-deps group across 1 directory with 2 updates (3ca58010d)
* build(deps): bump @grpc/grpc-js from 1.9.8 to 1.10.10 (ef3a2daa7)
* build(deps): bump braces from 3.0.2 to 3.0.3 (f2386f545)
* build(deps): bump urllib3 from 2.0.7 to 2.2.2 in /taskcluster (ad955c802)
* build(deps): bump braces from 3.0.2 to 3.0.3 in /clients/client (c918170cd)
* build(deps): bump braces from 3.0.2 to 3.0.3 in /workers/docker-worker (ae3cf638a)
* build(deps-dev): bump ws from 7.5.9 to 7.5.10 (6fea20c51)
* build(deps): bump taskcluster from 64.2.7 to 65.1.0 in /taskcluster (68fdee7ce)

</details>

## v66.0.0

### USERS

▶ [MAJOR] [#7082](https://github.com/taskcluster/taskcluster/issues/7082)
This change comprises three elements:

1. D2G now executes tasks under `docker` rather than `podman` if the Docker
   Worker task has the `privileged` capability enabled. This should result in
   fewer tasks failing due to differences in default behaviour between docker
   and podman privileged containers.
2. D2G generated task scopes are now sorted.
3. A bug has been fixed where D2G was granting scopes to generated tasks
   based on the declared capabilities of the Docker Worker task it was
   converting, rather than deriving the target Generic Worker scopes solely
   from the original Docker Worker task scopes. This allowed a task with
   insufficient scopes under Docker Worker to gain elevated privileges under
   Generic Worker.

## v65.4.0

### USERS

▶ [patch] [#7083](https://github.com/taskcluster/taskcluster/issues/7083)
Fixes query validation in pagination queries that were throwing `500 InternalServerError` instead of `400 InputError`

### DEVELOPERS

▶ [minor] [#7089](https://github.com/taskcluster/taskcluster/issues/7089)
Fixes an issue when cancelling a task didn't remove it from the pending queue.
This made worker-manager think there are more pending tasks than there actually were, and create more workers.

## v65.3.0

### GENERAL

▶ [patch]
Upgrades to node v20.14.0 and go1.22.4 (SECURITY release).

### DEPLOYERS

▶ [minor] [#7035](https://github.com/taskcluster/taskcluster/issues/7035)
Helm chart allows conditional deployment of several resource types:
- Secret
- ConfigMap
- Ingress
- ServiceAccount

This might be useful in the deployments that use custom Ingress or manage secrets and configs externally.
Example usage: `helm template --values .. --set "skipResourceTypes[0]"=ingress --set "skipResourceTypes[0]"=secert .`

### WORKER-DEPLOYERS

▶ [minor] [#7076](https://github.com/taskcluster/taskcluster/issues/7076)
Worker Runner now uses IMDSv2 instead of IMDSv1 in EC2. IMDSv1 is being phased out by Amazon.

### DEVELOPERS

▶ [patch] [#7080](https://github.com/taskcluster/taskcluster/issues/7080)
Fixes github service issue during cancellation of the previous runs that were not created.
Response code was not checked properly which resulted in sending same error for each new build.

▶ [patch] [#6668](https://github.com/taskcluster/taskcluster/issues/6668)
Fixes an issue to support yarn run for dev:start and dev:stop scripts

## v65.2.0

### USERS

▶ [minor] [#7070](https://github.com/taskcluster/taskcluster/issues/7070)
Generic Worker now sets the environment variable TASKCLUSTER_INSTANCE_TYPE in task commands to the instance type of the worker, if configured. This matches the (undocumented) behaviour of Docker Worker. D2G also passes this environment variable through to podman, to emulate Docker Worker's behaviour.

▶ [patch]
Fixes UI issue in worker view where error was shown despite worker being found.

▶ [patch] [#7059](https://github.com/taskcluster/taskcluster/issues/7059)
D2G now includes `libvirt` OS group in generated Generic Worker task payloads that use Docker Worker KVM device.

▶ [patch] [#6954](https://github.com/taskcluster/taskcluster/issues/6954)
Fixes an issue with github badges that timed out on non-existing branches.

▶ [patch]
Tasks using `notify.pulse.<topic>.on-<event>` routes now send out messages
using the specified topic. This means it's now possible to subscribe to
specific topics.

### DEVELOPERS

▶ [minor] [#5073](https://github.com/taskcluster/taskcluster/issues/5073)
Github service supports `issue_comment` events to trigger jobs through `/tasckluster param` comments in open Pull Requests.
`.taskcluster.yml` in default branch should allow this with `policy.allowComments: collaborators` value.
Tasks would be rendered with `tasks_for = "github-issue-comment"` and `event.taskcluster_comment = param`
This is an implementation of [RFC 168](https://github.com/taskcluster/taskcluster-rfcs/blob/main/rfcs/0168-Trigger-Tests-Based-on-PR-Comments.md)

▶ [patch] [#6567](https://github.com/taskcluster/taskcluster/issues/6567)
`yarn generate` commands will attempt to run `pg_dump` inside the docker container if local binary is missing or its version is different from the server version.

### Automated Package Updates

<details>
<summary>2 Dependabot updates</summary>

* build(deps): bump taskcluster-taskgraph (8daf19d4c)
* build(deps): bump the go-deps group with 4 updates (60ca4228f)

</details>

## v65.1.0

### USERS

▶ [minor] [#5967](https://github.com/taskcluster/taskcluster/issues/5967)
Allows Docker Worker payloads to be used on the `insecure` Generic Worker engine, translated by `d2g`.

## v65.0.2

### USERS

▶ [patch] [#7025](https://github.com/taskcluster/taskcluster/issues/7025)
Fixes JavaScript error in "Create Worker Pool" page that was introduced in the last release.
Adds link to "Errors" in workers navigation bar.

### Automated Package Updates

<details>
<summary>2 Dependabot updates</summary>

* --- updated-dependencies: - dependency-name: requests   dependency-type: indirect ... (42569ccb7)
* build(deps-dev): bump eslint from 8.57.0 to 9.3.0 in /clients/client-web (2bccd8b63)

</details>

## v65.0.1

### GENERAL

▶ [patch]
Upgrades to go1.22.3 (SECURITY release). Was supposed to be handled in PR #7006, but was accidentally left out.

## v65.0.0

### WORKER-DEPLOYERS

▶ [MAJOR] [#7017](https://github.com/taskcluster/taskcluster/issues/7017)
Generic Worker multiuser engine now places task directories under `/home`
(Linux and FreeBSD) and `/Users` on macOS. Previously it was placing them under
`/` by default on all three platforms, unless either `HOME` was set to a
non-standard value in the process launching Generic Worker multiuser engine, or
if `tasksDir` was explicitly set in Generic Worker config.

This is a bug fix, but due to being a significant change in behaviour, is being
released as a major change to trigger a major version bump.

### USERS

▶ [patch] [#6117](https://github.com/taskcluster/taskcluster/issues/6117)
Fixes Worker page when queue information was missing and error was displayed.
If worker-manager data exists for this worker, it would be displayed instead.

▶ [patch] [#6117](https://github.com/taskcluster/taskcluster/issues/6117)
Workers in UI use consistent navigation element that allows to switch between worker pool definition,
workers, pending and claimed tasks.

▶ [patch] [#6117](https://github.com/taskcluster/taskcluster/issues/6117)
Workers list page in UI shows "Worker Pool" link when it is available to improve navigation.

## v64.3.0

### GENERAL

▶ [patch]
Upgrades to node v20.13.0 and go1.22.3 (SECURITY release).

### WORKER-DEPLOYERS

▶ [minor] [#6979](https://github.com/taskcluster/taskcluster/issues/6979)
Generic Worker multiuser engine on Linux now sets environment variable`XDG_RUNTIME_DIR` to `/run/user/<UID>` in task command processes (unless Generic Worker config setting `runTasksAsCurrentUser` is set to `true`).

### USERS

▶ [patch] [bug 1768667](http://bugzil.la/1768667)
Adds Task Group link in UI for indexed tasks.
Introduces new route to redirect to the Task Group view: `/tasks/index/:namespace/:indexTask/task-group`

### Automated Package Updates

<details>
<summary>1 Dependabot updates</summary>

* build(deps): bump jinja2 from 3.1.3 to 3.1.4 in /taskcluster (8433f4b6e)

</details>

## v64.2.8



### Automated Package Updates

<details>
<summary>8 Dependabot updates</summary>

* build(deps): bump the node-deps group across 1 directory with 17 updates (7664993bf)
* build(deps): bump hawk in /clients/client in the client-node-deps group (676d3a034)
* build(deps): bump the client-web-node-deps group (1724b094a)
* build(deps): bump taskcluster in /taskcluster in the python-deps group (435162d2c)
* build(deps): bump dependabot/fetch-metadata in the gh-actions-deps group (7e8f35dc2)
* build(deps): bump taskcluster-taskgraph in /taskcluster (1d2a4cae0)
* build(deps): bump the go-deps group with 5 updates (45dbb1230)
* build(deps): bump ejs from 3.1.9 to 3.1.10 (d320208b2)

</details>

## v64.2.7

### WORKER-DEPLOYERS

▶ [patch] [#6983](https://github.com/taskcluster/taskcluster/issues/6983)
AWS provider correctly detects `InvalidInstanceID.NotFound` error and marks worker as stopped.

### USERS

▶ [patch] [#6987](https://github.com/taskcluster/taskcluster/issues/6987)
Generic Worker now checks if a graceful termination was requested from worker runner _before_ calling `queue.claimWork()`.

This helps fix a race condition where a preemption occurs right after Generic Worker starts up, but before the graceful termination handler to abort the task has been initialized.

### DEVELOPERS

▶ [patch] [#6984](https://github.com/taskcluster/taskcluster/issues/6984)
Github auto-cancel gracefully ignores missing task groups and doesn't log errors in github comments.
This can happen when decision task failed on previous runs.

▶ [patch] [#6761](https://github.com/taskcluster/taskcluster/issues/6761)
Switching from `googleapis` package to a smaller `@googleapis/*` libraries to reduce startup time and avoid loading APIs we don't use.

## v64.2.6

### WORKER-DEPLOYERS

▶ [patch] [#6972](https://github.com/taskcluster/taskcluster/issues/6972)
Generic Worker now uploads task payload artifacts in parallel to decrease graceful termination time in the event of a spot termination.

The `insecure` engine no longer performs a file copy command as the task user before the artifact upload process happens to help speed up the process.

Generic Worker (posix only) now tries to put an exclusive file lock on artifacts before upload to prevent the file from being written to by any other process. This is done in lieu of copying the file to a temporary location which was achieving the same thing. If putting the lock on the file fails, Generic Worker will fallback to copying the file.

### USERS

▶ [patch] [#6972](https://github.com/taskcluster/taskcluster/issues/6972)
Don't compress `.npz` artifacts by default in Generic Worker.

### Automated Package Updates

<details>
<summary>2 Dependabot updates</summary>

* build(deps): bump aiohttp from 3.9.2 to 3.9.4 in /taskcluster (c4737ab9b)
* build(deps): bump golang.org/x/net from 0.22.0 to 0.23.0 (95aa8bf85)

</details>

## v64.2.5

### GENERAL

▶ [patch]
Upgrades to Node.js v20.12.2 which is a [security release](https://nodejs.org/en/blog/vulnerability/april-2024-security-releases-2/).

### Automated Package Updates

<details>
<summary>6 Dependabot updates</summary>

* build(deps): bump idna from 3.4 to 3.7 in /taskcluster (2cd73d93a)
* build(deps): bump tar from 6.2.0 to 6.2.1 in /ui (254af1652)
* build(deps): bump tar from 6.2.0 to 6.2.1 in /clients/client (f8ddfbeb7)
* build(deps): bump tar from 6.2.0 to 6.2.1 (e1ff1fb14)
* build(deps): bump tar from 6.2.0 to 6.2.1 in /clients/client-test (3b9ec5c1a)
* build(deps): bump tar from 6.2.0 to 6.2.1 in /clients/client-web (f69bea143)

</details>

## v64.2.4

### WORKER-DEPLOYERS

▶ [patch] [#6900](https://github.com/taskcluster/taskcluster/issues/6900)
Worker Runner on Azure no longer sends a `graceful-termination` message if the scheduled event type is `Freeze`. It will continue to send the message for all other event types: `Reboot`, `Redeploy`, `Preempt`, and `Terminate`.

### USERS

▶ [patch] [#6957](https://github.com/taskcluster/taskcluster/issues/6957)
Improves performance of the `findTasksAtIndex` call (introduced in #6915)
that returns multiple tasks for a given list of namespaces and indexes.

## v64.2.3

### GENERAL

▶ [patch] [#6958](https://github.com/taskcluster/taskcluster/issues/6958)
Worker Manager now only applies GCP disk labels to `PERSISTENT` disk types.

This fixes an issue in v64.2.2 where `initializeParams.labels` was being set on all disk types and caused GCP to error on local SSDs (`SCRATCH` type disks).

## v64.2.2

### GENERAL

▶ [patch]
Upgrades to go1.22.2 and Node.js 20.12.1 which are both security releases.

### DEPLOYERS

▶ [patch] [#6946](https://github.com/taskcluster/taskcluster/issues/6946)
Worker-manager properly attaches disk labels for GCP provider.

### USERS

▶ [patch] [#6945](https://github.com/taskcluster/taskcluster/issues/6945)
Fix schema styles in documentation - links are properly highlighted.

## v64.2.1

### GENERAL

▶ [patch]
Upgrades rust version to 1.77.1 and ran `cargo audit fix` to fix insecure crates.

▶ [patch]
Upgrades to Node.js v20.12.0

### Automated Package Updates

<details>
<summary>7 Dependabot updates</summary>

* build(deps-dev): bump github-slugger from 1.5.0 to 2.0.0 (775124f00)
* build(deps): bump the node-deps group with 17 updates (fa332f0e2)
* build(deps): bump the gh-actions-deps group with 1 update (14f6bb0fd)
* build(deps): bump taskcluster from 62.0.0 to 64.2.0 in /taskcluster (b751b1dd3)
* build(deps): bump the python-deps group in /taskcluster with 1 update (c0ae44ba8)
* build(deps-dev): bump the client-node-deps group (bed1c9ac1)
* build(deps-dev): bump the client-web-node-deps group (ad42d82be)

</details>

## v64.2.0

### WORKER-DEPLOYERS

▶ [patch] [#6802](https://github.com/taskcluster/taskcluster/issues/6802)
Worker Runner no longer polls the metadata service for the Google provider. Instead, we've added `?wait_for_change=true` to the endpoint to perform a hanging GET request that'll return as soon as the metadata has changed and the VM has been preempted.

### USERS

▶ [minor]
Remove maxRunTime limitations for docker payloads in generic worker (d2g)

### Automated Package Updates

<details>
<summary>2 Dependabot updates</summary>

* build(deps): bump express from 4.18.2 to 4.19.2 in /ui (25af6aa6b)
* build(deps): bump express from 4.18.3 to 4.19.2 (ccf689497)

</details>

## v64.1.2

### USERS

▶ [patch] [#6928](https://github.com/taskcluster/taskcluster/issues/6928)
D2G no longer adds `--cap-add=SYS_PTRACE` for the docker worker `allowPtrace` feature since all capabilities are already added with the `--privileged` flag being passed to all D2G commands as of #6890.

## v64.1.1

No changes

## v64.1.0

### USERS

▶ [minor]
The index now exposes a `findTasksAtIndexes` endpoint to batch task index requests

▶ [minor]
The queue now exposes `tasks` and `statuses` to batch task requests

▶ [patch]
Action tasks now work correctly for task groups created by another action task.

## v64.0.0

### WORKER-DEPLOYERS

▶ [MAJOR]
The Docker Worker binary is no longer built during releases. The most recent Docker Worker binary can be found [here](https://github.com/taskcluster/taskcluster/releases/download/v62.0.0/docker-worker-x64.tgz).

## v63.0.0

### GENERAL

▶ [minor]
Upgrades to Node.js LTS v20.

### DEVELOPERS

▶ [MAJOR]
Upgrades client-node library to ESModules and upgrades `got` library

▶ [patch]
Upgrades to yarn v4.1.1

### Automated Package Updates

<details>
<summary>8 Dependabot updates</summary>

* build(deps-dev): bump the client-web-node-deps group (ba901ba05)
* build(deps-dev): bump qlobber from 5.0.3 to 8.0.1 (28f2869aa)
* build(deps): bump follow-redirects from 1.15.4 to 1.15.6 in /ui (e39d63567)
* build(deps): bump follow-redirects from 1.15.4 to 1.15.6 (a7c78f0f8)
* build(deps): bump follow-redirects in /clients/client-web (103febfe8)
* build(deps): bump follow-redirects in /clients/client-test (d2b3288b2)
* build(deps): bump follow-redirects in /clients/client (c903e7de6)
* build(deps): bump taskcluster from 60.4.2 to 62.0.0 in /taskcluster (04df8aedd)

</details>

## v62.0.0

### WORKER-DEPLOYERS

▶ [MAJOR] [#6832](https://github.com/taskcluster/taskcluster/issues/6832)
The Generic Worker `simple` engine has been renamed to the `insecure` engine.

All future release binaries for this engine will also be renamed (e.g. `generic-worker-simple-darwin-arm64` --> `generic-worker-insecure-darwin-arm64`), so please update any scripts that reference the `simple` engine binary.

This change was made to help make it extremely apparent that it should not be used in production environments and is only recommened for testing and development.

## v61.0.0

### GENERAL

▶ [patch]
Generic Worker now utilizes `filepath.WalkDir` instead of `filepath.Walk`.

`filepath.WalkDir` was introduced in go1.16 and is more performant and efficient over `filepath.Walk`.

This _may_ help with race conditions during artifact uploads, where a file was initially seen, but then became unavailable at upload time.

▶ [patch]
Upgrades to go1.22.1 which is a [security release](https://go.dev/doc/devel/release#go1.22.1).

### USERS

▶ [MAJOR] [#6881](https://github.com/taskcluster/taskcluster/issues/6881)
Google cloud workers spawned by Worker Manager now have `workerGroup` set to
the Google Cloud _Zone_ (e.g. `us-east1-d`) rather than the Google Cloud
_Region_ (e.g. `us-east1`). This makes it easier to issue api requests against
an instance, e.g. `gcloud compute instances delete <workerId>
--zone=<workerGroup>`.

▶ [patch] [#6890](https://github.com/taskcluster/taskcluster/issues/6890)
D2G now always passes `--privileged` to the generated `podman run` command.
Without this option, some tasks that ran successfully under Docker Worker,
including tasks without Docker Worker capabilities, would not run correctly
under Generic Worker. Please note, this only elevates the privileges inside the
podman container, which runs as the task user on the host. The privileges
inside the container are still limited to the host privileges of the task user.

▶ [patch]
Generic Worker now correctly reports the Worker Pool ID when an interactive task is attempted on a worker pool with the interactive feature disabled. Previously the task log would report the Worker Pool ID in the `exception/malformed-payload` task run as `<workerGroup>/<workerType>`; now it correctly reports it as `<provisionerId>/<workerType>`. The Interactive feature is considered disabled when Generic Worker config setting `enableInteractive` is either absent or explicitly set to `false` in the Generic Worker config.

### DEVELOPERS

▶ [patch]
Upgrades internal references library to use async fs operations to make upcoming node20 upgrade easier.

### Automated Package Updates

<details>
<summary>7 Dependabot updates</summary>

* build(deps): bump jose from 2.0.6 to 2.0.7 (f2bd071dc)
* build(deps): bump the deps group in /ui with 6 updates (ac2bb66ba)
* build(deps-dev): bump the deps group in /clients/client with 2 updates (36fac2a12)
* build(deps): bump taskcluster-client-web from 44.21.0 to 60.4.2 in /ui (7b79a3eb1)
* build(deps): bump the deps group with 6 updates (ee709aab4)
* build(deps): bump the deps group in /taskcluster with 2 updates (c02ca5469)
* build(deps): bump the deps group with 25 updates (0cd5033f5)

</details>

## v60.4.2

### USERS

▶ [patch]
Fixes graphql validation rules for hooks groups query.

▶ [patch] [#6864](https://github.com/taskcluster/taskcluster/issues/6864)
D2G now passes `--privileged` flag to the generated `podman run` command when
Docker Worker payload enables device capability `hostSharedMemory`.  Without
this option, the podman container could not successfully access the shared
memory, despite the inclusion of argument `--device=/dev/shm`. With both
arguments present (`--privileged` and `--device=/dev/shm`), shared memory now
appears to be available inside the podman container.

### Automated Package Updates

<details>
<summary>3 Dependabot updates</summary>

* build(deps): bump mitt from 2.1.0 to 3.0.1 in /ui (280678fc9)
* build(deps): bump ip from 2.0.0 to 2.0.1 in /clients/client-web (be7836a3c)
* build(deps): bump markdown-it-link-attributes from 3.0.0 to 4.0.1 in /ui (008b3fe0a)

</details>

## v60.4.1

### USERS

▶ [patch]
Fix docker worker interactive shell UI rows/cols settings.

▶ [patch] [#6836](https://github.com/taskcluster/taskcluster/issues/6836)
Upgrades graphql server and client libraries to graphql 16.8

▶ [patch] [#6836](https://github.com/taskcluster/taskcluster/issues/6836)
Upgrades graphql to 16.8.1 in ui

### Automated Package Updates

<details>
<summary>1 Dependabot updates</summary>

* build(deps): bump es5-ext from 0.10.62 to 0.10.64 (485a491c2)

</details>

## v60.4.0

### USERS

▶ [minor] [#6845](https://github.com/taskcluster/taskcluster/issues/6845)
D2G now provides support for the (discontinued) disableSeccomp capability which was removed from Docker Worker, but was still used by the bugmon fuzzing project in the Community taskcluster environment. This was added to ease the migration path of this project from Docker Worker to Generic Worker.

▶ [patch] [#6848](https://github.com/taskcluster/taskcluster/issues/6848)
Fix an issue where an interactive session would close up when the shell would output invalid UTF-8.

▶ [patch] [#6850](https://github.com/taskcluster/taskcluster/issues/6850)
Add a proper TERM environment variable to interative sessions. This helps with some ncurses apps and tmux for example.

### OTHER

▶ Additional change not described here: [#6852](https://github.com/taskcluster/taskcluster/issues/6852).

### Automated Package Updates

<details>
<summary>4 Dependabot updates</summary>

* build(deps): bump ip from 2.0.0 to 2.0.1 (34cb19df2)
* build(deps): bump ip from 1.1.5 to 1.1.9 in /ui (98d1c2c37)
* build(deps): bump ip from 2.0.0 to 2.0.1 in /clients/client-test (360fdb2af)
* build(deps): bump ip from 2.0.0 to 2.0.1 in /clients/client (19094b0d6)

</details>

## v60.3.5

### GENERAL

▶ [patch]
Switched to use `math/rand/v2` ([new in go1.22](https://tip.golang.org/doc/go1.22#math_rand_v2)), removed [deprecated](https://pkg.go.dev/golang.org/x/sys@v0.16.0/windows#OpenCurrentProcessToken) call to `windows.OpenCurrentProcessToken()`, fixed `staticcheck` errors, and added a `staticcheck` GitHub actions workflow for our repo.

▶ [patch]
Upgrades to node v18.19.1, which is a [security release](https://nodejs.org/en/blog/vulnerability/february-2024-security-releases/).

### DEPLOYERS

▶ [patch]
Kubernetes lifecycle timeouts correctly set to avoid having 502s.

### USERS

▶ [patch] [#6795](https://github.com/taskcluster/taskcluster/issues/6795)
Fixes "Raw Log" button in UI that can point to an expired artifact.

## v60.3.4

### GENERAL

▶ [patch]
Upgrades to go1.22.0

### USERS

▶ [patch] [#6820](https://github.com/taskcluster/taskcluster/issues/6820)
Fixes scope view in the UI. Search by scope shows roles and clients that use given scope.

### Automated Package Updates

<details>
<summary>1 Dependabot updates</summary>

* build(deps): bump the deps group with 1 update (ecf946205)

</details>

## v60.3.3

### DEVELOPERS

▶ [patch]
Upgrades to yarn v4.1.0

### Automated Package Updates

<details>
<summary>5 Dependabot updates</summary>

* build(deps-dev): bump the deps group in /ui with 3 updates (319f484a6)
* build(deps): bump taskcluster from 59.2.0 to 60.3.2 in /taskcluster (cde9bb384)
* build(deps): bump the deps group in /taskcluster with 1 update (35e1bf6fb)
* build(deps): bump the deps group with 4 updates (87b4265a4)
* build(deps-dev): bump the deps group in /clients/client with 1 update (8944d3619)

</details>

## v60.3.2

### WORKER-DEPLOYERS

▶ [patch]
Worker Runner now checks for termination notice when starting the Google provider.

When Worker Runner runs, the instance may already be scheduled to be shutdown. So on Google provider startup, we now check for this case.

This functionality mimics what's already in place for AWS.

This change also decreases the time Worker Runner checks to see if the instance is scheduled to be shutdown from 30 seconds to 15 seconds on the Google and Azure providers, as they each have a 30 second notice before a hard-shutdown Google: https://cloud.google.com/compute/docs/instances/spot#preemption-process Azure: https://learn.microsoft.com/en-us/azure/virtual-machines/spot-vms.

### USERS

▶ [patch] [#6801](https://github.com/taskcluster/taskcluster/issues/6801)
Fixes a bug in notify service where multiple messages to the same channel were not sent.
Adds `204` status code to the email, matrix, pulse, slack endoints when message was detected to be duplicate and was not sent.

▶ [patch] [#6793](https://github.com/taskcluster/taskcluster/issues/6793)
D2G will now ensure that tasks whose max run time is exceeded still have the chance to publish artifacts.
This means that Docker Worker tasks definitions that are run under Generic Worker and are aborted due to
hitting the max run time should still publish the artifacts from the aborted docker container they ran in.

▶ [patch] [#6798](https://github.com/taskcluster/taskcluster/issues/6798)
Generic Worker now includes the original Docker Worker task definition in the chain of trust certificate, if the task payload is a Docker Worker task payload. Previously, it was including the internal Generic Worker representation of the task definition.

▶ [patch]
The Task Creator now defaults to a task that only takes 1 minute to run instead of 10 mins, to redue resource consumption. Tutorials updated to reflect change.

### Automated Package Updates

<details>
<summary>1 Dependabot updates</summary>

* build(deps): bump aiohttp from 3.9.0 to 3.9.2 in /taskcluster (c7f9d9250)

</details>

## v60.3.1

### USERS

▶ [patch] [#6789](https://github.com/taskcluster/taskcluster/issues/6789)
Generic Worker no longer modifies task scopes passed to Taskcluster Proxy.
Previously there was a bug where Taskcluster Proxy would be passed the
d2g-modified scopes by Generic Worker rather than the original task scopes from
the task definition of the `queue.claimWork` response body. If the task was not
also explicitly assigned the required generic-worker scopes, this would result
in HTTP 401 errors from Taskcluster Proxy calls.

This has now been fixed, so that it is sufficient for tasks with a Docker
Worker payload to contain only Docker Worker scopes, not have the associated
generic-worker scopes, yet still work under Generic Worker and use the
Taskcluster Proxy feature without causing HTTP 401 errors.

## v60.3.0

### GENERAL

▶ [patch]
Generic Worker now copies archives to the task user's directory before unarchiving.

### WORKER-DEPLOYERS

▶ [minor] [#6785](https://github.com/taskcluster/taskcluster/issues/6785)
Generic Worker now exits with exit code 82 if the chain of trust key is missing.

## v60.2.0

### GENERAL

▶ [patch]
Go upgrade to 1.21.6.

>go1.21.6 (released 2024-01-09) includes fixes to the compiler, the runtime, and the crypto/tls, maps, and runtime/pprof packages. See the [Go 1.21.6 milestone](https://github.com/golang/go/issues?q=milestone%3AGo1.21.6+label%3ACherryPickApproved) on our issue tracker for details.

### WORKER-DEPLOYERS

▶ [minor]
Generic Worker: adds `unarchive` subcommand to the `generic-worker` binary.

### USERS

▶ [minor] [#6720](https://github.com/taskcluster/taskcluster/issues/6720)
The taskcluster UI now shows errors when an action's input does not match the `action.schema`

## v60.1.3

### GENERAL

▶ [patch] [#6235](https://github.com/taskcluster/taskcluster/issues/6235)
Migrates to aws sdk v3.

## v60.1.2

### USERS

▶ [patch] [#6563](https://github.com/taskcluster/taskcluster/issues/6563)
Ensure livelog and interactive tasks tunnels work after a websocktunnel restart.

## v60.1.1

### USERS

▶ [patch] [#6775](https://github.com/taskcluster/taskcluster/issues/6775)
Fixed error messages not being displayed on Pending/Claimed tasks pages in case scopes were missing.

## v60.1.0

### WORKER-DEPLOYERS

▶ [patch] [#6779](https://github.com/taskcluster/taskcluster/issues/6779)
Interactive feature data race fixed, whereby an error could cause a concurrent read and write of process state in different go routines.

### USERS

▶ [minor] [bug 1874568](http://bugzil.la/1874568)
Fixes token expiry issue for Auth0 login strategy that was not refetched.

▶ [patch] [#6495](https://github.com/taskcluster/taskcluster/issues/6495)
Improve changelog rendering in UI

### DEVELOPERS

▶ [patch]
Added helper script to make it easier to run websocktunnel locally.

### Automated Package Updates

<details>
<summary>1 Dependabot updates</summary>

* build(deps): bump jinja2 from 3.1.2 to 3.1.3 in /taskcluster (c97cf83aa)

</details>

## v60.0.1

### GENERAL

▶ [patch] [#6762](https://github.com/taskcluster/taskcluster/issues/6762)
Generic Worker: Tasks internally translated by D2G will add exit code 128 to the retry exit status array for retrying on an intermittent docker image pull issue.

### Automated Package Updates

<details>
<summary>5 Dependabot updates</summary>

* build(deps): bump follow-redirects from 1.14.8 to 1.15.4 in /ui (d0f85465b)
* build(deps): bump follow-redirects in /clients/client (fdf26413e)
* build(deps): bump follow-redirects from 1.15.3 to 1.15.4 (77c73c527)
* build(deps): bump follow-redirects in /clients/client-test (1465e064d)
* build(deps): bump follow-redirects in /clients/client-web (924ecbb91)

</details>

## v60.0.0

### GENERAL

▶ [patch]
Generic Worker: No longer logs out the redirect URL for the interactive shell feature since they are signed.

### DEPLOYERS

▶ [MAJOR] [#6759](https://github.com/taskcluster/taskcluster/issues/6759)
Kubernetes pods use liveness probe instead of unconditionally killing containers daily.

▶ [patch] [#6641](https://github.com/taskcluster/taskcluster/issues/6641)
Worker-manager no longer counts "stopping" instances as part of the existing capacity when estimating the number of workers to start (although they are still counted towards maxCapacity).

### Automated Package Updates

<details>
<summary>7 Dependabot updates</summary>

* build(deps-dev): bump markdown-table from 2.0.0 to 3.0.3 (979bdebbe)
* build(deps): bump the deps group in /ui with 5 updates (d1b5aedaf)
* build(deps): bump taskcluster from 58.0.2 to 59.2.0 in /taskcluster (dcb3409ae)
* build(deps): bump the deps group with 7 updates (3381ad533)
* build(deps): bump the deps group with 1 update (497c11ff6)
* build(deps): bump the deps group in /taskcluster with 1 update (156da5e47)
* build(deps): bump github/codeql-action from 2 to 3 (1d9788a67)

</details>

## v59.2.0

### USERS

▶ [minor] [#6671](https://github.com/taskcluster/taskcluster/issues/6671)
Several UI changes:
- pending and claimed tasks can be seen in UI
- worker manager errors center and overview
- navigation improvements

### Automated Package Updates

<details>
<summary>1 Dependabot updates</summary>

* build(deps): bump golang.org/x/crypto from 0.16.0 to 0.17.0 (fac49b217)

</details>

## v59.1.3

No changes

## v59.1.2

### GENERAL

▶ [patch]
Generic Worker docker image needs to be based off of ubuntu:jammy for now, can't be alpine.

▶ [patch]
Use alpine base images for generic worker dockerfile and for fetching latest certs for livelog and taskcluster proxy docker images.

### WORKER-DEPLOYERS

▶ [patch] [#6739](https://github.com/taskcluster/taskcluster/issues/6739)
Generic Worker: Updates `--help` text to include missing exit codes (76, 79, and 80).

## v59.1.1

### GENERAL

▶ [patch] [#6733](https://github.com/taskcluster/taskcluster/issues/6733)
Generic Worker: fixes `file-not-readable-on-worker` error while uploading artifacts with the simple engine.

▶ [patch]
Upgrades to go1.21.5 and Node 18.19.0.

## v59.1.0

### GENERAL

▶ [minor] [bug 1858424](http://bugzil.la/1858424)
Generic Worker: ensure task user has access to the mount location specified.

Generic Worker: Add `create-file` and `create-dir` subcommands to `generic-worker` intended for internal use during task execution.

### USERS

▶ [patch] [#6688](https://github.com/taskcluster/taskcluster/issues/6688)
The hooks list table now displays the timestamp of each hook's latest created task.

## v59.0.1

### DEPLOYERS

▶ [patch] [#6716](https://github.com/taskcluster/taskcluster/issues/6716)
Adds lifecycle preStop hook for services to allow graceful termination of pods in kubernetes without loss of connections.

▶ [patch] [#6716](https://github.com/taskcluster/taskcluster/issues/6716)
Fix kubernetes deployment configuration - `lifecycle` was misplaced.

## v59.0.0

### DEPLOYERS

▶ [MAJOR] [#5514](https://github.com/taskcluster/taskcluster/issues/5514)
Removes postgres v11 support.

▶ [minor] [#6716](https://github.com/taskcluster/taskcluster/issues/6716)
Services now support graceful server termination by listening to `SIGTERM` and letting existing connections to be served while rejecting new connections.

### Automated Package Updates

<details>
<summary>6 Dependabot updates</summary>

* bump the deps group in /ui with 21 updates (9a5f92ace)
* build(deps): bump the deps group with 14 updates (2c4e72139)
* build(deps-dev): bump the deps group in /clients/client with 1 update (7d6e6cb72)
* build(deps): bump taskcluster from 57.0.1 to 58.0.2 in /taskcluster (6cdb51eab)
* build(deps): bump the deps group with 8 updates (6eff15e94)
* build(deps): bump aiohttp from 3.8.6 to 3.9.0 in /taskcluster (cf9985828)

</details>

## v58.0.2

### GENERAL

▶ [patch] [#6701](https://github.com/taskcluster/taskcluster/issues/6701)
Generic Worker: Fixes `permission denied` error while checking if `generic-worker` binary is executable by the task user for simple engine.

▶ [patch]
Upgrades rust version to 1.74.0 and ran `cargo audit fix` to fix insecure crates.

### Automated Package Updates

<details>
<summary>1 Dependabot updates</summary>

* build(deps): bump slugid from 4.0.0 to 5.0.1 in /clients/client (947e00ba6)

</details>

## v58.0.1

### GENERAL

▶ [patch]
Generic Worker: Adds validation that the task user is able to read and execute the generic-worker binary on startup of the worker. If the task user is not able to read and execute the binary, the worker will exit with exit code 69, internal error.

### USERS

▶ [patch] [#4998](https://github.com/taskcluster/taskcluster/issues/4998)
This fixes a bug in the Python client where an exception was raised on 300 HTTP
status.

## v58.0.0

### GENERAL

▶ [MAJOR] [bug 1855653](http://bugzil.la/1855653)
Generic Worker: The `generic-worker` binary _must be_ readable and executable by the task user. If it's not, artifact uploads _will fail_.

Generic Worker: Add `copy-to-temp-file` subcommand to `generic-worker` to copy a file (`--copy-file`) to a temporary file.

▶ [patch] [#6671](https://github.com/taskcluster/taskcluster/issues/6671)
Introduces `workerManager.workerPoolErrorStats()` to return total number of errors for any worker pool or all worker pools.
Stats are split into totals by day, hour, kind of error and error code.
Worker Pool errors are kept in db for 7 days.

▶ [patch]
Removes compatibility columns in refactored queue tables that were used during migration for backward-compatibility purposes.

▶ [patch] [#6682](https://github.com/taskcluster/taskcluster/issues/6682)
Tweaking `server.keepAliveTimeout` to fix downstream errors in reverse proxy and load balancer.
Default node's http server keepAliveTimeout is 5s which might be an issue when working behind a reverse proxy which has bigger timeouts.
To reduce number of `502` errors, application's keep alive timeout should be larger than the one of the reverse proxy,
and that in turn, should be larger than the Load Balancer's one.

▶ [patch]
Upgrades to go1.21.4 and node 18.18.2.

### WORKER-DEPLOYERS

▶ [patch] [bug 1859323](http://bugzil.la/1859323)
Generic Worker now reports the full path of tasks-resolved-count.txt, next-task-user.json and current-task-user.json in worker logs.

### Automated Package Updates

<details>
<summary>3 Dependabot updates</summary>

* build(deps): bump aiohttp from 3.8.5 to 3.8.6 in /taskcluster (cfd8296cf)
* build(deps): bump @babel/traverse from 7.13.13 to 7.23.2 in /ui (ea440855c)
* build(deps-dev): bump the deps group in /clients/client with 1 update (575193ad7)

</details>

## v57.1.0

### GENERAL

▶ [minor] [#2939](https://github.com/taskcluster/taskcluster/issues/2939)
Introduces `queue.listPendingTasks(taskQueueId)` and `queue.listClaimedTasks(taskQueueId)`.
Those endpoints return a list of tasks that are currently pending or claimed by workers.

New scopes introduced for those endpoints:
- `queue:pending-list:<taskQueueId>`
- `queue:claimed-list:<taskQueueId>`

▶ [patch] [#6656](https://github.com/taskcluster/taskcluster/issues/6656)
D2G now shell escapes environment variable key names in case they contain spaces or special characters that would previously mess up the `podman run...` command.

### Automated Package Updates

<details>
<summary>3 Dependabot updates</summary>

* build(deps-dev): bump the deps group (ef65976fe)
* build(deps): bump taskcluster from 55.3.2 to 57.0.1 in /taskcluster (dfbcf2cac)
* build(deps): bump the deps group with 3 updates (79ce5c89b)

</details>

## v57.0.1

### GENERAL

▶ [patch]
Expired azure test certificates updated

▶ [patch]
Fix hooks UI page "unknown" task state error.

▶ [patch] [#6636](https://github.com/taskcluster/taskcluster/issues/6636)
Fix Dockerfile from PR #6646. The `.yarn` directory does not exist anymore, so it shouldn't be copied.

### DEVELOPERS

▶ [patch] [#6636](https://github.com/taskcluster/taskcluster/issues/6636)
Upgrades to modern Yarn version 4.

To enable on your machine:

```bash
corepack enable
```

## v57.0.0

### GENERAL

▶ [patch] [#6644](https://github.com/taskcluster/taskcluster/issues/6644)
Fixes __version__ endpoint in web-server

▶ [patch] [#6634](https://github.com/taskcluster/taskcluster/issues/6634)
Fixes `queue.claimWork` endpoint returning `500` in some rare conditions.

### USERS

▶ [minor] [#6371](https://github.com/taskcluster/taskcluster/issues/6371)
D2G tool now can convert an entire Docker Worker task definition to a Generic Worker task definition.

New `taskcluster d2g -h` output:

```bash
Converts a docker-worker payload (JSON) to a generic-worker payload (JSON).
To convert a task definition (JSON), you must use the task definition flag (-t, --task-def).

Usage:
  taskcluster d2g [flags]

Examples:
  taskcluster d2g -f /path/to/input/payload.json
  taskcluster d2g -t -f /path/to/input/task-definition.json
  cat /path/to/input/payload.json | taskcluster d2g
  cat /path/to/input/task-definition.json | taskcluster d2g -t
  echo '{"image": "ubuntu", "command": ["bash", "-c", "echo hello world"], "maxRunTime": 300}' | taskcluster d2g

Flags:
  -f, --file string   Path to a .json file containing a docker-worker payload or task definition.
  -h, --help          help for d2g
  -t, --task-def      Must use if the input is a docker-worker task definition.

Global Flags:
  -v, --verbose   verbose output
```

▶ [patch]
Hooks last fires display `unknown` as task state if task is missing or not scheduled. This can happen with task was expired and removed but last run information still exist.

▶ [patch] [#6472](https://github.com/taskcluster/taskcluster/issues/6472)
D2G: Add the `kvm` OS group to the Generic Worker payload if the KVM device is enabled in the Docker Worker payload.

▶ [patch]
docker-worker: fix error message when a task is missing scopes for cache volumes

### DEVELOPERS

▶ [MAJOR] [#4260](https://github.com/taskcluster/taskcluster/issues/4260)
Javascript codebase converted to use ECMAScript modules (ESM).
This includes `db`, `libraries/*`, `services/*` and `infrastructure/tooling/*` folders.

Clients remain unchanged.

▶ [patch]
Introduces helper databaes utilities to create new version (migration) and renumber existing.

`yarn db:new` creates new db migration and test
`yarn db:renumber old new` renumbers existing version

▶ [patch]
Move docker compose image names to `.env` file to keep compose files unchanged between releases.

### OTHER

▶ Additional change not described here: [#6621](https://github.com/taskcluster/taskcluster/issues/6621).

### Automated Package Updates

<details>
<summary>4 Dependabot updates</summary>

* build(deps): bump browserify-sign from 4.2.1 to 4.2.2 in /ui (bc0ca946e)
* build(deps): bump browserify-sign in /clients/client-web (140940e03)
* build(deps): bump crypto-js from 4.1.1 to 4.2.0 in /ui (1b8caf495)
* build(deps): bump crypto-js from 4.1.1 to 4.2.0 in /clients/client-web (49f381675)

</details>

## v56.0.3

### USERS

▶ [patch] [#6616](https://github.com/taskcluster/taskcluster/issues/6616)
Github service no longer cancels builds for the same SHA for `push` events.
Only `pull_request` events would cancel running builds for the same pull request if they exist.

This is to avoid canceling same commit pushed to different branches.

▶ [patch]
Allow specifying `0` as a value for `onExitStatus.purgeCaches`.

### Automated Package Updates

<details>
<summary>2 Dependabot updates</summary>

* build(deps): bump @babel/traverse in /clients/client-web (c19726417)
* build(deps): bump urllib3 from 2.0.6 to 2.0.7 in /taskcluster (54593c4ae)

</details>

## v56.0.2

### GENERAL

▶ [patch] [#2940](https://github.com/taskcluster/taskcluster/issues/2940)
Fixes claimed task resolver db query that returned too many records. Bug introduced in migration 91

▶ [patch] [#2940](https://github.com/taskcluster/taskcluster/issues/2940)
Patches existing migration to prevent data loss because of incorrect field values.

▶ [patch]
Upgrades to go1.21.3 and node v18.18.1

### Automated Package Updates

<details>
<summary>1 Dependabot updates</summary>

* build(deps): bump golang.org/x/net from 0.15.0 to 0.17.0 (a2da524f6)

</details>

## v56.0.1

### GENERAL

▶ [patch] [#2940](https://github.com/taskcluster/taskcluster/issues/2940)
Patches 91-migration script to account for non-unique pending tasks. This was a blocking exception during migration time.

## v56.0.0

### GENERAL

▶ [MAJOR] [#2940](https://github.com/taskcluster/taskcluster/issues/2940)
Queue service internals refactored. `azure_queue_messages` table and `azqueue` library are no longer used.
Claim, resolved, deadline and pending queues now use separate tables. Existing messages are preserved during migration.
Database migration `0091` expects that previous `0090` migration was applied and there are no pending tasks that didn't migrate to the new format yet.
Make sure that `v55.3.x` was deployed first and data was fully migrated before deploying this version.

▶ [patch] [#2940](https://github.com/taskcluster/taskcluster/issues/2940)
Resolved tasks do not drop deadline messages, which was removed during queue refactoring.
Messages will stay until task deadline even if task is being resolved.

▶ [patch]
Upgrades to go1.21.2

### USERS

▶ [patch]
UI: Task Definitions and Payloads now display in YAML by default for readability.

### Automated Package Updates

<details>
<summary>1 Dependabot updates</summary>

* build(deps): bump postcss from 8.4.21 to 8.4.31 (ec421c290)

</details>

## v55.3.4

### GENERAL

▶ [patch]
Patches an issue in github service cancelling task groups for non-push/pull-request events

### Automated Package Updates

<details>
<summary>1 Dependabot updates</summary>

* build(deps): bump urllib3 from 2.0.3 to 2.0.6 in /taskcluster (928877aeb)

</details>

## v55.3.3

### USERS

▶ [patch] [#6592](https://github.com/taskcluster/taskcluster/issues/6592)
Generic Worker no longer allows you to specify the same group twice in the osGroups array property.

▶ [patch] [#6590](https://github.com/taskcluster/taskcluster/issues/6590)
Generic Worker osGroups feature on Linux has been fixed. It never worked on this platform.

▶ [patch] [#6471](https://github.com/taskcluster/taskcluster/issues/6471)
Worker Runner now sets the `TASKCLUSTER_WORKER_LOCATION` variable for Generic Worker.

### Automated Package Updates

<details>
<summary>5 Dependabot updates</summary>

* build(deps): bump get-func-name from 2.0.0 to 2.0.2 in /ui (13cd8dd71)
* build(deps): bump the deps group with 4 updates (89c59ee11)
* build(deps-dev): bump webpack in /clients/client-web (d165b6200)
* build(deps-dev): bump the deps group (10f5744ea)
* build(deps): bump the deps group in /taskcluster with 3 updates (acd7144b7)

</details>

## v55.3.2

### GENERAL

▶ [patch] [#6498](https://github.com/taskcluster/taskcluster/issues/6498)
Github service auto cancels previous builds by default now.
This behavior can be disabled by setting `autoCancelPreviousChecks` to `false` in the `.taskcluster.yml` file.

### OTHER

▶ Additional change not described here: [#6571](https://github.com/taskcluster/taskcluster/issues/6571).

## v55.3.1

### GENERAL

▶ [patch] [#6564](https://github.com/taskcluster/taskcluster/issues/6564)
Fixes CSP related issue with running single UI container locally `docker compose ui`. If run with shipped nginx.conf, it would not be able to load some resources correctly because of the stricter 'Content-Security-Policy' headers.

▶ [patch]
Upgrades Node.js to v18.18.0

### USERS

▶ [patch] [#6569](https://github.com/taskcluster/taskcluster/issues/6569)
This patch updates the regex for the `hookGroupId` and `hookId` params for the hooks API to allow for up to 1000 characters.

## v55.3.0

### GENERAL

▶ [patch] [#2940](https://github.com/taskcluster/taskcluster/issues/2940)
Prepares azure_queue_messages table for upcoming migration by adding `task_queue_id`, `priority` columns.

▶ [patch]
D2G now takes advantage of Generic Worker Indexed Artifacts, introduced in Generic Worker 51.0.0. D2G translates Indexed Docker Images into Generic Worker mounted Indexed Artifacts. Previously, D2G generated commands to query the taskcluster Index and fetch the docker image.
With this improvement, docker images are now cached on workers, docker image dependencies between tasks are declarative (and thus inspectable), and generated Generic Worker task payloads are simpler and easier to understand.

### USERS

▶ [minor] [#6553](https://github.com/taskcluster/taskcluster/issues/6553)
Generic Worker File Mounts now include an optional `format` field to specify the compression format for the content. Generic Worker will decompress the retrieved content using the format specified before writing to disk. To avoid decompression, do not include the format field.

Allowed compression formats are: `bz2`, `gz`, `lz4`, `xz`, and `zst`.

This change additionally adds support for the `tar.lz4` format for Writable Directory Caches and Read Only Directories.

## v55.2.1

### GENERAL

▶ [patch]
Updates ubuntu image versions to `jammy`.

## v55.2.0

### GENERAL

▶ [patch] [#6543](https://github.com/taskcluster/taskcluster/issues/6543)
Generic Worker: d2g no longer passes the environment variable values to the `podman run` command. Instead, just the variable name is passed as `-e VAR` which tells podman to take the value from the host. This will tidy up the run command and will help with any escaping issues users may have been having.

### DEPLOYERS

▶ [minor] [#5514](https://github.com/taskcluster/taskcluster/issues/5514)
Adds support for postgres version 15.

Note: if you want to migrate your local dev db to pg15, you'll need to either erase the existing db with `docker volume rm taskcluster_db-data` before you migrate, or, if you'd prefer to keep your local dev data, you'll need to manually dump the db contents and then import them into the upgraded db.

Support for postgres v11 will be dropped from Taskcluster on November 9, 2023 (v11 EoL date) and that will be a breaking change.

▶ [patch] [#6534](https://github.com/taskcluster/taskcluster/issues/6534)
Upgrades kubernetes cronjob api version to `batch/v1`.

### WORKER-DEPLOYERS

▶ [patch] [#6540](https://github.com/taskcluster/taskcluster/issues/6540)
Generic Worker panicked when evicting caches to free up space on workers. This was reported via sentry [here](https://mozilla.sentry.io/issues/4044685700/?project=6462337).

### USERS

▶ [patch] [#6470](https://github.com/taskcluster/taskcluster/issues/6470)
D2G now properly escapes artifact paths in generated `podman cp` commands.

▶ [patch] [#6488](https://github.com/taskcluster/taskcluster/issues/6488)
Generic Worker no longer panics if an IO error occurs while scanning the filesystem for artifacts.

▶ [patch] [#6516](https://github.com/taskcluster/taskcluster/issues/6516)
Generic Worker now handles Indexed Docker Images where the docker image
contains multiple tags. Previously, Generic Worker assumed that indexed docker
images would have only one tag.

### DEVELOPERS

▶ [patch]
Updates Github integration documentation to tell which events to subscribe to.

## v55.1.1

### WORKER-DEPLOYERS

▶ [patch] [#6530](https://github.com/taskcluster/taskcluster/issues/6530)
Workers deployed in GCP as spot instances or preemptible VMs now
handle instance termination gracefully.

## v55.1.0

### GENERAL

▶ [minor] [#6528](https://github.com/taskcluster/taskcluster/issues/6528)
Github webhook handler supports recommended `X-Hub-Signature-256` verification.
All verification failures are being reported to the sentry additionally.

▶ [patch]
Replaces slow db query to fetch check run build status with a faster one, which is used in background status update handlers.

▶ [patch]
Upgrades to go1.21.1

## v55.0.1

### USERS

▶ [patch] [#6521](https://github.com/taskcluster/taskcluster/issues/6521)
Generic Worker now outputs a warning in the task log if a Docker Worker payload is supplied, together with the
d2g-converted task definition, in order to help users migrate their tasks to native Generic Worker format.

### OTHER

▶ Additional change not described here: [#6513](https://github.com/taskcluster/taskcluster/issues/6513).

### Automated Package Updates

<details>
<summary>7 Dependabot updates</summary>

* build(deps-dev): bump the deps group (1a1e30ce3)
* build(deps-dev): bump the deps-dev group (9f2491c20)
* build(deps): bump actions/checkout from 3 to 4 (487c1c0de)
* build(deps-dev): bump @babel/core in /clients/client-web (2af04e02f)
* build(deps): bump taskcluster from 54.4.1 to 55.0.0 in /taskcluster (6421f4f8c)
* build(deps-dev): bump chai from 4.3.7 to 4.3.8 in /clients/client-web (c5cd0f576)
* build(deps-dev): bump eslint in /clients/client-web (8f82a9e90)

</details>

## v55.0.0

### DEPLOYERS

▶ [minor] [#2942](https://github.com/taskcluster/taskcluster/issues/2942)
The new `queue.maxTaskDeadlineDays` Helm configuration parameter controls the maximum value allowed for task deadlines. The default is 5 days, matching the previous hard-coded setting.

### USERS

▶ [MAJOR] [#6117](https://github.com/taskcluster/taskcluster/issues/6117)
`workerManager.getWorker` returns worker even if it is quarantined and expired.
This is to avoid confusion in the UI when a worker is linked in UI, still exists in database, but page returns `404`.

### Automated Package Updates

<details>
<summary>1 Dependabot/Renovate updates</summary>

* build(deps): bump apollo-server-core from 3.12.0 to 3.12.1 (74b091287)

</details>

## v54.5.0

### USERS

▶ [minor] [#5995](https://github.com/taskcluster/taskcluster/issues/5995)
Generic Worker: Adds `task.payload.feature.loopbackAudio` for loopback audio device support on Linux.

The `snd-aloop` kernel module must be installed on the host system for this feature to work, although it does not _need_ to be loaded. Generic Worker loads the module with `modprobe` and generates the virtual audio device with a `snd-aloop` command. Under the multiuser engine, it also manages file ownership of the device with `chown` to ensure that only tasks with suitable scopes have read/write access to the virtual device.

For tasks that enable the feature, the virtual audio device will be found at `/dev/snd`. Devices inside that directory will take the form `/dev/snd/controlC<DEVICE_NUMBER>`, `/dev/snd/pcmC<DEVICE_NUMBER>D0c`, `/dev/snd/pcmC<DEVICE_NUMBER>D0p`, `/dev/snd/pcmC<DEVICE_NUMBER>D1c`, and `/dev/snd/pcmC<DEVICE_NUMBER>D1p`, where `<DEVICE_NUMBER>` is an integer between 0 and 31, inclusive. The Generic Worker config setting `loopbackAudioDeviceNumber` may be used to change the device number in case the default value (`16`) conflicts with another audio device on the worker. Future releases of Generic Worker may provide the capability of having more than one virtual audio device; currently only one virtual audio device is supported.

▶ [patch] [#6481](https://github.com/taskcluster/taskcluster/issues/6481)
Allow git SSH urls in `metadata.source`.

▶ [patch] [#6476](https://github.com/taskcluster/taskcluster/issues/6476)
Generic Worker now checks the Index to see if there is a new version of an Indexed Artifact available. If there isn't, it is fine to use its cached copy, but if there is, it updates its cache.

▶ [patch]
Generic Worker: If a Docker Worker payload is received, the resulting, d2g-translated Generic Worker payload will be logged out to the user.

▶ [patch] [#6438](https://github.com/taskcluster/taskcluster/issues/6438)
`dependencies` are no longer removed from the task definition when you `Edit` or `Retrigger` a task.

### DEVELOPERS

▶ [minor] [#6269](https://github.com/taskcluster/taskcluster/issues/6269)
Generic Worker now provides configuration property `maxTaskRunTime` as an upper bound for task payload property `maxRunTime`. Tasks with `maxRunTime` exceeding this value will be resolved as `exception/malformed-payload`.

### OTHER

▶ Additional changes not described here: [#6482](https://github.com/taskcluster/taskcluster/issues/6482), [#6484](https://github.com/taskcluster/taskcluster/issues/6484).

### Automated Package Updates

<details>
<summary>3 Dependabot/Renovate updates</summary>

* build(deps): bump taskcluster-taskgraph in /taskcluster (172ce2df5)
* build(deps): bump protobufjs from 6.11.3 to 6.11.4 (328acc638)
* build(deps): bump slugid from 3.2.0 to 4.0.0 in /clients/client (22eb08ae4)

</details>

## v54.4.2

### GENERAL

▶ [patch]
Upgrades go to 1.21.0 and node to 18.17.1

### USERS

▶ [patch] [#6440](https://github.com/taskcluster/taskcluster/issues/6440)
Generic Worker now allocates a pseudo tty when running Docker Worker tasks, to
emulate Docker Worker behavior. Previously it did not allocate a tty, which
could result in e.g. output not being colored.

### OTHER

▶ Additional changes not described here: [#6400](https://github.com/taskcluster/taskcluster/issues/6400), [#6414](https://github.com/taskcluster/taskcluster/issues/6414), [#6442](https://github.com/taskcluster/taskcluster/issues/6442).

### Automated Package Updates

<details>
<summary>11 Dependabot/Renovate updates</summary>

* build(deps-dev): bump eslint in /clients/client-web (7b132ce69)
* build(deps-dev): bump zen-observable from 0.8.15 to 0.10.0 (b6098fade)
* build(deps): bump github.com/iancoleman/strcase from 0.2.0 to 0.3.0 (deea49585)
* build(deps-dev): bump @babel/core in /clients/client-web (c5e7d8ab6)
* build(deps-dev): bump karma-coverage in /clients/client-web (8c0c79322)
* build(deps): bump pyyaml from 6.0 to 6.0.1 in /taskcluster (f818ba817)
* build(deps): bump taskcluster from 54.1.2 to 54.4.1 in /taskcluster (06d02af96)
* build(deps-dev): bump nock from 13.3.1 to 13.3.2 in /clients/client (58f394be6)
* build(deps): bump aws-sdk from 2.1376.0 to 2.1426.0 (bfb701686)
* build(deps): bump golang.org/x/tools from 0.11.0 to 0.11.1 (7420158d5)
* build(deps): bump certifi from 2023.5.7 to 2023.7.22 in /taskcluster (5f364270a)

</details>

## v54.4.1

### GENERAL

▶ [patch]
Upgrade Node.js to 18.17.0.

### ADMINS

▶ [patch] [#6405](https://github.com/taskcluster/taskcluster/issues/6405)
Expire artifacts job no longer logs errors for each missing artifact. Instead it reports the number of missing artifacts at the end of the job.

### USERS

▶ [patch]
Adds a task log letting the user know their Docker Worker payload is being converted to a Generic Worker payload using d2g.

### Automated Package Updates

<details>
<summary>1 Dependabot/Renovate updates</summary>

* build(deps): bump aiohttp from 3.8.4 to 3.8.5 in /taskcluster (56a9903ae)

</details>

## v54.4.0

### USERS

▶ [minor] [#5961](https://github.com/taskcluster/taskcluster/issues/5961)
Generic Worker now supports the `osGroups` feature on macOS, Linux and
FreeBSD. Support was already added to Windows in Generic Worker 6.0.0.

Example Linux/macOS task (requires `docker` to be installed on worker):

```
created: <timestamp>
deadline: <timestamp>
workerType: my-worker-type
provisionerId: mv-provisioner-id
scopes:
  - generic-worker:os-group:my-provisioner-id/my-worker-type/docker
payload:
  osGroups:
    - docker
  command:
    - - docker
      - run
      - --rm
      - ubuntu:latest
      - /usr/bin/echo
      - hello
  maxRunTime: 60
metadata:
  name: Ubuntu - docker test
  owner: pmoore@mozilla.com
  source: https://github.com/taskcluster/taskcluster/pull/6397
  description: Test calling docker from a Generic Worker task
```

## v54.3.1

### GENERAL

▶ [patch] [#6420](https://github.com/taskcluster/taskcluster/issues/6420)
Fixes generic worker issue where artifacts were no longer being uploaded.

## v54.3.0

### ADMINS

▶ [patch] [#6405](https://github.com/taskcluster/taskcluster/issues/6405)
Expire artifacts handles the case where the artifact is not found during deletion. GCS behaves differently to S3 here, as it will throw an error if the artifact is not found, where S3 would always return 204.

### USERS

▶ [minor] [#5967](https://github.com/taskcluster/taskcluster/issues/5967)
This change integrates the `d2g` tool into Generic Worker so that it can accept a valid, Docker Worker payload.

▶ [patch] [#6417](https://github.com/taskcluster/taskcluster/issues/6417)
Generic Worker: Interactive sessions suffered from a race condition that was introduced in Generic Worker 54.2.0. This has been fixed.

## v54.2.0

### USERS

▶ [minor] [#6405](https://github.com/taskcluster/taskcluster/issues/6405)
Expire artifacts supports both bulk deletion and single deletion. This can be configured for the deployment using `AWS_USE_BULK_DELETE` environment variable (`false` by default). This is needed because not all S3 compatible storages support bulk delete, specifically [GCS](https://cloud.google.com/storage/docs/migrating#methods-comparison).
`EXPIRE_ARTIFACTS_BATCH_SIZE` can be used to control how many records to process at once, i.e. how many parallel delete requests would be sent to storage service (`100` by default).

### DEVELOPERS

▶ [patch] [#6395](https://github.com/taskcluster/taskcluster/issues/6395)
Fixed local development environment where artifacts could not be loaded in the UI. This was caused by not using pinned `minio/*` images.

▶ [patch] [#6395](https://github.com/taskcluster/taskcluster/issues/6395)
Local development environment now supports live log.

## v54.1.4

### GENERAL

▶ [patch]
Upgrades to go1.20.6 which is a security release.

>go1.20.6 (released 2023-07-11) includes a security fix to the net/http package, as well as bug fixes to the compiler, cgo, the cover tool, the go command, the runtime, and the crypto/ecdsa, go/build, go/printer, net/mail, and text/template packages. See the [Go 1.20.6 milestone](https://github.com/golang/go/issues?q=milestone%3AGo1.20.6+label%3ACherryPickApproved) on our issue tracker for details.

### USERS

▶ [patch]
Hooks page improvements: extra schedule and exchanges displayed as Badge with a proper tooltip.

## v54.1.3

### GENERAL

▶ [patch]
This change updates `d2g` to return the resulting generic worker payload with a `125` exit status code in the retry array to fix an intermittent podman issue while pulling the docker image.

### USERS

▶ [patch]
Hooks page now displays table instead of tree view. Table view includes extra information that might be helpful to spot issues with hooks. Most recent task with state is displayed if available, or error if last fire was not successful.

▶ [patch]
UI: Refactors how validation schemas are loaded, to ensure they are only fetched and added once to prevent duplicate schema exceptions.

### OTHER

▶ Additional change not described here: [#6380](https://github.com/taskcluster/taskcluster/issues/6380).

## v54.1.2

### USERS

▶ [patch] [#6330](https://github.com/taskcluster/taskcluster/issues/6330)
Fixes UI errors on pages that were loading metaschema twice.

### DEVELOPERS

▶ [patch]
Upgrades some rust crates and bumps rust version from 1.65.0 to 1.70.0.

## v54.1.1

### GENERAL

▶ [patch]
Upgrades to go1.20.5 from go1.19.10.

## v54.1.0

### USERS

▶ [minor]
This change adds the `d2g` subcommand to the `taskcluster` cli.

It can be used to translate a Docker Worker payload to a Generic Worker payload.
Both the input and output are JSON. You can either pass the input as a file or pipe it in to the command.

View help with:

```shell
taskcluster d2g -h
```

Example usages:

```shell
taskcluster d2g -f /path/to/input.json
```

_OR_

```shell
taskcluster d2g --file /path/to/input.json
```

_OR_

```shell
cat /path/to/input.json | taskcluster d2g
```

_OR_

```shell
echo '{"image": "ubuntu", "command": ["bash", "-c", "echo hello world"], "maxRunTime": 300}' | taskcluster d2g
```

▶ [patch]
Fixes UI redirect where query parameters were not preserved. This broke changelog link from the sidebar.

### OTHER

▶ Additional change not described here: [#6340](https://github.com/taskcluster/taskcluster/issues/6340).

## v54.0.0

### USERS

▶ [MAJOR]
Remove python 3.7 support as it's hit the EoL date, 2023-06-27.

More info on the python 3.7 release schedule can be found [here](https://peps.python.org/pep-0537/).

▶ [minor] [#6248](https://github.com/taskcluster/taskcluster/issues/6248)
Hooks service returns task state with lastFires call. This state is also showed in UI, along with the "Fire Status", which only indicate if task was succesfully created, but does not show if the task completed succesfully or not.

## v53.2.1

### GENERAL

▶ [patch] [#6237](https://github.com/taskcluster/taskcluster/issues/6237)
Fix the case where a generic worker won't upload its log on a malformed payload error. This has been broken since v48.2.0 from PR [#6107](https://github.com/taskcluster/taskcluster/pull/6107).

## v53.2.0

### GENERAL

▶ [minor]
Migrate [d2g](https://github.com/taskcluster/d2g) to `tools/d2g`.

▶ [patch]
Stop running docker-worker tests in the CI.

The tests will remain in the monorepo because we'll look into using them with generic worker once d2g is integrated.

▶ [patch]
Upgrade Node.js version to 18.16.1 (security release).

More information can be found [here](https://nodejs.org/en/blog/vulnerability/june-2023-security-releases).

### ADMINS

▶ [minor] [#6142](https://github.com/taskcluster/taskcluster/issues/6142)
Worker manager stops instances that are not active in queue after short timeout.
This is to prevent instances from running when worker fails to start claiming work or dies and does not reclaims task.

## v53.1.0

### USERS

▶ [minor] [#5994](https://github.com/taskcluster/taskcluster/issues/5994)
Generic Worker: Adds `task.payload.feature.loopbackVideo` for loopback video device support on Linux.

The `v4l2loopback` kernel module must be installed on the host system for this feature to work, although it does not _need_ to be loaded. Generic Worker loads the module with `modprobe` and generates the virtual video device with a `v4l2loopback` command. Under the multiuser engine, it also manages file ownership of the device with `chown` to ensure that only tasks with suitable scopes have read/write access to the virtual device.

For tasks that enable the feature, the virtual video device location will be provided to the task commands via the environment variable `TASKCLUSTER_VIDEO_DEVICE`. The value of the environment variable depends on deployment configuration, and therefore tasks should not assume a fixed value. Its value will however take the form `/dev/video<DEVICE_NUMBER>` where `<DEVICE_NUMBER>` is an integer between 0 and 255. The Generic Worker config setting `loopbackVideoDeviceNumber` may be used to change the device number. Future releases of Generic Worker may provide the capability of having more than one virtual video device; currently only one virtual video device is supported.

▶ [patch] [#6326](https://github.com/taskcluster/taskcluster/issues/6326)
Running `taskcluster group list` without a task group ID now outputs error message:

```
Error: list expects argument <taskGroupId>
```

Previously, it incorrectly outputted:

```
Error: list expects argument <taskId>
```

## v53.0.0

### GENERAL

▶ [minor]
This essentially reverts the change in [#6279](https://github.com/taskcluster/taskcluster/pull/6279).

We learned from RelOps that the simple engine is useful for running generic worker inside a VM and inside of docker containers.

▶ [patch]
Upgrade to go 1.19.10.

> go1.19.10 (released 2023-06-06) includes four security fixes to the cmd/go and runtime packages, as well as bug fixes to the compiler, the go command, and the runtime.

### ADMINS

▶ [minor] [#6247](https://github.com/taskcluster/taskcluster/issues/6247)
Revert worker-manager from quarantining workers on removal that was introduced in [PR 6267](https://github.com/taskcluster/taskcluster/pull/6267).

### USERS

▶ [MAJOR]
Rework the interactive feature for generic worker allowing to run interactive commands in it

▶ [patch]
Introduced `github.renderTaskclusterYml` endpoint to render provided `.taskcluster.yml` file for various events.
This might be used for debug purposes or to validate the .taskcluster.yml file
and make sure that resulting tasks and scopes produce expected values.

### DEVELOPERS

▶ [patch]
Enables CORS for API for local docker-compose development.

### OTHER

▶ Additional change not described here: [#6280](https://github.com/taskcluster/taskcluster/issues/6280).

## v52.0.0

### GENERAL

▶ [MAJOR] [#6277](https://github.com/taskcluster/taskcluster/issues/6277)
Generic Worker Simple engine is no longer _released_. It can still be built from source, but since it was never intended to be used as a production engine, and was only intended to support development (e.g. for running unit tests or running in a simple dev deployment) the simple engine binaries are no longer released.

### WORKER-DEPLOYERS

▶ [patch] [#5006](https://github.com/taskcluster/taskcluster/issues/5006)
Generic Worker on macOS now dumps the output of the `last` command when it is not able to determine the logged in console user. This doesn't solve issue 5006 but it may provide additional troubleshooting information.

### USERS

▶ [patch] [#6278](https://github.com/taskcluster/taskcluster/issues/6278)
Fix UI issue showing "Response code 404" for missing `public/actions.json` artifact.

▶ [patch] [#5807](https://github.com/taskcluster/taskcluster/issues/5807)
Fixes escape sequence parsing in logs that are attached to github check runs.

## v51.1.0

### ADMINS

▶ [minor] [#6247](https://github.com/taskcluster/taskcluster/issues/6247)
Worker manager now also quarantines worker on `removeWorker` call. This is used to prevent some race conditions when worker is still polling for new work and is removed/shutdown at the same time.

### USERS

▶ [patch]
The new (unused in production) indexed artifacts feature of Generic Worker was broken in release 51.0.0. This has (hopefully) been fixed.

### DEVELOPERS

▶ [patch]
New `.taskcuster.yml` linter added in UI to help validate github integration.

▶ [patch]
Taskcluster YAML validator can load file from URL.

## v51.0.0

### USERS

▶ [minor] [#6245](https://github.com/taskcluster/taskcluster/issues/6245)
Generic Worker payload now supports declaratively mounting indexed artifacts into the task directory. For example:

```yml
payload:
  mounts:
    content:
      namespace: my.index.namespace
      artifact: public/image.jpg
    file: pics/image.jpg
```

### DEVELOPERS

▶ [MAJOR]
The jsonschema2go tool now considers `SHA` and `KVM` to be words that should be
capitalised when generating go type names.

As a consequence, the taskcluster go client is backwardly incomaptible with the
previous release, since the `tcgithub.Build` struct member `Sha` has been
renamed to `SHA`.

▶ [patch]
`node-fetch` dependency removed in favour of `got`.

## v50.1.3

### ADMINS

▶ [patch] [#5621](https://github.com/taskcluster/taskcluster/issues/5621)
Github service patch incorrect query for fetching older builds

## v50.1.2

### ADMINS

▶ [patch] [#5621](https://github.com/taskcluster/taskcluster/issues/5621)
Several Github service improvements:
* auto cancel task groups is not enabled by default
* auto cancel task groups reports when it cannot seal and cancel task groups with github comments
* when cancelling task groups, it will filter by same event type (push, pull_request, etc)
* calling queue with limited scopes: assumes `repo:github.com/org/repo:*` role(s) to make sure that given repository has correct permissions to seal and cancel task groups
* github api exposes `github.cancelBuilds({ organization, repository, sha?, pullNumber? })` to cancel existing running builds

## v50.1.1

### GENERAL

▶ [patch]
Aligned platforms of released binaries:

  * darwin/amd64
  * darwin/arm64
  * freebsd/amd64
  * freebsd/arm64
  * linux/amd64
  * linux/arm64
  * windows/386
  * windows/amd64

Previously there were inconsistencies across tools (e.g. taskcluster cli was released for different platforms than livelog).

### ADMINS

▶ [patch] [#5621](https://github.com/taskcluster/taskcluster/issues/5621)
Extend `static/taskcluster/github` client with two scopes that are necessary to seal and cancel previously created task groups: `queue:cancel-task-group:taskcluster-github` and `queue:seal-task-group:taskcluster-github`.
When github repository is using a different schedulerId than `taskcluster-github`, then it might be necessary to update corresponding `repo:github.com/` roles with correct scopes.

### USERS

▶ [patch]
Adds interactive changelog viewer to the docs section.

## v50.1.0

### GENERAL

▶ [patch]
Bump caniuse-lite version with `npx update-browserslist-db@latest` due to outdated warning.

### USERS

▶ [minor] [#5621](https://github.com/taskcluster/taskcluster/issues/5621)
Github service now automatically cancels older task groups to avoid redundancy when there are multiple builds for the same commit sha or pull request. This behavior can be disabled by setting `autoCancelPreviousChecks` to `false` in the `.taskcluster.yml` file.

## v50.0.0

### GENERAL

▶ [MAJOR] [#6213](https://github.com/taskcluster/taskcluster/issues/6213)
The Generic Worker Docker Engine was an experimental engine that was never used
in production. It was an intended starting point for adding support for
docker-worker style payloads. However, a new approach to running Docker Worker
payloads in the multiuser engine was agreed, and is under [active
development](https://github.com/orgs/taskcluster/projects/14). This will
provide the same functionality that the Docker Engine was intended to provide.
Therefore the old, incomplete, and unused docker engine has been removed.

▶ [patch] [#6216](https://github.com/taskcluster/taskcluster/issues/6216)
Build freebsd versions of livelog, taskcluster-proxy and start-worker to complement the existing generic-worker builds.

### USERS

▶ [patch] [#6208](https://github.com/taskcluster/taskcluster/issues/6208)
Return a malformed payload error if `payload.features.interactive` is enabled in the task definition, while the `enableInteractive` worker config is false.

### DEVELOPERS

▶ [patch]
jsonschema2go cli now has options for generating nested structs, and including default values as struct tags.

## v49.2.0

### GENERAL

▶ [patch]
Upgrade Node.js version to 18.16.0 and go version to 1.19.9.

### USERS

▶ [minor] [#6169](https://github.com/taskcluster/taskcluster/issues/6169)
Adds interactive shell support to generic-worker.

The worker configuration variable `enableInteractive` needs to be set to `true` to allow the interactive shell feature to be enabled. `enableInteractive` is disabled by default.

Once the worker configuration variable is set, the `interactive` feature can be enabled on a per-task basis.

To enable, set `task.payload.features.interactive` to `true`. And toggle on `Interactive` in the Create Task view of the UI.

## v49.1.3

### WORKER-DEPLOYERS

▶ [patch] [#6186](https://github.com/taskcluster/taskcluster/issues/6186)
Worker-manager refreshes worker from database before calling removeWorker on terminateAfter time exceeded to prevent from stopping workers that were already registered and running since worker scanner has started.

## v49.1.2

### USERS

▶ [patch] [#6185](https://github.com/taskcluster/taskcluster/issues/6185)
Fixed quarantine worker 'reason' field schema to be optional.

▶ [patch] [#6058](https://github.com/taskcluster/taskcluster/issues/6058)
Generic Worker no longer modifies the Access Control Lists of the Interactive Desktop and the associated Windows Station unless additional OS groups have been specified in the task payload `osGroups` property. Previously Generic Worker would modify the ACLs of these objects even if the access token it was using for launching task command processes already had suitable permissions. This patch is a workaround for a more general issue, which is that the ACL modifications seem not to be appropriate in all cases when a new access token is needed. See https://bugzilla.mozilla.org/show_bug.cgi?id=1815711.

There is a likely to be a follow up fix for the ACL modifications that occur when a new access token is required, once it is understood why the current modifications are not always sufficient.

## v49.1.1

### GENERAL

▶ [patch]
Generic worker feature `task.Payload.OnExitStatus.PurgeCaches` now only purges caches related to the task, instead of all caches on the worker.

### USERS

▶ [patch] [#5773](https://github.com/taskcluster/taskcluster/issues/5773)
Fix UI bug when user profile was missing and causing whole page to crash.

▶ [patch] [bug 1590886](http://bugzil.la/1590886)
Github status handler listens to both `taskPending` and `taskRunning` events.

## v49.1.0

### ADMINS

▶ [minor] [bug 1826417](http://bugzil.la/1826417)
Changes the way `expire-artifacts` works. It uses a separate function to fetch all expired artifacts and then uses bulk delete to remove them from S3 and the database.

## v49.0.0

### GENERAL

▶ [patch]
Builds and tests generic worker (multiuser) on macOS Ventura 13 on new, arm64 machines.

### USERS

▶ [MAJOR]
Remove python 3.6 support as it's past its end-of-life date.

Add python 3.10 and python 3.11 support.

▶ [minor] [#6147](https://github.com/taskcluster/taskcluster/issues/6147)
Adds `task.payload.onExitStatus.purgeCaches` feature to generic worker to bring to parity with an existing docker worker feature.

`purgeCaches` is an array of exit status code integers that the user wants all caches associated with the task to be purged.

## v48.3.0

### ADMINS

▶ [minor] [#4343](https://github.com/taskcluster/taskcluster/issues/4343)
Workers can be quarantined with an optional comment. `queue.quarantineWorker` accepts a `quarantineInfo` string.
Quarantine details also include timestamp and clientId of the user who quarantined the worker.
This information can be fetched with `worker-manager.getWorker`.
`quarantineDetails` would be a list of all the quarantine requests made for the worker.
UI shows this history and allows to specify a comment for quarantine request.

### USERS

▶ [patch]
Enables missing `collaborators_quiet` policy to the schema validation of `.taskcluster.yml`.

▶ [patch] [bug 1824937](http://bugzil.la/1824937)
docker-worker no longer waits indefinitely when downloading an image artifact, and will retry if the connection is idle for 60s

## v48.2.1

### WORKER-DEPLOYERS

▶ [patch] [#6130](https://github.com/taskcluster/taskcluster/issues/6130)
This patch ensures that the worker pool ID passed to generic worker contains a slash (`/`) and will error out describing the issue as opposed to panicing when an `index out of range` error.

### USERS

▶ [patch] [bug 1590886](http://bugzil.la/1590886)
Fix Github statuses: skip unnecessary API updates when task starts running.

## v48.2.0

### USERS

▶ [minor] [#3652](https://github.com/taskcluster/taskcluster/issues/3652)
It is now possible to cancel a sealed task group by calling the `queue.cancelTaskGroup` API method.
This will cancel all scheduled/pending/running tasks within given group.

▶ [patch] [bug 1590886](http://bugzil.la/1590886)
Github service update statuses back to pending when task is retried.

### DEVELOPERS

▶ [minor] [#5993](https://github.com/taskcluster/taskcluster/issues/5993)
Adds the `liveLog` and `backingLog` feature flags to the generic worker payload so they can be disabled for a task. These are enabled by default.
Adds the `logs` property to the generic worker payload allowing customization of the live and backing log artifact names.

## v48.1.1

### USERS

▶ [patch] [#6124](https://github.com/taskcluster/taskcluster/issues/6124)
Fix a bug in UI where TaskGroup page would show "Malformed query" warning.
This was due to the `sift` library getting upgraded which changed the behaviour of filters.

## v48.1.0

### GENERAL

▶ [minor]
jsonschema2go: jsonschema default values are encoded into struct tags of generated go types for use with github.com/mcuadros/go-defaults.

In order to utilise this new features, callers should call `defaults.SetDefaults(&val)` before calling `json.Unmarshal(data, &val)`.

▶ [patch]
Go upgrade from 1.19.5 to 1.19.7. Also upgraded golangci-lint from 1.50.1 to 1.51.2.

Node.js upgrade from 18.14.1 to 18.15.0.

### USERS

▶ [patch]
Dashboard displays worker manager provisioning stats separately. Values are being automatically reloaded every 30 seconds.

▶ [patch] [#6109](https://github.com/taskcluster/taskcluster/issues/6109)
The worker-manager methods `createWorker`, `listWorkersForWorkerGroup`,
`updateWorker`, and `worker` had an extraneous colon (`:`) character in their
URL path.  This colon has been removed.  The old paths (containing the colon)
will continue to work, but the new paths are preferred.

## v48.0.0

### DEPLOYERS

▶ [patch] [#6067](https://github.com/taskcluster/taskcluster/issues/6067)
Worker-manager now considers `stoppingCapacity` when estimating the required number of workers to start, preventing failed to start workers from growing beyond `maxCapacity` and slowing down the scanner loop.

### USERS

▶ [MAJOR] [#6059](https://github.com/taskcluster/taskcluster/issues/6059)
It is now possible to seal a task group which is an operation to prevent additional tasks from being added.

New APIs:

* HTTP API `queue.sealTaskGroup` to seal task group and prevent addition of new tasks to it. This operation is irreversible.
* HTTP API `queue.getTaskGroup` to return task group information without tasks (use `queue.listTaskGroup` to return information with tasks)
* Pulse exchange `exchange/taskcluster-queue/v1/task-group-sealed` reports when a task group is sealed.

Updated APIs:

* HTTP API `queue.createTask` returns HTTP `409` error if task group was sealed.
* HTTP API `queue.listTaskGroup` returns extra fields `schedulerId`, `expires`, `sealed`.
* Pulse exchange `exchange/taskcluster-queue/v1/task-group-resolved` publishes extra fields `schedulerId`, `expires`, `sealed`.

UI updates:

* Task group view displays expiration and sealing time.
* Task group view actions includes seal task group action.

### OTHER

▶ Additional change not described here: [#6052](https://github.com/taskcluster/taskcluster/issues/6052).

## v47.1.2

### GENERAL

▶ [patch]
Add error handling for docker image release process.

## v47.1.1

### GENERAL

▶ [patch]
This upgrades Node.js to the latest LTS version available, v18.14.1. This is a security release.

### DEVELOPERS

▶ [patch]
Replace `github.com/ghodss/yaml` with `sigs.k8s.io/yaml`

▶ [patch]
This patch fixes the `yarn generate` command from failing from trying to fetch an older version of go that's not incluced in the https://go.dev/dl/?mode=json API.

### OTHER

▶ Additional change not described here: [#1753249](https://github.com/taskcluster/taskcluster/issues/1753249).

## v47.1.0

### GENERAL

▶ [minor]
This upgrades Node.js to the latest LTS version available, v18.13.0. Previous version was v16.19.0 and it was scheduled to hit EoL later this year.

View the release schedule [here](https://github.com/nodejs/release#release-schedule).

▶ [patch]
Docker worker json schema payload has been tweaked for cleaner go code generation. No functional impact anticipated.

▶ [patch]
Minor and patch version bumps via Dependabot using `pmac`:

`pmac add 6040 6039 6038 6036 6035 6034 6032 6030 6029 6028 6027 6026 6025 6024 6023`

### USERS

▶ [patch] [#6014](https://github.com/taskcluster/taskcluster/issues/6014)
Bug fix: docker worker no longer accepts non-strings for env var values in task payloads.

▶ [patch] [#6021](https://github.com/taskcluster/taskcluster/issues/6021)
Docker Worker payload has been tightened to enforce that Docker Worker caches are string to string mappings, rather than string to anything mappings.

## v47.0.3

### GENERAL

▶ [patch]
Go update from 1.19.4 to 1.19.5.

▶ [patch] [#5266](https://github.com/taskcluster/taskcluster/issues/5266)
This patch fetches `https://go.dev/dl/?mode=json` in order to automatically update the sha256 values of each of the go binaries used in the `workers/generic-worker/gw-decision-task/tasks.yml` file.

▶ [patch]
Upgrade `git` to latest version to address the security vulnerabilities affecting versions 2.39 and older.

[Announcement on GitHub](https://github.blog/2023-01-17-git-security-vulnerabilities-announced-2/)

## v47.0.2

### GENERAL

▶ [patch]
Small fix to dockerignore and release process.

## v47.0.1

### GENERAL

▶ [patch]
Reduce docker image size by ignoring .git folder.

## v47.0.0

### GENERAL

▶ [patch]
Add preinstall hook to install clients/client dependency to avoid inconsistent installs.
Removes "heroku-(pre|post)build" commands.

▶ [patch]
Adds caching for static UI assets.
UI web server will return 404 for /api/* and /graphql endpoints.

▶ [patch] [#5941](https://github.com/taskcluster/taskcluster/issues/5941)
Azure certificates updates.

▶ [patch]
Upgrade some major version dependency bumps using `pmac` tool:

`pmac add 5748 5811 5902 5903`

▶ [patch]
Upgrades to latest `lts/gallium` Node version, v16.19.0

### ADMINS

▶ [MAJOR] [#5518](https://github.com/taskcluster/taskcluster/issues/5518)
Assumes different role for github pre-release event: `assume:repo:github.com/<owner>/<repo>:release:<action>`, where `action` is one of the [release actions](https://docs.github.com/developers/webhooks-and-events/webhooks/webhook-events-and-payloads?actionType=published#release)

### DEVELOPERS

▶ [patch]
Reduce monoimage size by excluding unnecessary files.

▶ [patch] [#4950](https://github.com/taskcluster/taskcluster/issues/4950)
Remove auto-generated `actions.json` which is not properly configured and is not used in this repo.

▶ [patch] [#5938](https://github.com/taskcluster/taskcluster/issues/5938)
Upgrade json-e to 4.5.0.

▶ [patch]
This patch updates the GitHub Dependabot auto-merge workflow to use the recommended solution for approving/auto-merging minor and patch Dependabot PRs.

[GitHub Documentation Link](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/automating-dependabot-with-github-actions#enable-auto-merge-on-a-pull-request)

## v46.1.1

### GENERAL

▶ [patch] [#5844](https://github.com/taskcluster/taskcluster/issues/5844)
Filter debug logging information for failed registerWorker calls.

▶ [patch] [#5890](https://github.com/taskcluster/taskcluster/issues/5890)
Fix provisioners endpoint returning non-unique workers for the queue view.

▶ [patch] [#5851](https://github.com/taskcluster/taskcluster/issues/5851)
Improve error reporting for github api calls.

▶ [patch]
Minor and patch version bumps via Dependabot using `pmac`:

`pmac add 5887 5881 5880 5879 5878 5876 5874 5873 5872`

### DEVELOPERS

▶ [patch]
The Rust client now correctly base64-encodes `ext` hawk values with the STANDARD alphabet instead of URL_SAFE. This may fix intermittent generation of invalid temporary credentials.

▶ [patch]
This patch makes it so the taskcluster shell client (cli) is built with `goreleaser`.

`goreleaser` also will automatically keep our [homebrew-tap](https://github.com/taskcluster/homebrew-tap/blob/main/Formula/taskcluster.rb) formula up-to-date during the release process.

GitHub releases will now also contain zipped Windows executables of this cli supporting both amd64 and arm64. arm64 binaries for linux have been added as well.

The darwin and linux binaries are now tarballs.

## v46.1.0

### GENERAL

▶ [patch] [#5851](https://github.com/taskcluster/taskcluster/issues/5851)
Fix incorrect status reported by github service for unknown branches.

▶ [patch] [#5844](https://github.com/taskcluster/taskcluster/issues/5844)
Log extra debug information for failed worker registration attempts.

▶ [patch]
Patch python client tests to allow lint script.

▶ [patch]
Update 46.0.0 release notes that incorrectly linked issue #2791 instead of #5791.

▶ [patch]
Go update from 1.19.3 to 1.19.4. Also updates the git version for generic worker decision tasks from `git2.37.1` to `git2.39.0`.

▶ [patch]
This patch cleans up some of the python client and client test code of deprecation warnings.

▶ [patch]
Use updated gw-ci-macos-10-14 worker pool.

### WORKER-DEPLOYERS

▶ [patch] [#5836](https://github.com/taskcluster/taskcluster/issues/5836)
Add worker runner for windows/386 to release artifacts (previously broken).

### DEVELOPERS

▶ [minor] [#4624](https://github.com/taskcluster/taskcluster/issues/4624)
All language clients now use the getUrl download method to download objects,
including verifying hashes provided when the objects were uploaded.  However,
note that 's3' artifacts are still not verified -- the deployment must use
'object' artifacts to benefit from hash verification.

▶ [patch]
This patch switches running CI tasks on generic-worker-windows2012r2 worker pool to the new, windows 2022 worker pool.

## v46.0.0

### GENERAL

▶ [patch]
Upgrade `taskcluster-taskgraph` version to v4.0.0 as well as upgrade other python packages.

### USERS

▶ [minor] [#5804](https://github.com/taskcluster/taskcluster/issues/5804)
Adds pagination to the hooks last fires api call.

This prevents loading all last fires for the hooks that have thousands of records, which results in 500 errors.
Changes the behaviour of the existing `get_last_fires` function by using a different sort column - creation time instead of task_id.

▶ [patch] [#5804](https://github.com/taskcluster/taskcluster/issues/5804)
Fix empty error message for hooks last fire.

▶ [patch] [#5804](https://github.com/taskcluster/taskcluster/issues/5804)
Fix graphql endpoint for hook without last fires.

### DEVELOPERS

▶ [MAJOR] [#5791](https://github.com/taskcluster/taskcluster/issues/5791)
Hashes for object upload and download are now more precisely defined: uploaders
should supply all acceptable hash algorithms, and downloaders should verify all
recognized algorihtms and ensure that at least one is present.  This has the
effect of a breaking change in the Go client types, leading to this change's
designation as major.

▶ [patch] [#4624](https://github.com/taskcluster/taskcluster/issues/4624)
The `startDownload` method now accepts `getUrl` as a download method.

▶ [patch]
This patch switches running CI tasks on generic-worker-ubuntu-18-04 worker pool to the new, 22-04 worker pool.

## v45.0.1

### GENERAL

▶ [patch]
Minor and patch version bumps via Dependabot using `pmac`:

`pmac add 5822 5821 5819 5818 5817 5816 5815 5814 5813 5790 5789`

### USERS

▶ [patch] [bug 1803745](http://bugzil.la/1803745)
Docker-worker and generic-worker now skip gzipping artifacts with a `.deb` extension.

## v45.0.0

### GENERAL

▶ [minor] [#1955](https://github.com/taskcluster/taskcluster/issues/1955)
Adds timing statistics to the Task Group page: durations for each task, totals, median and shows distribution graph.

▶ [minor] [#5379](https://github.com/taskcluster/taskcluster/issues/5379)
MUI tables are now more responsive to smaller width screens. The worker manager page, no longer has the emails of the task owner displayed.

▶ [patch]
Go upgrade from 1.18.5 to 1.19.3. Also upgrades golangci-lint version to 1.50.1 for go1.19 support.

### WORKER-DEPLOYERS

▶ [minor] [#4605](https://github.com/taskcluster/taskcluster/issues/4605)
Generic-worker can now create object artifacts instead of s3 artifacts if the
`createObjectArtifacts` worker configuration parameter is true.

▶ [patch] [#5634](https://github.com/taskcluster/taskcluster/issues/5634)
The livelog docker image used by docker-worker now is not based on busybox, but
contains only the livelog binary, /etc/ssl/certs/ca-certificates.crt and an
empty /tmp directory. This effectively reverses the change from #3866.

### USERS

▶ [MAJOR] [#5799](https://github.com/taskcluster/taskcluster/issues/5799)
Docker Worker no longer supports the `disableSeccomp` capability (added in Docker Worker 44.22.0, but turned out to be unneeded).

Since this is technically a breaking change, a major version bump is necessary. However, as far as we know, nothing needed this feature.

▶ [minor] [#4624](https://github.com/taskcluster/taskcluster/issues/4624)
The object service now supports an additional download method, `getUrl`, which handles gzipped content and requires that hashes be validated.
This method is not yet supported by the client libraries (but such support will be added soon).

▶ [patch] [#5779](https://github.com/taskcluster/taskcluster/issues/5779)
Fix `View logs in Taskcluster` link in GitHub Checks UI to default to a run ID of 0 to prevent it from being undefined and getting a 400 Bad Response while accessing this link.

▶ [patch]
Updated livelog link in GitHub checks UI to points to a streaming livelog. Previous link would only render the logs once the task was complete.

### DEVELOPERS

▶ [patch]
Upgrades some rust crates and bumps rust version from 1.60.0 to 1.65.0.

### OTHER

▶ Additional changes not described here: [#5781](https://github.com/taskcluster/taskcluster/issues/5781), [#5795](https://github.com/taskcluster/taskcluster/issues/5795).

## v44.23.4

### GENERAL

▶ [patch]
Upgrades to latest Node version, v16.18.1.

## v44.23.3

### GENERAL

▶ [patch]
Minor and patch version bumps via Dependabot using `pmac`:

`pmac add 5746 5747 5749 5750 5751`

▶ [patch]
Upgrades taskgraph from v1.2.0 to v3.4.0.

## v44.23.2

### GENERAL

▶ [patch] [#5737](https://github.com/taskcluster/taskcluster/issues/5737)
Fix React props handling for TaskGroup page in production mode.

## v44.23.1

### GENERAL

▶ [patch] [#5728](https://github.com/taskcluster/taskcluster/issues/5728)
Adds auto release lock functionality to queued locks to prevent some GitHub handlers to run forever and keep the queue locked.

▶ [patch] [#5737](https://github.com/taskcluster/taskcluster/issues/5737)
Persist task group filter in URL, so navigating back restores filtered state.

## v44.23.0

### GENERAL

▶ [minor] [#5728](https://github.com/taskcluster/taskcluster/issues/5728)
Changed the way that github events are being handled.
There was a problem with treating those callbacks in async manner which resulted in total messages being processed to be limited by consumer's "prefetch" count (5 by default). And resulted in messages being piled up.
Introduces extra monitoring information with the numbers of active handlers count and total messages processed.

▶ [patch]
Upgrades `@xmldom/xmldom` to 0.7.6 to fix critical security vulnerability.

Also utilized the `yarn upgrade-interactive --latest` command for the following package upgrades:

`@azure/ms-rest-js@2.6.2, apollo-server-core@3.10.3, apollo-server-express@3.10.3, aws-sdk@2.1238.0, express@4.18.2, graphql-scalars@1.20.0, jwks-r
sa@2.1.5, marked@4.1.1, nodemailer@6.8.0, passport-auth0@1.4.3, pg@8.8.0, sanitize-html@2.7.2, c8@7.12.0, commander@9.4.1, dockerode@3.3.4, nock@13.2.9`

▶ [patch]
Upgrades to latest Node version, v16.18.0.

### DEPLOYERS

▶ [patch] [#5726](https://github.com/taskcluster/taskcluster/issues/5726)
The github service no longer fetches live logs from workers, but instead fetches backing logs from artifact storage. This reduces exceptions due to certificate expiries of live logs from stateless dns server.

## v44.22.1

### GENERAL

▶ [patch]
Reverts commit e2015f35330a4b059d1bccf55c871df2af77bfbb.

## v44.22.0

### GENERAL

▶ [minor]
Add a docker-worker capability `disableSeccomp` to disable the seccomp
system call filter.

It allows significant information leakage, and its use should not be
considered secure. This is required to run `rr` inside a container, as
described here: https://github.com/mozilla/rr/wiki/Docker

▶ [patch]
Adjust GCP CloudBuild config to cancel other ongoing jobs, so that the latest job is the only one that runs and no race conditions will occur with deploying to dev.

▶ [patch]
Upgrade many deps with the following command:
`pmac add 5692 5691 5690 5689 5688 5687`

▶ [patch]
Upgrades to latest Node version, v16.17.1, which is a security release.

### USERS

▶ [minor]
Added basic dashboard stats: Worker pools, provisioners, hooks, clients counts.

## v44.21.0

### GENERAL

▶ [minor] [#4534](https://github.com/taskcluster/taskcluster/issues/4534)
Add completions for other shells

### WORKER-DEPLOYERS

▶ [patch] [#5666](https://github.com/taskcluster/taskcluster/issues/5666)
The generic-worker no longer panics if it gets no HTTP responses from Queue for over 15 minutes.

### DEVELOPERS

▶ [minor]
Refactored github status checks handler to do handle task status transitions in single place.

Previous implementation relied on two handlers: taskDefined and statusChanged.
For some tasks both events happened at the same time, which led to a race condition and multiple check_runs being created.
To prevent concurrent handlers overwriting newer updates, simple time-based check was added to prevent this.

## v44.20.4

### DEVELOPERS

▶ [patch] [#5663](https://github.com/taskcluster/taskcluster/issues/5663)
This patch upgrades to the new, v2 Docker Hub APIs.
v1 APIs were deprecated as of September 5, 2022 - see [here](https://www.docker.com/blog/docker-hub-v1-api-deprecation/) for more info.

## v44.20.3

### USERS

▶ [patch]
Fixes UI bug with hooks creation form, where changing Exchange input resulted in error message.

▶ [patch]
Trim ANSI control codes from the live log that is being shown in github check run.

## v44.20.2

No changes

## v44.20.1

### DEVELOPERS

▶ [patch]
Trim github payload for the check run updates call.

▶ [patch]
Build generic worker docker image as part of the release process.

## v44.20.0

### GENERAL

▶ [patch] [#5653](https://github.com/taskcluster/taskcluster/issues/5653)
Fix a bug with github status checks not being updated.

In 44.19.1 release github service started tracking additional task
state changes, and this resulted in a race condition between "taskDefined"
and "status" handlers where both of them would create new check run at
the same time. Wrong check run would later get all status updates, while
Github UI will be showing a different check run which didn't receive all
the updates.

▶ [patch]
Upgrade node to the latest LTS release, v16.17.0

### DEPLOYERS

▶ [patch] [#5041](https://github.com/taskcluster/taskcluster/issues/5041)
Add support for private docker registry by adding `imagePullSecrets` config value.

### DEVELOPERS

▶ [minor] [#5295](https://github.com/taskcluster/taskcluster/issues/5295)
When hovering over a task in a group task, the background color changes for the whole row, now. As opposed to a portion of the row.

▶ [patch]
Building and publishing generic worker docker image

▶ [patch] [#5217](https://github.com/taskcluster/taskcluster/issues/5217)
This patch gets a tail of the last 250 lines of the `live.log` file and provides it in the GitHub checks view without having to visit the Taskcluster UI.

## v44.19.1

### GENERAL

▶ [patch]
Fix broken devel image build

## v44.19.0

This release failed, please see v44.19.1
---

### GENERAL

▶ [minor] [#5085](https://github.com/taskcluster/taskcluster/issues/5085)
Github integration handles task reruns, triggered from the Taskcluster side.
Check run status updates will include in_progress and queued sates for such tasks.

▶ [patch]
Fixes error logging for "re-run" github event.
Improves '[ci skip]' logic to also include pull_request events.
Adds documentation on how to debug github integration locally.

▶ [patch]
Remove duplicate ingres paths as redundant

### DEPLOYERS

▶ [minor] [#4913](https://github.com/taskcluster/taskcluster/issues/4913)
Adds support for nginx ingress for routes definitions.
Adds support for certbot annotations.

### ADMINS

▶ [minor] [#5616](https://github.com/taskcluster/taskcluster/issues/5616)
For projects with `policy.pullRequests` set to `public_restricted`, Taskcluster Github will now assume the role `repo:github.com/${ payload.organization }/${ payload.repository }:pull-request-untrusted`. Administrators will need to create this role for all `public_restricted` projects.

### USERS

▶ [minor] [#5311](https://github.com/taskcluster/taskcluster/issues/5311)
Github integration can skip creation of tasks for single commits that include "[ci skip]" or "[skip ci]" message.

▶ [patch] [#5046](https://github.com/taskcluster/taskcluster/issues/5046)
UI automatically goes to the latest run on rerun action.
Task page listens to updates on task status and updates the page.

▶ [patch]
UI: Pulse Messages autocompletes known exchanges

### DEVELOPERS

▶ [minor] [#5611](https://github.com/taskcluster/taskcluster/issues/5611)
Added paddingLeft to the root MUISelect in the overrides in theme.js.

Choosing a worker type out of the dropdown menu from the Create Task page now displays the chosen type with appropriate padding from the left. The chosen worker type no longer appears glued to the left border.

▶ [patch]
Docker compose: static worker not started by default.

▶ [patch]
Switch to devel image for docker-compose.dev.yml.
Installing nodemon only in devel image.

▶ [patch]
Use tc-admin to setup local env.

▶ [patch]
This patch makes it so that a `yarn smoketest` on our dev environment is run after a successful deploy.

## v44.18.0

### GENERAL

▶ [patch] [#5577](https://github.com/taskcluster/taskcluster/issues/5577)
Adds linting functionality in the Create Task page.

Validates create task and its payload based on the selected worker type.

▶ [patch]
Update go version from 1.18.4 to 1.18.5 for building generic-worker, livelog, taskcluster-proxy, start-worker, and the taskcluster cli.
Update golangci-lint from 1.46.2 to 1.47.3 for linting go code.

### USERS

▶ [patch] [#5555](https://github.com/taskcluster/taskcluster/issues/5555)
This patch fixes an issue with filtering workers based on quarantined status. The issue only occurs with static workers that are quarantined. When the filter was active, those static, quarantined workers would not be displayed in the list. This issue was first brought up in v44.17.0.

### DEVELOPERS

▶ [minor]
Docker compose changes and improvements:
* `generic-worker` runs with local `docker compose` and is able to execute tasks
* (breaking change) default ingress service was renamed to `taskcluster` and now binds to port `80` instead of `8080`
* manual entry of '127.0.0.1 taskcluster' to `/etc/hosts` is necessary in order to make HAWK authentication work properly across whole UI

New tutorial page is added `docs/tutorial/local-dev` describing how to launch Taskcluster locally and run a simple task.

▶ [patch]
Auto-reload services in docker-compose.dev.yml when source changes.
This will allow to develop services without restarting manually docker compose.

▶ [patch] [#5602](https://github.com/taskcluster/taskcluster/issues/5602)
Introduced docker compose profiles to allow running background tasks and cron jobs.

▶ [patch]
Added scripts to `package.json` to more easily use the `docker compose` commands.

New `yarn` commands: `start`, `stop`, `dev:start`, `dev:stop`, `prod:start`, and `prod:stop`.

## v44.17.2

### GENERAL

▶ [patch]
Go update from 1.18.3 to 1.18.4. Also updates the git version for generic worker decision tasks from `git2.24.0.2` to `git2.37.1`.

### DEPLOYERS

▶ [patch] [bug 1633440](http://bugzil.la/1633440)
Spread cron task times that started at 00:00 to minimize CPU spikes and DB loads.

### USERS

▶ [patch]
Set the `key` field on the login window to a password field instead of a text one

### DEVELOPERS

▶ [patch]
Fix docker compose sometimes not starting the ingress container

▶ [patch] [#5553](https://github.com/taskcluster/taskcluster/issues/5553)
This change adds continuous deployment support to the `cloudbuild.yaml` file so that each change to `main` results in a new deployment to [`https://dev.alpha.taskcluster-dev.net/`](https://dev.alpha.taskcluster-dev.net/).

▶ [patch] [#5554](https://github.com/taskcluster/taskcluster/issues/5554)
This patch splits the docker compose file into separate dev and prod configuration files. For prod-like deployments, where you want to use the latest `taskcluster/taskcluster` docker image, use the command `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`. For development deployments, where local source code mounts as volumes for testing/debugging purposes, use the command `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`.

This change also switches `docker-compose` (v1) references over to `docker compose` (v2). See [here](https://docs.docker.com/compose/#compose-v2-and-the-new-docker-compose-command) for more details.

## v44.17.1

### GENERAL

▶ [patch]
Remove unused config value auditLog

▶ [patch]
This patch addresses the following vuln in `passport` https://security.snyk.io/vuln/SNYK-JS-PASSPORT-2840631. This also upgrades `express` to the latest stable release.

▶ [patch] [#5557](https://github.com/taskcluster/taskcluster/issues/5557)
This patch upgrades to Debian 10 docker images, as Debian 9 hit EOL.

▶ [patch]
Upgrade node to the latest LTS release, v16.16.0.
This is a security release. More info can be found [here](https://nodejs.org/en/blog/vulnerability/july-2022-security-releases/#update-07-july-2022-security-releases-available).

### DEVELOPERS

▶ [patch]
Remove node-fetch dependency from ui/ as it was only used in abandoned queryServer.js script to cache possible graphql types.

▶ [patch] [#5391](https://github.com/taskcluster/taskcluster/issues/5391)
Skip github checks if github build is unkown.
This happens in periodic and manual hooks that are doing some periodic operations on github repo.
Those operations are not initiated by github, so there is no new build/check suite created for those events.

## v44.17.0

### GENERAL

▶ [minor] [#5456](https://github.com/taskcluster/taskcluster/issues/5456)
This change adds more DB functions to allow for filtering in the DB based on worker state and quarantined status for the workers page. Previously, filtering would only happen on the initial page loaded from the DB if results were paginated. This should also speed up the workers page rendering when a filter is applied.

▶ [patch] [#5529](https://github.com/taskcluster/taskcluster/issues/5529)
This patch makes it so that the `docker-compose.yml` file is updated with the new taskcluster docker image version on a `yarn release`. Previously, the version wasn't updated, so the `meta-generate` task would fail on releases. This issue first appeared in v44.16.4.

▶ [patch] [#5319](https://github.com/taskcluster/taskcluster/issues/5319)
This patch migrates the legacy, `process.hrtime([time])` to the new, `process.hrtime.bigint()`.
See [Node Docs](https://nodejs.org/docs/latest-v16.x/api/process.html#processhrtimetime) for more information.

▶ [patch]
This patch upgrades dependencies to their latest minor/patch versions. Doing so fixes a handful of vulns found within Snyk and docker scans.

### DEVELOPERS

▶ [patch]
Added a `cloudbuild.yaml` file for the Google Cloud Build trigger on the `main` branch.

## v44.16.4

### USERS

▶ [patch] [#5517](https://github.com/taskcluster/taskcluster/issues/5517)
This patch fixes the quarantined value on the workers table to be `n/a` if the quarantined value is in the past. This issue was first noticed in v44.16.3.

### DEVELOPERS

▶ [patch]
Added docker-compose.yml for local development.

### OTHER

▶ Additional change not described here: [#5503](https://github.com/taskcluster/taskcluster/issues/5503).

## v44.16.3

### GENERAL

▶ [patch]
This patch returns up the `quarantineUntil` field in the `workerManager.getWorker` and `workerManager.listWorkers` methods. This issue was first noticed in v44.15.0.

## v44.16.2

### GENERAL

▶ [patch]
This patch adds a new field to be logged out on a failed provision call. This field will be used to measure the provisioning failed count.

### USERS

▶ [patch] [#5503](https://github.com/taskcluster/taskcluster/issues/5503)
Add missing task-rerun scope to github handler.

▶ [patch] [#5506](https://github.com/taskcluster/taskcluster/issues/5506)
Log debug information for incoming Github webhooks.

▶ [patch] [#5501](https://github.com/taskcluster/taskcluster/issues/5501)
This patch makes it so a user cannot click the `Terminate Worker` button on a Static or Standalone worker. This patch also moves the `Terminate Worker` button on the view individual worker page to the speed dial menu alongside the `Quarantine` button. These issues were first brought up in v44.15.0.

### Automated Package Updates

<details>
<summary>1 Renovate updates</summary>

* Update module golang.org/x/tools to v0.1.11 (147766abb)

</details>

## v44.16.1

### GENERAL

▶ [patch]
This fixes the default worker state of a worker not known by worker manager to be `standalone` as opposed to `unmanaged` to be consistent with the rest of the project. This issue was first brought up in v44.16.0

### USERS

▶ [patch]
Fix this error (`Function listWorkers takes options: continuationToken, limit, quarantined, workerState but was given isQuarantined`) while filtering workers based on quaratine status.

## v44.16.0

### GENERAL

▶ [patch]
Don't allow additional properties in `worker-response.yml` schema. Updated descriptions in `worker-response.yml` and `list-workers-response.yml` schemas to explain some default values that may occur in the case where the queue knows about the worker, but worker manager does not. Also, updated the GraphQL queries to extract additional needed data.

▶ [patch]
Fix schema validation issues.

▶ [patch]
Upgrade node to the latest LTS release, v16.15.1. Also upgrade `golangci-lint` to 1.46.2.

▶ [patch]
Upgrade to `go1.18.3` from `go1.18.2`.

### DEPLOYERS

▶ [patch] [#5042](https://github.com/taskcluster/taskcluster/issues/5042)
Add a configuration option to disable CORS configuration for the queue's S3
client. This is a step forward for supporting minio as a S3 backend.

▶ [patch] [#5043](https://github.com/taskcluster/taskcluster/issues/5043)
Add a configuration option to enable `s3ForcePathStyle` for the queue's S3 client

### USERS

▶ [minor] [#5085](https://github.com/taskcluster/taskcluster/issues/5085)
Allow Taskcluster to rerun single task from github interface.

▶ [patch]
Replace rust-crypto by hmac-sha256 in the rust client to help with dependency deduplication

▶ [patch]
Update a few rust dependencies in the client crate to help reducing duplicates

## v44.15.5

### GENERAL

▶ [patch]
Handle some null checks with optional chaining. Also, ensure all data is extracted out during `workerManager.listWorkers()` calls.

## v44.15.4

### GENERAL

▶ [patch]
Fix arguments for `get_task_queue_wm_2` (`get_task_queue_wm` is now deprecated).

## v44.15.3

### USERS

▶ [patch]
Remove unneeded read access to `workers` table from `queue` service. Add read access to `task_queues` table to `worker_manager` service for `workerManager.getWorker()` method to prevent 500 permission denied SQL error.

## v44.15.2

### USERS

▶ [patch]
Fix `GRAPHQL_VALIDATION_FAILED` error on ViewWorker query.

## v44.15.1

### USERS

▶ [patch]
Fix output schema validation error when calling `workerManager.listWorkers()` and `workerManager.getWorker()` methods by not requiring additional worker manager fields.

## v44.15.0

### GENERAL

▶ [patch] [#5459](https://github.com/taskcluster/taskcluster/issues/5459)
Add exponential backoff retries to the `dockerPush` function to help alleviate intermittent failures in the `release-publish` task.

### DEPLOYERS

▶ [patch]
Updated k8s ingress API from deprecated `extensions/v1beta1` to `networking.k8s.io/v1` allowing usage of k8s 1.22+

### USERS

▶ [minor] [#5440](https://github.com/taskcluster/taskcluster/issues/5440)
Add functionality to terminate workers via a Terminate Worker button in the Worker views.

▶ [minor] [#3060](https://github.com/taskcluster/taskcluster/issues/3060)
Mix queue and worker info to provide worker manager worker data in Worker views. This additional data also enabled us to provide a Terminate Worker button in the Worker views.

**Deprecated**: `queue.listWorkers()` and `queue.getWorker()`

**Use instead**: `workerManager.listWorkers()` and `workerManager.getWorker()`

▶ [patch] [#5446](https://github.com/taskcluster/taskcluster/issues/5446)
Don't require user to hover over speed dial actions button to reach Raw Log button. Show by default.

▶ [patch] [#5361](https://github.com/taskcluster/taskcluster/issues/5361)
Link Worker State Buttons on Worker Pool Details View to a filtered view of workers in that state.

▶ [patch]
Update some rust dependencies to get rid of duplicated versions of base64

### DEVELOPERS

▶ [minor] [#5152](https://github.com/taskcluster/taskcluster/issues/5152)
Fix default config value and improve prompt message.

## v44.14.0

### GENERAL

▶ [minor] [#5179](https://github.com/taskcluster/taskcluster/issues/5179)
Lazy rendering of big tables. Improves Roles page rendering

▶ [patch]
Go update from 1.18.1 to 1.18.2. Also upgrade golangci-lint from 1.45.2 to 1.46.1.

### WORKER-DEPLOYERS

▶ [minor] [#3490](https://github.com/taskcluster/taskcluster/issues/3490)
Azure: scan only worker pools with errors

## v44.13.7

### GENERAL

▶ [patch]
Deprecate old Azure endpoints that are no longer use:
- `azureCredentials` (Can be migrated to `secrets` service)
- `azureTables`
- `azureTablesSAS`
- `azureContainers`
- `azureContainersSAS`

Remove test dependency on AZURE_ACCOUNT

▶ [patch] [#5287](https://github.com/taskcluster/taskcluster/issues/5287)
fix: remove `temporary` dependency.

### USERS

▶ [patch] [#5363](https://github.com/taskcluster/taskcluster/issues/5363)
The generic-worker no longer resolves tasks as exception that mount a file/directory that has disappeared from the file system. Instead it invalidates the cache entry.

## v44.13.6

### WORKER-DEPLOYERS

▶ [patch] [#4999](https://github.com/taskcluster/taskcluster/issues/4999)
Introduce queue timeout to avoid some cloud calls to be stuck and fail whole scan process.

### USERS

▶ [patch] [#4366](https://github.com/taskcluster/taskcluster/issues/4366)
Display last date active in the worker detail view.

▶ [patch] [#5412](https://github.com/taskcluster/taskcluster/issues/5412)
Docker-worker no longer accepts and ignores arbitrary properties in task payloads. It now only accepts properties defined in its payload schema.

▶ [patch] [#2776](https://github.com/taskcluster/taskcluster/issues/2776)
Show worker tasks from most recent to least recent. Also, link the `taskId` field to the task page.

▶ [patch] [#5433](https://github.com/taskcluster/taskcluster/issues/5433)
Show workers from last recently active. Also, removed the deprecated prop `onChangePage` and replaced with `onPageChange`.

## v44.13.5

### GENERAL

▶ [patch]
Add null check to `lastDateActive` in queue workers serialize() func.

## v44.13.4

No changes

## v44.13.3

### GENERAL

▶ [patch] [bug 1767244](http://bugzil.la/1767244)
Upgrade `hawk` to v9.0.1 to fix a vuln.

## v44.13.2

### DEVELOPERS

▶ [patch]
Fix build.sh

## v44.13.1

### GENERAL

▶ [patch]
Upgrade Node.js version from v16.14.2 to v16.15.0.

### DEPLOYERS

▶ [patch] [#5393](https://github.com/taskcluster/taskcluster/issues/5393)
Make `worker_info_update_frequency` optional.

### WORKER-DEPLOYERS

▶ [patch] [#5336](https://github.com/taskcluster/taskcluster/issues/5336)
Fix scroll to bottom link

### USERS

▶ [patch] [#5395](https://github.com/taskcluster/taskcluster/issues/5395)
Fixed exception in Github service's latest endpoint when using checks reporting

## v44.13.0

### GENERAL

▶ [patch] [#5373](https://github.com/taskcluster/taskcluster/issues/5373)
Allow local UI to run against existing taskcluster installation using `TASKCLUSTER_ROOT_URL`.

▶ [patch] [#5362](https://github.com/taskcluster/taskcluster/issues/5362)
Display task artifacts sorted by importance

▶ [patch] [#5348](https://github.com/taskcluster/taskcluster/issues/5348)
Fix artifact copy functionality.

▶ [patch]
Fix null check error from #5380

▶ [patch]
Upgrades some vulnerable rust deps and rust toolchain from 1.49.0 to 1.60.0.

### WORKER-DEPLOYERS

▶ [minor] [#4999](https://github.com/taskcluster/taskcluster/issues/4999)
Trigger immediate resource provisioning for Azure.

Since operations are already async, this shouldn't slow down provisioning loop.
It is done in attempt to prevent azure workers stay in 'Requested' state until the next `workerScannerAzure` loop picks it up.

▶ [patch] [bug 1613593](http://bugzil.la/1613593)
Adding extra information about failed worker provisioning

### USERS

▶ [patch] [#5364](https://github.com/taskcluster/taskcluster/issues/5364)
The `github/v1/repository/<owner>/<repo>/<branch>/latest` endpoint now supports projects using `checks-v2` reporting.

### Automated Package Updates

<details>
<summary>1 Renovate updates</summary>

* Update dependency jwks-rsa to v2.1.0 (ea3902996)

</details>

## v44.12.3

### GENERAL

▶ [patch]
Return `lastDateActive` from `queue.listWorkers()`.

### Automated Package Updates

<details>
<summary>1 Renovate updates</summary>

* Update dependency eslint to v8.14.0 (3d31a1b0b)

</details>

## v44.12.2

### GENERAL

▶ [patch]
Update `ViewWorkers` query to get `lastDateActive`. Update some schemas too.

### Automated Package Updates

<details>
<summary>1 Renovate updates</summary>

* Update dependency @azure/ms-rest-js to v2.6.1 (02b72bc2e)

</details>

## v44.12.1

### GENERAL

▶ [patch]
`go get` no longer builds or installs packages in module-aware mode, so replacing with `go install`.

## v44.12.0

### GENERAL

▶ [minor]
Go update from 1.17.8 to 1.18.1. Also upgrade golangci-lint from 1.44.2 to 1.45.2.

### WORKER-DEPLOYERS

▶ [patch] [#3163](https://github.com/taskcluster/taskcluster/issues/3163)
Add extra debug information for worker manager provisioner and scanner.

### USERS

▶ [minor] [#4366](https://github.com/taskcluster/taskcluster/issues/4366)
Display the last date active in the queue workers view.

### DEVELOPERS

▶ [minor] [#4366](https://github.com/taskcluster/taskcluster/issues/4366)
Add `last_date_active` column to `queue_workers` table. Add `queue_worker_seen_with_last_date_active`, `quarantine_queue_worker_with_last_date_active`, `get_queue_worker_tqid_with_last_date_active`, and `get_queue_workers_tqid_with_last_date_active` functions for this new column.

Deprecates `quarantine_queue_worker`, `get_queue_worker_tqid`, `get_queue_workers_tqid`, and `queue_worker_seen`.

## v44.11.2



## v44.11.1

### GENERAL

▶ [patch]
Add new counts/capacities to graphql schema.

## v44.11.0

### WORKER-DEPLOYERS

▶ [minor] [#4987](https://github.com/taskcluster/taskcluster/issues/4987)
Worker manager scanner split in two: non-azure providers and azure.

### USERS

▶ [minor] [#4942](https://github.com/taskcluster/taskcluster/issues/4942)
Addresses #4942. Add worker capacities by state for worker pools to UI.

## v44.10.0

### DEVELOPERS

▶ [minor] [#4942](https://github.com/taskcluster/taskcluster/issues/4942)
Addresses #4942. Add `get_worker_pool_with_capacity_and_counts_by_state`, `get_worker_pools_with_capacity_and_counts_by_state`, and `update_worker_pool_with_capacity_and_counts_by_state` functions to get worker counts and capacity by state for worker pools.

Deprecates `get_worker_pool_with_capacity`, `get_worker_pools_with_capacity`, and `update_worker_pool_with_capacity`.

## v44.9.2

### WORKER-DEPLOYERS

▶ [patch]
Change azure nic payload.

## v44.9.1

### WORKER-DEPLOYERS

▶ [patch] [#4987](https://github.com/taskcluster/taskcluster/issues/4987)
Azure cannot create VMs without with Network interface. We create network interface always, but skip provisioning of public IP when it's not needed.
There might be a case where public IP is needed for RDP though.

## v44.9.0

### GENERAL

▶ [patch]
The existing pulse messages for worker-manager are now documented.

### WORKER-DEPLOYERS

▶ [minor] [#4987](https://github.com/taskcluster/taskcluster/issues/4987)
Skip public network creation for Azure workers that only have generic worker config.

### OTHER

▶ Additional change not described here: [#5323](https://github.com/taskcluster/taskcluster/issues/5323).

### Automated Package Updates

<details>
<summary>1 Renovate updates</summary>

* Update dependency node-forge to v1.3.0 [SECURITY] (d53f7ce2a)

</details>

## v44.8.5

### GENERAL

▶ [patch]
Upgrade Node.js version from v16.14.0 to v16.14.2 for OpenSSL security patch.

▶ [patch]
Upgrade to latest `minimist` version to address https://github.com/taskcluster/taskcluster/security/dependabot/73.

▶ [patch]
Upgrade to latest `mocha` version to address https://github.com/taskcluster/taskcluster/security/dependabot/70, https://github.com/taskcluster/taskcluster/security/dependabot/71, and https://github.com/taskcluster/taskcluster/security/dependabot/72.

### USERS

▶ [patch] [#5282](https://github.com/taskcluster/taskcluster/issues/5282)
Fix issue with unicode characters in user profile.

Using Github as oauth provider encodes user profile using base64 encoding,
which, if contains unicode characters, is not decoded properly by `atob()`.

## v44.8.4

### GENERAL

▶ [patch] [#5003](https://github.com/taskcluster/taskcluster/issues/5003)
Allow provisioner to exit instead of being stuck in delayed loop.

### OTHER

▶ Additional changes not described here: [#4999](https://github.com/taskcluster/taskcluster/issues/4999), [#5217](https://github.com/taskcluster/taskcluster/issues/5217).

## v44.8.3

### DEPLOYERS

▶ [patch] [#5235](https://github.com/taskcluster/taskcluster/issues/5235)
Added `__version__`, `__lbheartbeat__`, and `__heartbeat__` endpoints to web-server service. Can be reached at `/api/<service name>/v1/{__version__, __lbheartbeat__, __heartbeat__}`. `__heartbeat__` is simply returning a 200 empty JSON object for now - implementation to follow in individual PRs per service.

### WORKER-DEPLOYERS

▶ [patch] [#5269](https://github.com/taskcluster/taskcluster/issues/5269)
Worker-runner now renews worker credentials at an appropriate time, even if the host hibernates before the credentials expire.

### USERS

▶ [patch] [#5277](https://github.com/taskcluster/taskcluster/issues/5277)
Fix "can't access property length of undefined" that prevented showing missing permissions error.

▶ [patch] [#5274](https://github.com/taskcluster/taskcluster/issues/5274)
fix: `Follow Log` enabled by default to automatically load to bottom of log file.

### DEVELOPERS

▶ [patch] [#5271](https://github.com/taskcluster/taskcluster/issues/5271)
Added missing badge statuses, changed badge colors to be more distinctive.

▶ [patch] [bug 1651965](http://bugzil.la/1651965)
Update get_queue_artifacts_paginated query to use index and speed up query.
Details: https://bugzilla.mozilla.org/show_bug.cgi?id=1651965

▶ [patch] [#5284](https://github.com/taskcluster/taskcluster/issues/5284)
Updated azure test signature due to expiration of existing one.

▶ [patch]
Fix usage of `temporary.writeFile` in `uploadToS3` for docker-worker

## v44.8.2

### GENERAL

▶ [patch]
Go patch update from 1.17.7 to 1.17.8. Also upgrade golangci-lint from 1.39.0 to 1.44.2.

### DEPLOYERS

▶ [patch] [#5234](https://github.com/taskcluster/taskcluster/issues/5234)
Added initial `/__heartbeat__` endpoint to all service APIs. Simply returning a 200 empty JSON object for now - implementation to follow in individual PRs per service.
Addresses issues 5234, 5236, 5237, 5238, 5239, 5240, 5241, 5242

### Automated Package Updates

<details>
<summary>1 Renovate updates</summary>

* Update dependency karma to v6.3.16 [SECURITY] (cf36b0cc8)

</details>

## v44.8.1

### DEPLOYERS

▶ [patch] [#5235](https://github.com/taskcluster/taskcluster/issues/5235)
Added ingress to the web-server service to access the `__version__` and `__lbheartbeat__` endpoints. Can be reached at `/api/web-server/v1/{__version__, __lbheartbeat__}`.
These were added to comply with the [Dockerflow standard](https://github.com/mozilla-services/Dockerflow/#containerized-app-requirements).

### USERS

▶ [patch] [#5247](https://github.com/taskcluster/taskcluster/issues/5247)
Pagination and filters shown conditionally

▶ [patch]
Fix the badge generation when using the badge API. It now works when deployed through helm too

### DEVELOPERS

▶ [patch]
Introduces `dev:ensure:db` and `dev:ensure:rabbit` commands to ensure postgres and rabbit have necessary user accounts and permissions.
Updated `dev-deployment.md` with instructions how to set up own rabbitmq/posgres for testing/dev puropses.

### OTHER

▶ Additional change not described here: [#5150](https://github.com/taskcluster/taskcluster/issues/5150).

## v44.8.0

### DEPLOYERS

▶ [patch]
Added `__version__` and `__lbheartbeat__` endpoints to all services. Can be reached at `/api/<service name>/v1/{__version__, __lbheartbeat__}`.
These were added to comply with the [Dockerflow standard](https://github.com/mozilla-services/Dockerflow/#containerized-app-requirements).

### USERS

▶ [minor] [#5139](https://github.com/taskcluster/taskcluster/issues/5139)
Added support for `reporting: checks-v1` in generated github badges

## v44.7.2

### USERS

▶ [patch] [#5181](https://github.com/taskcluster/taskcluster/issues/5181)
Added "Copy URL" to the artifacts table.

Added filter row functionality for big tables.

▶ [patch] [#5027](https://github.com/taskcluster/taskcluster/issues/5027)
Clicking on a secret row now works outside of the text part as well

### Automated Package Updates

<details>
<summary>1 Renovate updates</summary>

* Update golang.org/x/sys commit hash to f242548 (f92231483)

</details>

## v44.7.1

### GENERAL

▶ [patch]
Remove unneeded nginx config, `tcp_nopush` as it's already set in the default config by nginx.

## v44.7.0

### GENERAL

▶ [patch] [#4983](https://github.com/taskcluster/taskcluster/issues/4983)
Improved snapshot testing with react-testing-library (instead of Enzyme).
Fixes UI menu for the task actions: correct icon for tasks named `^(rerun|retrigger)`.
Improves ViewTask page: show all details without "Show more/show less".
Shows artifacts by default, if there's less than 10 of them.

▶ [patch]
Updated nginx user config location due to node LTS upgrade changing paths from `/etc/nginx/conf.d/default.conf` to `/etc/nginx/http.d/default.conf`.
Also, added `__heartbeat__` config back to `nginx.conf` to continue to serve 200s until work in https://github.com/taskcluster/taskcluster/issues/4597 is complete.

### USERS

▶ [minor] [#3540](https://github.com/taskcluster/taskcluster/issues/3540)
`generic-worker` tasks can now use `tar.xz` and `tar.zst` formatted mounts.

## v44.6.1

### DEVELOPERS

▶ [patch] [#5193](https://github.com/taskcluster/taskcluster/issues/5193)
Fix webpack loader to properly handle `.mjs` modules.

Include `yarn build` in testing pipeline to avoid inconsistent dependencies.

## v44.6.0

### GENERAL

▶ [minor]
Node.js major update from 14.17.15 to 16.13.2, the latest LTS version.

Update the worker-ci image from Ubuntu 14.04 to 20.04, the current LTS version.
This image is used in Taskcluster CI testing. This includes Python 3.8 (as
python3), needed to build with node-gyp, and no longer includes Python 2.7.
It also updates the Docker engine from 18.06.3 to 20.10.12.

▶ [minor]
Node.js minor update from 16.13.2 to 16.14.0, the latest LTS version.

▶ [minor]
This release updates the `docker-worker-websocket-client` and
`docker-worker-websocket-server` libraries, used by `docker-worker` to execute
commands inside a running container. These updates fix a bug when reading and
writing data to the process in the container, which may have been broken since
2015, and be a part of why VNC was broken
(see [issue 3542](https://github.com/taskcluster/taskcluster/issues/3542#issuecomment-746934147)).
This change required for Node v16, and may affect tasks that use this library like the
[interactive feature](https://docs.taskcluster.net/docs/reference/workers/docker-worker/features#feature-interactive).

▶ [patch]
Go patch update from 1.17.6 to 1.17.7.

▶ [patch]
Replaced `github.com/dgrijalva/jwt-go` with `github.com/golang-jwt/jwt/v4` as suggested in the *high* dependabot vulnerability listed [here](https://github.com/taskcluster/taskcluster/security/dependabot/19).

▶ [patch] [#4940](https://github.com/taskcluster/taskcluster/issues/4940)
Sets the content type of the json returned by the `__heartbeat__` and `__lbheartbeat__` endpoints.

### USERS

▶ [patch] [#5153](https://github.com/taskcluster/taskcluster/issues/5153)
Fixes https://github.com/taskcluster/taskcluster/issues/5153. CLI signin now properly redirects to a success page.

### DEVELOPERS

▶ [patch]
Replacing ui test runner from `karma` to `jest` to allow snapshot testing.

### Automated Package Updates

<details>
<summary>4 Renovate updates</summary>

* Update dependency error-stack-parser to v2.0.7 (a5e2e2848)
* Update dependency cronstrue to v1.125.0 (180be8ada)
* Update dependency memorystore to v1.6.7 (dbae29c2a)
* Update dependency sinon to v13 (aebe0f51b)

</details>

## v44.5.0

### GENERAL

▶ [patch] [#5082](https://github.com/taskcluster/taskcluster/issues/5082)
Updated go from 1.16.7 to 1.17.6. This fixes an issue where the generic worker
failed to build on M1 MacBooks (arm64).

### USERS

▶ [minor]
Fixed artifacts pagination

### OTHER

▶ Additional change not described here: [#5070](https://github.com/taskcluster/taskcluster/issues/5070).

### Automated Package Updates

<details>
<summary>7 Renovate updates</summary>

* Update dependency marked to v4.0.12 (0906dace1)
* Update dependency commander to v9 (1f4311d02)
* Update dependency node-forge to v1.2.1 (5c574d544)
* Update dependency matrix-js-sdk to v15 (7cf55a467)
* Update dependency node-fetch to v2.6.7 [SECURITY] (0cfcab9dd)
* Update dependency apollo-server-express to v3 (181db987b)
* Update dependency github-slugger to v1.4.0 (d44be4204)

</details>

## v44.4.0

### DEPLOYERS

▶ [patch] [#5039](https://github.com/taskcluster/taskcluster/issues/5039)
The new `queue.aws_endpoint` Helm configuration value allows setting the endpoint used to access S3 buckets.  This configuration enables use of non-AWS S3-compatible backends.

### DEVELOPERS

▶ [minor] [#4614](https://github.com/taskcluster/taskcluster/issues/4614)
This version drops support for Python-2.7 in the Python client. Python-2.7's support window ended over one year ago.

### OTHER

▶ Additional change not described here: [#4594](https://github.com/taskcluster/taskcluster/issues/4594).

## v44.3.1



## v44.3.0

### GENERAL

▶ [patch]
In the Monitoring Services document, display the generated table of scheduled tasks.

▶ [patch] [bug 1735159](http://bugzil.la/1735159)
UI no longer visually emphasizes special characters of scopes (reverts #974 / #904).

### WORKER-DEPLOYERS

▶ [patch] [#4926](https://github.com/taskcluster/taskcluster/issues/4926)
Adds release binary for generic-worker-simple on MacOS arm64.

▶ [patch] [#5011](https://github.com/taskcluster/taskcluster/issues/5011)
In worker-runner, the static provider is incompatible with cacheOverRestarts.  The tool now produces more useful error messages in this situaiton.

Worker-runner also fails with a useful error message if its credentials are too old on startup, as might happen if a worker restart takes too long.

▶ [patch] [bug 1635730](http://bugzil.la/1635730)
generic-worker multiuser engine running on macOS will now attempt to cleanup /private/var/folders when deleting a task OS user account.

### ADMINS

▶ [patch] [#4999](https://github.com/taskcluster/taskcluster/issues/4999)
The registration-error-warning, logged from the Azure provider's register()
function in worker-manager, now includes workerPoolId, providerID, and
workerID in its context.

When register-error-warning is due to the state not being REQUESTED,
the workerState is also in the context.

### USERS

▶ [minor] [#2679](https://github.com/taskcluster/taskcluster/issues/2679)
Now after `taskcluster signin` the sign in dialog is shown instead of message if user is not logged in.

▶ [patch] [#4962](https://github.com/taskcluster/taskcluster/issues/4962)
Clicking on the role row now works outside of the text part as well

### DEVELOPERS

▶ [minor] [#5021](https://github.com/taskcluster/taskcluster/issues/5021)
for `upload_artifact` from `client-py` let `contet` be `bytes` or `str`.

▶ [patch] [#4242](https://github.com/taskcluster/taskcluster/issues/4242)
Replacing the UI element for non-editable object display to allow yaml/json serialization

### OTHER

▶ Additional changes not described here: [#4939](https://github.com/taskcluster/taskcluster/issues/4939), [#4947](https://github.com/taskcluster/taskcluster/issues/4947), [#4997](https://github.com/taskcluster/taskcluster/issues/4997), [#5106](https://github.com/taskcluster/taskcluster/issues/5106).

### Automated Package Updates

<details>
<summary>6 Renovate updates</summary>

* Update dependency prismjs to v1.25.0 [SECURITY] (ba2350c98)
* Update dependency react-router-dom to v5.2.1 (470a49616)
* Update dependency marked to v3.0.2 (85607db2e)
* Update dependency marked to v3.0.1 (2223cdcee)
* Update dependency generate-password to v1.6.1 (038c1f6c6)
* Update dependency marked to v3 (4a868be54)

</details>

## v44.2.2

### DEPLOYERS

▶ [patch]
No changes. Deployment failed for 44.2.1 as well.

## v44.2.1

### DEPLOYERS

▶ [patch]
No changes. Deployment failed on 44.2.0 due to intermittent network issue.

## v44.2.0

### GENERAL

▶ [minor]
Upgrade from node 14.16.1 to 14.17.5, and from go 1.16.3 to 1.16.7.

### ADMINS

▶ [patch] [#4946](https://github.com/taskcluster/taskcluster/issues/4946)
On the UI page /hooks, fix the "no hooks" detection so that hook groups are displayed.

### OTHER

▶ Additional change not described here: [#4944](https://github.com/taskcluster/taskcluster/issues/4944).

## v44.1.0

### USERS

▶ [minor] [bug 1131975](http://bugzil.la/1131975)
taskcluster command line tool to validate json against a schema. having syntax `taskcluster validate-json https://some_schema.json https://example.son`

▶ [patch] [#4896](https://github.com/taskcluster/taskcluster/issues/4896)
The queue no longer returns 500 errors when calling `queue.getArtifact` for an object artifact.

### DEVELOPERS

▶ [patch] [#4934](https://github.com/taskcluster/taskcluster/issues/4934)
When running ``yarn dev:init``, store the RabbitMQ cluster management API
origin at ``meta.rabbitAdminManagementOrigin`` rather than the root key
``rabbitAdminManagementOrigin``.  This avoids a schema validation error when
running ``yarn dev:apply``. If you've already run ``yarn dev:init``, then you
can manually move ``rabbitAdminManagementOrigin`` in ``dev-config.yml``.

▶ [patch] [#2749](https://github.com/taskcluster/taskcluster/issues/2749)
updated the hook component to be using ListView from material-ui

### OTHER

▶ Additional change not described here: [#4920](https://github.com/taskcluster/taskcluster/issues/4920).

### Automated Package Updates

<details>
<summary>4 Renovate updates</summary>

* Update dependency dot-prop-immutable to v2.1.1 (ab1053410)
* Update dependency dotenv to v10 (2a5debab3)
* Update dependency highlight.js to v11 (580294e2e)
* Update golang.org/x/net commit hash to 04defd4 (26471370b)

</details>

## v44.0.0

### GENERAL

▶ [patch] [bug 1712924](http://bugzil.la/1712924)
Resolves an issue with github logins

### DEPLOYERS

▶ [patch] [#4882](https://github.com/taskcluster/taskcluster/issues/4882)
Taskcluster-lib-pulse now supports connections to servers that use SNI, such as up-to-date CloudAMQP clusters using a custom certificate.  It does so by passing an explicit `servername` socket option.

### WORKER-DEPLOYERS

▶ [patch] [#4606](https://github.com/taskcluster/taskcluster/issues/4606)
Generic-worker now supports downloading object artifacts as well as the older s3 artifacts.

### USERS

▶ [MAJOR] [#4895](https://github.com/taskcluster/taskcluster/issues/4895)
The upload helper functions included with each client now take an uploadId parameter.  For Go and Rust, these parameters are required.

▶ [patch] [bug 1711612](http://bugzil.la/1711612)
Retried calls to `queue.createArtifact` will now work correctly, allowing both retries and the documented updates.

▶ [patch] [#4764](https://github.com/taskcluster/taskcluster/issues/4764)
The JS, Rust, Go (in a previous release) and Python clients now have artifact download functions which will download an artifact regardless of its storage type, applying retries and other best practices.

▶ [patch] [#4714](https://github.com/taskcluster/taskcluster/issues/4714)
The client libraries' object-upload functions now calculate and send hashes for the uploaded objects.

▶ [patch] [#4890](https://github.com/taskcluster/taskcluster/issues/4890)
This version fixes a bug in the rust client where API methods with method POST but without a request payload would result in 411 errors due to a missing Content-Length header.

▶ [patch] [bug 1711921](http://bugzil.la/1711921)
When a docker-worker's payload specifies an artifact name ending with `/`, it has historically produced an artifact containing `//`.  That is now normalized to a single `/`.

### OTHER

▶ Additional changes not described here: [#4757](https://github.com/taskcluster/taskcluster/issues/4757), [#4807](https://github.com/taskcluster/taskcluster/issues/4807), [#4889](https://github.com/taskcluster/taskcluster/issues/4889).

### Automated Package Updates

<details>
<summary>40 Renovate updates</summary>

* Update golang.org/x/crypto commit hash to c07d793 (ea40252e1)
* Update dependency markdown-it-highlightjs to v3.5.0 (d67d60600)
* Update babel monorepo to v7.14.2 (115ac480b)
* Update dependency @slack/web-api to v6.2.3 (3d16b170a)
* Update dependency newrelic to v7.4.0 (90fe4b739)
* Update dependency @slack/web-api to v6.2.2 (7ba2251ef)
* Update dependency @slack/web-api to v6.2.0 (b25bc43b5)
* Update dependency dotenv to v9.0.2 (dfbf4b795)
* Update dependency @azure/ms-rest-js to v2.5.0 (7c591e5e6)
* Update dependency matrix-js-sdk to v10.1.0 (b3ccf63db)
* Update sentry monorepo to v6.3.6 (710cf7ec4)
* Update dependency dotenv to v9.0.1 (04f077b34)
* Update dependency date-fns to v2.21.3 (48c0813c0)
* Update dependency eslint to v7.26.0 (97e6c18e8)
* Update dependency @fontsource/roboto to v4.3.0 (09b4e5db2)
* Update dependency mocha to v8.4.0 (4557c4f26)
* Update dependency glob to v7.1.7 (bf726bf1e)
* Update dependency cronstrue to v1.113.0 (467bf9cc1)
* Update dependency webpack-cli to v4.7.0 (a196ecfde)
* Update dependency react-error-boundary to v3.1.2 (83fda51a3)
* Update dependency dotenv to v9 (da7db4cf8)
* Update dependency @azure/ms-rest-js to v2.4.1 (bd381f834)
* Update dependency dotenv to v8.6.0 (0504cbc01)
* Update dependency dotenv to v8.5.1 (7c1d516fa)
* Update dependency date-fns to v2.21.2 (1bd674399)
* Update dependency prism-themes to v1.7.0 (79933532b)
* Update dependency @babel/preset-env to v7.14.1 (9a0a0acdf)
* Update golang.org/x/crypto commit hash to e9a3299 (785646e19)
* Update dependency utf-8-validate to v5.0.5 (d03cd44fc)
* Update dependency sift to v13.5.3 (ff7806d5e)
* Update dependency c8 to v7.7.2 (9ea49cac1)
* Update dependency googleapis to v73 (b1d025c50)
* Update dependency @babel/core to v7.14.0 (e9403fe28)
* Update dependency apollo-server-express to v2.24.0 (c3b2d47bd)
* Update sentry monorepo to v6.3.5 (6254bca4c)
* Update sentry monorepo to v6.3.4 (f964f5786)
* Update babel monorepo to v7.14.0 (cc6150681)
* Update dependency graphql-tag to v2.12.4 (890bc312c)
* Update mui monorepo (436da33e3)
* Update module github.com/Microsoft/go-winio to v0.5.0 (4837680df)

</details>

## v43.2.0

### DEPLOYERS

▶ [minor] [#4746](https://github.com/taskcluster/taskcluster/issues/4746)
The object service is now ready for use.
The queue supports an `object` storage type which will be stored in the object service.
As of this version, we recommended setting `procs: 1` for the object service if it had previously been set to `0`, and [configuring at least one backend](https://docs.taskcluster.net/docs/manual/deploying/object-service) for artifacts.

▶ [patch] [#4648](https://github.com/taskcluster/taskcluster/issues/4648)
All services now have a `<service>.pulse_amqps` Helm configuration that controls whether to use amqps (with TLS) to communicate with the Pulse server.  The value defaults to true, matching current behavior, but can be set to false in cases where the AMQP server is local and encryption is unnecessary.

▶ [patch]
The object service now defaults to 1 replica, not 0.  The service will not start if it is not properly configured, and we recommend setting the service up at this time, as in the next major release workers will begin uploading objects to the queue.

### WORKER-DEPLOYERS

▶ [minor] [bug 1631824](http://bugzil.la/1631824)
The Azure provider of the worker-manager service now assigns unique names to all data disks attached to a VM, allowing those disks to be removed when the worker is removed.

▶ [patch] [#4765](https://github.com/taskcluster/taskcluster/issues/4765)
Native "Apple silicon" binaries of taskcluster-proxy, livelog, start-worker and generic-worker are provided (darwin-arm64). The darwin amd64 executables no longer need to be run through Rosetta 2 binary translation on darwin/arm64 workers.

▶ [patch] [#3925](https://github.com/taskcluster/taskcluster/issues/3925)
The worker-manager service now ships with the latest CA certs, avoiding the need to download these at runtime.  These certificates are good until October 8, 2024.

### OTHER

▶ Additional changes not described here: [#4707](https://github.com/taskcluster/taskcluster/issues/4707), [#4779](https://github.com/taskcluster/taskcluster/issues/4779), [#4795](https://github.com/taskcluster/taskcluster/issues/4795).

### Automated Package Updates

<details>
<summary>36 Renovate updates</summary>

* Update dependency nodemailer to v6.6.0 (017dabd7a)
* Update dependency graphql-scalars to v1.9.3 (45bc9229d)
* Update dependency dockerode to v3.3.0 (8468771e4)
* Update dependency acorn-walk to v8.1.0 (441cbbd37)
* Update dependency acorn-loose to v8.1.0 (3173f9ef7)
* Update dependency @sentry/node to v6.3.1 (2d544b14e)
* Update sentry monorepo to v6.3.1 (97356358d)
* Update module github.com/elastic/go-sysinfo to v1.7.0 (fec645d00)
* Update dependency eslint to v7.25.0 (7a16de292)
* Update dependency cron-parser to v3.5.0 (544d48373)
* Update dependency matrix-js-sdk to v10 (a8b8859ce)
* Update dependency sift to v13.5.2 (9f53306db)
* Update dependency mock-fs to v4.14.0 (2db47d750)
* Update dependency jwks-rsa to v2.0.3 (03791e002)
* Update module github.com/Microsoft/go-winio to v0.4.19 (5948f9cde)
* Update dependency @octokit/auth-app to v3.4.0 (cd84ff0c0)
* Update dependency codemirror to v5.61.0 (2230e8455)
* Update dependency chalk to v4.1.1 (1a83c1860)
* Update dependency @octokit/rest to v18.5.3 (8d73079f6)
* Update dependency serialize-error to v8.1.0 (c2e871c97)
* Update dependency cron-parser to v3.4.0 (30614faef)
* Update sentry monorepo to v6.3.0 (ad265870e)
* Update babel monorepo to v7.13.16 (b06a39065)
* Update module github.com/Microsoft/go-winio to v0.4.18 (549708f6b)
* Update dependency @azure/ms-rest-js to v2.4.0 (63e03fbb4)
* Update dependency cronstrue to v1.112.0 (5cff320d3)
* Update dependency material-ui-json-schema-viewer to v1.2.0 (ea79b2183)
* Update dependency fast-azure-storage to v3.1.4 (705d8460e)
* Update golang.org/x/net commit hash to e915ea6 (55c6abd6d)
* Update golang.org/x/sys commit hash to 66c3f26 (c957d084c)
* Update golang.org/x/crypto commit hash to 4f45737 (85a4e60dd)
* Update dependency ws to v7.4.5 (226ed46e3)
* Update dependency escape-string-regexp to v5 (7de69356b)
* Update dependency markdown-it to v12.0.6 (37ffe8301)
* Update dependency markdown-it to v12.0.5 (82cf42d2b)
* Update dependency date-fns to v2.21.1 (71095d097)

</details>

## v43.1.0

### GENERAL

▶ [patch] [#4696](https://github.com/taskcluster/taskcluster/issues/4696)
The `github.com/taskcluster/taskcluster/vNN/workers/generic-worker/mocktc` library is no longer publicly exposed.

▶ [patch]
Upgrade from node 14.16.0 to 14.16.1 across services and docker-worker.

### DEPLOYERS

▶ [patch] [bug 1442024](http://bugzil.la/1442024)
The object service now serves `text/html` content with `Content-Disposition: attachment` to avoid security issues inherent in serving arbitrary HTML documents.

### WORKER-DEPLOYERS

▶ [patch]
Go major version upgrade for generic-worker and worker-runner (go 1.15.6 -> go 1.16.3). Prerequisite step for providing native darwin/arm64 binaries for both (native Apple Silicon builds).

### USERS

▶ [minor] [#4548](https://github.com/taskcluster/taskcluster/issues/4548)
The queue now additionally supports artifacts with the storageType `object`, stored via the object service.

▶ [patch] [#4576](https://github.com/taskcluster/taskcluster/issues/4576)
The shell client now has two new commands to download data from Taskcluster:
 * `taskcluster download object <name> <filename>` -- download directly from the object service
 * `taskcluster download artifact <taskId> [<runId>] <name> <filename>` -- download the content of an artifact
These commands follow current best practices, including retries with backoff.  When supported by the object service, they will also verify download integrity.

▶ [patch] [#4698](https://github.com/taskcluster/taskcluster/issues/4698)
Uploading functions in the Python client have been renamed to use camel-case instead of underscores.

### OTHER

▶ Additional changes not described here: [#4623](https://github.com/taskcluster/taskcluster/issues/4623), [#4631](https://github.com/taskcluster/taskcluster/issues/4631), [#4739](https://github.com/taskcluster/taskcluster/issues/4739), [#4741](https://github.com/taskcluster/taskcluster/issues/4741), [#4744](https://github.com/taskcluster/taskcluster/issues/4744).

### Automated Package Updates

<details>
<summary>20 Renovate updates</summary>

* Update dependency js-yaml to v4.1.0 (bc2dda559)
* Update dependency apollo-server-express to v2.23.0 (66941613e)
* Update dependency newrelic to v7.3.1 (bd6a791e4)
* Update dependency date-fns to v2.21.0 (64f8cc301)
* Update module github.com/Microsoft/go-winio to v0.4.17 (426fca502)
* Update dependency @azure/arm-network to v24 (f825d482d)
* Update dependency pg to v8.6.0 (30f5a5e10)
* Update dependency pg-connection-string to v2.5.0 (2242418b5)
* Update dependency date-fns to v2.20.3 (ca4880d6a)
* Update dependency matrix-js-sdk to v9.11.0 (ddae91aeb)
* Update dependency date-fns to v2.20.2 (4f6c915d6)
* Update dependency googleapis to v71 (b3a9a029e)
* Update dependency marked to v2.0.3 (9b7f98b46)
* Update dependency @fontsource/roboto to v4.2.3 (80ca3de16)
* Update dependency eslint to v7.24.0 (b41017797)
* Update dependency mock-aws-s3 to v4.0.2 (9be4a7c0e)
* Update dependency date-fns to v2.20.1 (ecc66230b)
* Update babel monorepo to v7.13.15 (9a5a263fd)
* Update dependency taskcluster-client-web to v43 (9fd14d658)
* Update dependency taskcluster-client to v43 (ef7574f3c)

</details>

## v43.0.0

### DEPLOYERS

▶ [patch] [#4655](https://github.com/taskcluster/taskcluster/issues/4655)
Since #4586 landed, the built-in-workers service has failed to resolve tasks due to using the wrong credentials.  This issue has been fixed, and no released version of Taskcluster had this bug.

▶ [patch] [#4561](https://github.com/taskcluster/taskcluster/issues/4561)
The GitHub service now allows collaborators to test out a `.taskcluster.yml` in a PR, when there is no such file in the default branch initialized yet.

▶ [patch] [#4556](https://github.com/taskcluster/taskcluster/issues/4556)
The `auth.azure_accounts` Helm value is no longer required.

▶ [patch] [#3981](https://github.com/taskcluster/taskcluster/issues/3981)
The new `queue.task_claim_timeout` Helm configuration parameter controls the duration of the task claim that `queue.claimWork` returns.  The default is 20 minutes, matching the previous hard-coded setting.

### WORKER-DEPLOYERS

▶ [MAJOR] [#3779](https://github.com/taskcluster/taskcluster/issues/3779)
Generic-worker simple/docker engine now have a default tasks directory of `tasks`, relative to the working directory. This is a breaking change from previous behaviour.

▶ [patch] [#4691](https://github.com/taskcluster/taskcluster/issues/4691)
Added a generic-worker config parameter (`livelogPortBase`) to allow configuring which ports are used for live logging.

▶ [patch] [#4715](https://github.com/taskcluster/taskcluster/issues/4715)
The worker-manager service now deprovisions workers when `removeWorker` is called and when the workers terminate themselves.  Previously it would wait forever for such workers to be deleted, without attempting that deletion.

### USERS

▶ [MAJOR] [#4586](https://github.com/taskcluster/taskcluster/issues/4586)
The following queue API endpoints no longer support their legacy scopes.
In most of these cases, the legacy scopes are shorter than the still-supported fully-qualified scopes.
* `queue.claimTask` no longer accepts `queue:claim-task`.
* `queue.reclaimTask` no longer accepts `queue:reclaim-task`.
* `queue.reportCompleted` and `queue.reportException` no longer accept `queue:resolve-task`.
* `queue.createArtifact` no longer accepts `queue:create-artifact:<name>`.

Investigations detailed in the linked issue suggest that none of these scopes are actively used.

▶ [minor] [#4516](https://github.com/taskcluster/taskcluster/issues/4516)
The index service has a new `index.deleteTask` method that can be used to delete indexed tasks.

▶ [minor] [#4547](https://github.com/taskcluster/taskcluster/issues/4547)
This version adds new queue methods `artifact`, `latestArtifact`, `artifactInfo`, and `latestArtifactInfo`, all of which provide more flexible access to information about artifacts.

▶ [patch] [#4502](https://github.com/taskcluster/taskcluster/issues/4502)
The GitHub service now correctly handles tasks that depend on other tasks not defined in `.taskcluster.yml`.

▶ [patch] [#3794](https://github.com/taskcluster/taskcluster/issues/3794)
The worker manager no longer considers quarantined users in its definition of existing capacity. If necessary, it will provision new workers for any pending tasks as if the quarantined worker did not exist.

### DEVELOPERS

▶ [patch] [#2393](https://github.com/taskcluster/taskcluster/issues/2393)
On the Secrets and Roles pages, a delete button now appears on each row.

▶ [patch]
The client libraries (Go, Python, Rust, and JS) now provide convenience methods for uploading/downloading objects to/from the Object Service.

▶ [patch] [#3964](https://github.com/taskcluster/taskcluster/issues/3964)
The styleguidist support in `ui/` was outdated and has been removed.

### OTHER

▶ Additional changes not described here: [bug 1419577](http://bugzil.la/1419577), [bug 1701255](http://bugzil.la/1701255), [#3948](https://github.com/taskcluster/taskcluster/issues/3948), [#3993](https://github.com/taskcluster/taskcluster/issues/3993), [#4133](https://github.com/taskcluster/taskcluster/issues/4133), [#4420](https://github.com/taskcluster/taskcluster/issues/4420), [#4422](https://github.com/taskcluster/taskcluster/issues/4422), [#4423](https://github.com/taskcluster/taskcluster/issues/4423), [#4424](https://github.com/taskcluster/taskcluster/issues/4424), [#4453](https://github.com/taskcluster/taskcluster/issues/4453), [#4523](https://github.com/taskcluster/taskcluster/issues/4523), [#4587](https://github.com/taskcluster/taskcluster/issues/4587), [#4592](https://github.com/taskcluster/taskcluster/issues/4592), [#4608](https://github.com/taskcluster/taskcluster/issues/4608), [#4610](https://github.com/taskcluster/taskcluster/issues/4610), [#4631](https://github.com/taskcluster/taskcluster/issues/4631), [#4631](https://github.com/taskcluster/taskcluster/issues/4631), [#4646](https://github.com/taskcluster/taskcluster/issues/4646), [#4649](https://github.com/taskcluster/taskcluster/issues/4649), [#4705](https://github.com/taskcluster/taskcluster/issues/4705), [#4722](https://github.com/taskcluster/taskcluster/issues/4722), [#4537](https://github.com/taskcluster/taskcluster/issues/4537).

### Automated Package Updates

<details>
<summary>87 Renovate updates</summary>

* Update dependency date-fns to v2.20.0 (147161c51)
* Update dependency aws-sdk to v2.882.0 (66b55c44b)
* Update dependency c8 to v7.7.1 (1114447ee)
* Update golang.org/x/crypto commit hash to 0c34fe9 (2f3539aba)
* Update dependency newrelic to v7.3.0 (f40bd6f02)
* Update dependency @octokit/core to v3.4.0 (ecea473b8)
* Update dependency googleapis to v70 (9f337e00c)
* Update dependency highlight.js to v10.7.2 (df0248dcc)
* Update dependency netmask to v2.0.2 (c1b85704c)
* Update dependency classnames to v2.3.1 (e1288ae9d)
* Update dependency ajv-formats to v1.6.1 (c732037d2)
* Update sentry monorepo to v6.2.5 (acb83ddba)
* Lock file maintenance (a64902252)
* Update dependency classnames to v2.3.0 (801d4b22e)
* Update dependency @azure/ms-rest-nodeauth to v3.0.9 (cd67b124b)
* Update dependency @sentry/browser to v6.2.4 (f4dabf757)
* Update sentry monorepo to v6.2.4 (8095de61d)
* Update babel monorepo (33994a37a)
* Update dependency semver to v7.3.5 (75b8729ee)
* Update dependency matrix-js-sdk to v9.10.0 (144178e0e)
* Update dependency @octokit/core to v3.3.2 (09794f9ac)
* Update dependency newrelic to v7.2.1 (e1353ac2b)
* Update dependency webpack-cli to v4.6.0 (39826fb85)
* Update dependency c8 to v7.7.0 (1274fa2c3)
* Update dependency cronstrue to v1.111.0 (fe975dfd2)
* Update dependency karma to v6.3.2 (3014cf357)
* Update babel monorepo (571dfed8d)
* Update dependency apollo-server-express to v2.22.2 (e034c01f0)
* Update dependency ajv-formats to v1.6.0 (b770ddccc)
* Update dependency ajv to v7.2.4 (b7e86e1b9)
* Update dependency netmask to v2.0.1 [SECURITY] (12ccc3d98)
* Update dependency @azure/ms-rest-js to v2.3.0 (f52fa443a)
* Update dependency eslint to v7.23.0 (2b5cfe601)
* Update dependency @octokit/rest to v18.5.2 (8e18d296c)
* Update dependency newrelic to v7.2.0 (70660da47)
* Update dependency sanitize-html to v2.3.3 (8bca0746c)
* Update dependency jwks-rsa to v2.0.2 (7391cd61c)
* Update dependency qs to v6.10.1 (b64ae138f)
* Update dependency karma to v6.3.1 (9c2ccbbc7)
* Update dependency mockdate to v3.0.5 (57361d447)
* Update dependency apollo-server-express to v2.22.1 (824e1ab8c)
* Update dependency commander to v7.2.0 (fa9fbf0b9)
* Update dependency @octokit/rest to v18.5.0 (791826713)
* Update dependency email-templates to v8.0.4 (15aea7477)
* Update dependency @octokit/auth-app to v3.3.0 (9b1f6093b)
* Update dependency highlight.js to v10.7.1 (e133da2c1)
* Update dependency codemirror to v5.60.0 (3bc8581f6)
* Update dependency @azure/arm-compute to v16.1.0 (3b612f872)
* Update dependency @azure/ms-rest-nodeauth to v3.0.8 (209a76159)
* Update dependency @azure/arm-network to v23.3.0 (e4349eb8a)
* Update dependency prism-themes to v1.6.0 (b1bdf6d93)
* Update babel monorepo (1eaf00a21)
* Update dependency sinon to v10 (90090115e)
* Update dependency mocha to v8.3.2 (597d41365)
* Update dependency netmask to v2 (baca3986e)
* Update dependency json-e to v4.4.1 (36a027bd7)
* Update dependency got to v11.8.2 (a2d93a036)
* Update dependency memorystore to v1.6.6 (edd1dffbb)
* Update dependency apollo-server-express to v2.21.2 (c07a423a4)
* Update dependency qs to v6.10.0 (744632b5d)
* Update dependency mockdate to v3.0.4 (212ec99f4)
* Update dependency ajv to v7 (0894eba1a)
* Update module github.com/sirupsen/logrus to v1.8.1 (6c60fe019)
* Update dependency query-string to v7 (b57ba45bd)
* Update sentry monorepo to v6.2.2 (e4780e450)
* Update dependency ws to v7.4.4 (0d0288e0f)
* Update dependency nock to v13.0.11 (d3e475f55)
* Update dependency mocha to v8.3.2 (82ecf1082)
* Update dependency mockdate to v3.0.3 (8294292ef)
* Update dependency @octokit/core to v3.3.1 (da988bc58)
* Update dependency jwks-rsa to v2.0.1 (a31c440d6)
* Update dependency eslint to v7.22.0 (86b38bc82)
* Update dependency chai to v4.3.4 (bdcc64e37)
* Update dependency matrix-js-sdk to v9.9.0 (f51fbb19e)
* Update dependency json-e to v4.4.1 (5247310e6)
* Update dependency @material-ui/pickers to v3.3.10 (1973bbaf7)
* Update dependency jwks-rsa to v2 (1f3634f04)
* Update dependency newrelic to v7.1.3 (75ea84a48)
* Update dependency cronstrue to v1.110.0 (98ac5e7f9)
* Update dependency apollo-server-express to v2.21.1 (df7622487)
* Update dependency amqplib to v0.7.1 (612d1bc8d)
* Update dependency @slack/web-api to v6.1.0 (12ae248d4)
* Update dependency karma to v6.2.0 (549495342)
* Update dependency @octokit/rest to v18.3.5 (284fdbdc4)
* Update dependency @octokit/core to v3.3.0 (c30372968)
* Update dependency nock to v13.0.11 (30d166150)
* Update dependency nodemailer to v6.5.0 (619bcc75f)

</details>

## v42.1.1

### USERS

▶ [patch] [#4519](https://github.com/taskcluster/taskcluster/issues/4519)
Tasks with `priority` or `requires` can once again be created via the UI. (This includes creating interactive tasks.)

### Automated Package Updates

<details>
<summary>4 Renovate updates</summary>

* Update babel monorepo to v7.13.10 (1026e2d45)
* Update dependency mocha to v8.3.1 (6667e8596)
* Update dependency @azure/arm-compute to v16 (02d180889)
* Update dependency @sentry/browser to v6.2.1 (8fbf8ac79)

</details>

## v42.1.0

### USERS

▶ [minor] [#4470](https://github.com/taskcluster/taskcluster/issues/4470)
The task-creator and retrigger function now treat task definitions as a JSON object, accepting new properties such as `taskQueueId` and `projectId`.

▶ [patch] [#4502](https://github.com/taskcluster/taskcluster/issues/4502)
A case where an invalid .taskcluster.yml would not result in a user-visible error has been fixed

### DEVELOPERS

▶ [patch] [#2393](https://github.com/taskcluster/taskcluster/issues/2393)
On the page where all clients are listed, added Delete icon beside each client. This helps to delete client faster without going to the Client page.

### OTHER

▶ Additional change not described here: [#4458](https://github.com/taskcluster/taskcluster/issues/4458).

### Automated Package Updates

<details>
<summary>20 Renovate updates</summary>

* Update dependency @octokit/rest to v18.3.4 (f5b805bbf)
* Update dependency date-fns to v2.19.0 (c8cae454e)
* Update dependency @octokit/rest to v18.3.3 (1b64a996e)
* Update sentry monorepo to v6.2.1 (a52b78160)
* Update dependency cron-parser to v3.3.0 (69a28fc11)
* Update dependency react-error-boundary to v3.1.1 (71b86fafb)
* Update dependency chai to v4.3.3 (e8ac053e9)
* Update dependency matrix-js-sdk to v9.8.0 (87fad9cd5)
* Update dependency marked to v2.0.1 (59bb9f3c6)
* Update Node.js to v14.16.0 (2617e646a)
* Update dependency eslint to v7.21.0 (143a2abb8)
* Update dependency @octokit/rest to v18.3.2 (75e899684)
* Update dependency date-fns to v2.18.0 (b3ac91860)
* Update dependency nock to v13.0.10 (3d1f5667a)
* Update dependency nock to v13.0.9 (5ae899c61)
* Update dependency chai to v4.3.1 (a0b21ef23)
* Update babel monorepo (11b91534e)
* Update dependency @octokit/rest to v18.3.0 (aeb0296cd)
* Update dependency taskcluster-client-web to v42 (36d2b1c01)
* Update dependency taskcluster-client to v42 (d2211e9b2)

</details>

## v42.0.0

### USERS

▶ [MAJOR] [#4437](https://github.com/taskcluster/taskcluster/issues/4437)
The `hooks.triggerHook` and `hooks.triggerHookWithToken` methods now returns only `{taskId: .., status: { taskId: .. } }`, where previously they returned an entire task-status data structure.  Callers which require those status fields must be modified to request the status directly (`queue.status`) before this upgrade occurs.

### Automated Package Updates

<details>
<summary>12 Renovate updates</summary>

* Update babel monorepo to v7.13.8 (3cd03d493)
* Update dependency query-string to v6.14.1 (6c7ed0bcb)
* Update dependency memorystore to v1.6.5 (4284afc0b)
* Update dependency got to v11.8.2 (981c118eb)
* Update dependency jwks-rsa to v1.12.3 (2ffc76841)
* Update dependency inquirer to v8 (ea0ca23e9)
* Update dependency nock to v13.0.8 (11b33a5e5)
* Update dependency nock to v13.0.8 (e4dc8307b)
* Update dependency newrelic to v7.1.2 (8c8c0ca89)
* Update dependency @octokit/rest to v18.2.1 (7ec67f16b)
* Update dependency codemirror to v5.59.4 (b15982674)
* Update dependency @azure/ms-rest-nodeauth to v3.0.7 (6458929f8)

</details>

## v41.1.0

### WORKER-DEPLOYERS

▶ [minor] [#4050](https://github.com/taskcluster/taskcluster/issues/4050)
Docker-worker and generic-worker now use `link` artifacts to connect `live.log` to `live_backing.log`.  This functionality requires Taskcluster services running at least Taskcluster-40.0.0.

### USERS

▶ [minor] [#4455](https://github.com/taskcluster/taskcluster/issues/4455)
As of this version, the [Javascript client library](https://www.npmjs.com/package/taskcluster-client) now uses [got](https://github.com/sindresorhus/got) instead of superagent to make its HTTP requests.  There is no intentional user-visible impact.

### OTHER

▶ Additional changes not described here: [#4386](https://github.com/taskcluster/taskcluster/issues/4386), [#4444](https://github.com/taskcluster/taskcluster/issues/4444).

### Automated Package Updates

<details>
<summary>20 Renovate updates</summary>

* Update dependency @babel/core to v7.13.1 (ce29caebb)
* Update babel monorepo (24d1da5a8)
* Update babel monorepo (f618db2be)
* Update dependency amqplib to ^0.7.0 (f70461923)
* Update dependency cron-parser to v3.2.0 (59a72b449)
* Update dependency lodash to v4.17.21 (b30652b40)
* Update golang.org/x/crypto commit hash to 5ea612d (28097fc3f)
* Update dependency googleapis to v67.1.0 (0c5d822fa)
* Update dependency @octokit/rest to v18.2.0 (6f3c21f13)
* Update dependency @babel/core to v7.12.17 (57ef685a2)
* Update dependency @octokit/auth-app to v3 (937576b35)
* Update babel monorepo to v7.12.17 (b07c8c07f)
* Update dependency @sentry/node to v6.2.0 (740c24508)
* Update sentry monorepo to v6.2.0 (12ec38548)
* Update dependency taskcluster-client to v41.0.2 (3ff1a5635)
* Update dependency c8 to v7.6.0 (19ddaf425)
* Update module sirupsen/logrus to v1.8.0 (dfe199479)
* Update dependency taskcluster-client-web to v41.0.2 (ba08701d5)
* Update dependency taskcluster-client to v41 (deba99393)
* Update dependency mime to v2.5.2 (8617ada01)

</details>

## v41.0.2

### USERS

▶ [patch] [#4417](https://github.com/taskcluster/taskcluster/issues/4417)
In a followup to a bug partially fixed in v41.0.1, the `hooks.triggerHook` function no longer crashes due to the `projectId` property from `queue.createTask`.

### OTHER

▶ Additional change not described here: [#4405](https://github.com/taskcluster/taskcluster/issues/4405).

### Automated Package Updates

<details>
<summary>1 Renovate updates</summary>

* Update dependency taskcluster-client-web to v41.0.1 (efd467ae9)

</details>

## v41.0.1

### USERS

▶ [patch] [#4417](https://github.com/taskcluster/taskcluster/issues/4417)
The `hooks.triggerHook` method no longer fails with a 500 error, and now correctly includes the `taskQueueId` property.

▶ [patch] [#4411](https://github.com/taskcluster/taskcluster/issues/4411)
The `queue.createArtifact` method now allows specifying a contentType for "link" artifacts, which is necessary to indicate to the UI that a link can be viewed as a logfile.

▶ [patch] [#4304](https://github.com/taskcluster/taskcluster/issues/4304)
The queue now better tracks workers.  In particular, it will not "lose track of" a worker which resumes claiming work a short time after it expires, and workers will not immediately expire after being un-quarantined.

### OTHER

▶ Additional changes not described here: [#4273](https://github.com/taskcluster/taskcluster/issues/4273), [#4274](https://github.com/taskcluster/taskcluster/issues/4274), [#4340](https://github.com/taskcluster/taskcluster/issues/4340), [#4346](https://github.com/taskcluster/taskcluster/issues/4346), [#4380](https://github.com/taskcluster/taskcluster/issues/4380), [#4388](https://github.com/taskcluster/taskcluster/issues/4388).

### Automated Package Updates

<details>
<summary>21 Renovate updates</summary>

* Update dependency mocha to v8.3.0 (205958586)
* Update dependency eslint to v7.20.0 (7654b7449)
* Update module sirupsen/logrus to v1.7.1 (87369652b)
* Update dependency matrix-js-sdk to v9.7.0 (37289c213)
* Update dependency commander to v7.1.0 (e62b471a5)
* Update dependency aws-sdk to v2.843.0 (1266aaf06)
* Update dependency eslint to v7.20.0 (981d5f82b)
* Update dependency karma to v6.1.1 (02ee7187f)
* Update dependency @octokit/rest to v18.1.1 (6be5adbc4)
* Update module golang.org/x/tools to v0.1.0 (a7613ff48)
* Update golang.org/x/sys commit hash to 22da62e (42ff3f3d2)
* Update dependency aws-sdk to v2.842.0 (ec4e97e35)
* Update dependency apollo-server-express to v2.21.0 (f53175ae8)
* Update dependency mocha to v8.3.0 (deecc9b82)
* Update dependency @azure/ms-rest-js to v2.2.3 (3826a4ccd)
* Update babel monorepo (807282eb6)
* Update dependency nodemailer to v6.4.18 (89cf9dff9)
* Update module spf13/cobra to v1.1.3 (1a944988b)
* Update module elastic/go-sysinfo to v1.6.0 (a3dc77d83)
* Update dependency taskcluster-client-web to v41 (95d780f0c)
* Update Node.js to v14.15.5 (24ca296cb)

</details>

## v41.0.0

### GENERAL

▶ [patch] [#4272](https://github.com/taskcluster/taskcluster/issues/4272)
The experimental `object.uploadObject` endpoint has been removed and replaced with `object.createUpload`.  The object service remains entirely experimental and further breaking changes will be made without major version bumps.

### DEPLOYERS

▶ [patch] [#4276](https://github.com/taskcluster/taskcluster/issues/4276)
The worker-manager service will now start up even if one of its providers is down or misconfigured.  Worker pools using that provider will not be provisioned, but other pools will continue to operate normally.

### WORKER-DEPLOYERS

▶ [patch] [#4336](https://github.com/taskcluster/taskcluster/issues/4336)
Worker-Runner now correctly includes the `workerGroup` and `workerId` properties in error reports.

### ADMINS

▶ [MAJOR] [#4262](https://github.com/taskcluster/taskcluster/issues/4262)
Tasks now have a `projectId` property that can be used to distinguish tasks for different purposes run in the same Taskcluster deployment.  The `queue.createTask` method now requires scope `queue:create-task:project:<projectId>`, permitting administrative control over which clients can create tasks for which projects.

The default `projectId` is `none`.  To avoid permissions errors on upgrade, _we recommend that `queue:create-task:project:none` be added to the `anonymous` role_ before upgrading to this version.  Once the upgrade is complete, callers may be modified to create tasks with non-default `projectId` and given appropriate scopes.

▶ [minor] [#4270](https://github.com/taskcluster/taskcluster/issues/4270)
Task manipulation (rerun, cancel, schedule) is now controlled by scopes related to the task's `projectId`, completing implementation of [RFC#163](https://github.com/taskcluster/taskcluster-rfcs/blob/main/rfcs/0163-project-id.md).  With this change, and with the inclusion of `projectId` in task definitions, administrators can control task manipulation by granting `queue:<verb>-task-in-project:<projectId>` scopes to the appropriate entities.

▶ [patch]
Upgrade to Sentry v6, but disable the new
[session tracking feature](https://docs.sentry.io/product/releases/health/)
with ``autoSessionTracking: false``, to avoid collecting more data than is
needed.

### USERS

▶ [MAJOR] [#3581](https://github.com/taskcluster/taskcluster/issues/3581)
Client methods that took two separate provisionerId and taskQueueId parameters take now a
single parameter (workerPoolId or taskQueueId depending on the service involved).
Affected methods are `queue.claimWork`, `queue.pendingTasks`, `purgeCache.purgeCache` and `purgeCache.purgeRequests`.
The API maintains compatibility at the URL level.

▶ [MAJOR] [#4058](https://github.com/taskcluster/taskcluster/issues/4058)
The `queue.getArtifact` and `queue.getLatestArtifact` methods now also return a JSON body containing the URL from which the artifact can be downlodaed, in addition to the existing behavior, returning a 303 redirect.

This is a major change only because it changes the function signatures in the Go client.

▶ [minor] [#3580](https://github.com/taskcluster/taskcluster/issues/3580)
The queue service API responses will now include the taskQueueId, which will match provisionerId/workerType,
which are also returned. Also, it is now possible to create tasks supplying a taskQueueId instead of the
separate provisionerId and workerType identifiers.

▶ [minor] [#4247](https://github.com/taskcluster/taskcluster/issues/4247)
Updating an artifact from a `reference` type to `link` type now correctly updates the artifact type.

▶ [patch] [#4248](https://github.com/taskcluster/taskcluster/issues/4248)
Fixed an issue where listing tasks with link artifacts would cause errors.

▶ [patch] [#4269](https://github.com/taskcluster/taskcluster/issues/4269)
The task properties `projectId` and `taskQueueId` are now displayed in the Taskcluster UI, and referenced appropriately in the documentation.

▶ [patch] [bug 1562993](http://bugzil.la/1562993)
generic-worker now only reports the first error it encounters when a task fails or hits an exception.

### DEVELOPERS

▶ [minor] [#4058](https://github.com/taskcluster/taskcluster/issues/4058)
Client libraries no longer treat redirects as errors.  The methods that return redirects are those which involve fetching artifacts, and typically these have required generating signed URLs.  With this change, these methods can be called directly and will return a JSON payload containing a `url` property from which the artifact can be downloaded.  The fetch API does not support reading bodies from redirects, so this functionality is not available in `taskcluster-client-web`, which treats redirects as errors.

▶ [minor] [#2393](https://github.com/taskcluster/taskcluster/issues/2393)
On the page where all roles are listed, added Delete icon beside each role. This helps to delete role faster without going to the Role page.

▶ [minor]
Taskcluster now sports a [Rust client](https://crates.io/crates/taskcluster)!

▶ [patch] [#3789](https://github.com/taskcluster/taskcluster/issues/3789)
Fixed an issue where when there's no more data, the continuationToken property was not being omitted, but being returned as just an empty string. Depending on implementation, that could cause a caller to loop endlessly calling the purge cache endpoint.

### OTHER

▶ Additional changes not described here: [#3868](https://github.com/taskcluster/taskcluster/issues/3868), [#4250](https://github.com/taskcluster/taskcluster/issues/4250), [#4275](https://github.com/taskcluster/taskcluster/issues/4275), [#4279](https://github.com/taskcluster/taskcluster/issues/4279), [#4281](https://github.com/taskcluster/taskcluster/issues/4281), [#4295](https://github.com/taskcluster/taskcluster/issues/4295), [#4296](https://github.com/taskcluster/taskcluster/issues/4296), [#4298](https://github.com/taskcluster/taskcluster/issues/4298), [#4256](https://github.com/taskcluster/taskcluster/issues/4256).

### Automated Package Updates

<details>
<summary>72 Renovate updates</summary>

* Update dependency query-string to v6.14.0 (d70ebc565)
* Update module spf13/cobra to v1.1.2 (7c1a3babb)
* Update dependency apollo-server-express to v2.20.0 (fa538f309)
* Update dependency @azure/ms-rest-js to v2.2.2 (a3e59510f)
* Update dependency cronstrue to v1.109.0 (aa93110ef)
* Update module iancoleman/strcase to v0.1.3 (c89c50a0e)
* Update module stretchr/testify to v1.7.0 (96a598b19)
* Update dependency highlight.js to v10.6.0 (cd903e6a2)
* Update golang.org/x/crypto commit hash to eec23a3 (5fe6c1f96)
* Update dependency marked to v2 (234a640e3)
* Update dependency ejs to v3.1.6 (cb8cc22da)
* Update module elastic/go-sysinfo to v1.5.0 (78f6353b2)
* Update dependency @azure/ms-rest-js to v2.2.1 (5b3b11db5)
* Update dependency date-fns to v2.17.0 (ce96b29ce)
* Update sentry monorepo to v6.1.0 (0d1408eb7)
* Update dependency chai to v4.3.0 (e6fc2405c)
* Update babel monorepo to v7.12.13 (49950d969)
* Update dependency marked to v1.2.9 (aa3ec7c8c)
* Update dependency @octokit/auth-app to v2.11.0 (65396ccb9)
* Update dependency matrix-js-sdk to v9.6.0 (6f2b477d8)
* Update dependency @octokit/rest to v18.1.0 (b9ad5c885)
* Update dependency ws to v7.4.3 (78b30fdb6)
* Update dependency webpack-cli to v4.5.0 (5d6d0b831)
* Update dependency c8 to v7.5.0 (9db09c543)
* Update dependency newrelic to v7.1.1 (2c8519036)
* Update sentry monorepo to v6.0.3 (dbbdb7833)
* Update module iancoleman/strcase to v0.1.3 (de22bfbd0)
* Update dependency eslint to v7.19.0 (f3f70a764)
* Update dependency nock to v13.0.7 (b1ac62537)
* Update dependency nock to v13.0.7 (8615932ef)
* Update module stretchr/testify to v1.7.0 (3b4ea18e0)
* Update module elastic/go-sysinfo to v1.5.0 (3794486e3)
* Update dependency webpack-dev-server to v3.11.2 (8587aca66)
* Update dependency webpack to v4.46.0 (6aceb7b30)
* Update dependency webpack-cli to v4.4.0 (4982bcbbe)
* Update dependency eslint to v7.18.0 (20b6a7527)
* Update dependency sinon to v9.2.4 (57bca859a)
* Update dependency sanitize-html to v2.3.2 (8fabfd6b7)
* Update dependency nock to v13.0.6 (02ecca7d3)
* Update dependency serialize-error to v8.0.1 (e1fdbc7da)
* Update dependency matrix-js-sdk to v9.5.1 (cd9f945a0)
* Update dependency marked to v1.2.8 (9d921a8ab)
* Update dependency acorn-walk to v8.0.2 (95e5bf321)
* Update dependency taskcluster-client-web to v40.0.3 (e5579a129)
* Update dependency nock to v13.0.6 (5017fdf4a)
* Update dependency mime to v2.5.0 (9bccd0435)
* Update dependency graphql to v15.5.0 (2c59c3c26)
* Update dependency @octokit/rest to v18.0.15 (b58a6416f)
* Update dependency @azure/ms-rest-js to v2.2.0 (b9c8b7f4d)
* Update dependency @azure/ms-rest-azure-js to v2.1.0 (93c81b140)
* Update dependency @octokit/plugin-retry to v3.0.7 (4851f7ee9)
* Update dependency @octokit/core to v3.2.5 (a15e4defe)
* Update dependency @octokit/auth-app to v2.10.6 (64e3d72e0)
* Update dependency acorn-loose to v8.0.2 (7af7813fd)
* Update dependency @octokit/rest to v18.0.14 (6e0ee4824)
* Update dependency @material-ui/core to v4.11.3 (28145c5f8)
* Update dependency eslint to v7.18.0 (6834bebe9)
* Update dependency cronstrue to v1.108.0 (629b69016)
* Update dependency codemirror to v5.59.2 (a32e9b320)
* Update dependency @azure/arm-network to v23.2.0 (e07e686ad)
* Update github.com/pkg/browser commit hash to ce105d0 (765e463e7)
* Update sentry monorepo to v6 (603dac189)
* Update dependency qs to v6.9.6 (22848779d)
* Update dependency commander to v7 (720306753)
* Update dependency taskcluster-client to v40.0.3 (31ea584d3)
* Update dependency react-copy-to-clipboard to v5.0.3 (2b94c9355)
* Update dependency generate-password to v1.6.0 (5b86a0ee2)
* Update dependency cronstrue to v1.107.0 (5c6e0349b)
* Update dependency apollo-server-express to v2.19.2 (3fa6e81fa)
* Update dependency @slack/web-api to v6 (cc9617816)
* Update dependency cron-parser to v3 (a5cfda50c)
* Update dependency googleapis to v67 (fd08b1405)

</details>

## v40.0.3

No changes

## v40.0.2

No changes

## v40.0.1

### GENERAL

▶ [patch] [#4238](https://github.com/taskcluster/taskcluster/issues/4238)
The index service should now work in deployments without anonymous scopes.

### USERS

▶ [patch] [#4240](https://github.com/taskcluster/taskcluster/issues/4240)
The "Task Definition" link in the task view now shows the task as a normal UI page, preventing permissions errors on non-public deployments.

▶ [patch] [#4239](https://github.com/taskcluster/taskcluster/issues/4239)
This version fixes a bug in the user-interface causing messages about `yaml.safeDump` having been removed.  The developers regret te error.

### DEVELOPERS

▶ [patch] [#4226](https://github.com/taskcluster/taskcluster/issues/4226)
The `yarn generate` command no longer combines redundant lines in `yarn.lock` files, so that automatic dependency upgrade PRs will succeed.  Run `yarn minify` to do this manually.

### OTHER

▶ Additional change not described here: [#4110](https://github.com/taskcluster/taskcluster/issues/4110).

### Automated Package Updates

<details>
<summary>9 Renovate updates</summary>

* Update dependency serialize-error to v8 (78c1b374f)
* Update dependency webpack to v4.45.0 (f1b892f7a)
* Update dependency jwks-rsa to v1.12.2 (fe86a779e)
* Update dependency aws-sdk to v2.824.0 (4f5a1a2eb)
* Update dependency email-templates to v8.0.3 (1594300b5)
* Update dependency taskcluster-client-web to v40 (848d015bb)
* Update dependency taskcluster-client to v40 (5c97645de)
* Update dependency sinon to v9.2.3 (db38e81e6)
* Update dependency @azure/ms-rest-azure-js to v2.0.2 (48cebac91)

</details>

## v40.0.0

### DEPLOYERS

▶ [minor]
This version removes the unused deployment configuration variable `queue.use_cloud_mirror` and `queue.public_artifact_ec2_proxies`.  Neither served any useful purpose, and it is unlikely that either value appears in any deployment configuration.

### WORKER-DEPLOYERS

▶ [patch] [#4125](https://github.com/taskcluster/taskcluster/issues/4125)
Workerpools now correctly understand the `reregistrationTimeout` option.

### USERS

▶ [MAJOR] [#3773](https://github.com/taskcluster/taskcluster/issues/3773)
Support for superseding has been removed.  See the linked issue for the detailed reasoning.  While workers still allow `supersederUrl` in payloads, it has no effect.  Older workers running with newer services that try to supersede tasks will encounter errors.  No known instances of superseding exist.

▶ [MAJOR] [#4123](https://github.com/taskcluster/taskcluster/issues/4123)
The `taskcluster-client-web` library no longer implements `OIDCCredentialAgent`.  This agent interfaced with a `login.taskclutser.net` service that no longer exists.

▶ [MAJOR] [#3604](https://github.com/taskcluster/taskcluster/issues/3604)
The notify service no longer supports irc notifications.  IRC is declining in popularity and no known deployments of Taskcluster support this functionality, but it is nonetheless considered a breaking API change.

▶ [minor] [#4050](https://github.com/taskcluster/taskcluster/issues/4050)
The queue has a new artifact type, `link`, allowing links between artifacts on the same task.

▶ [patch] [#4057](https://github.com/taskcluster/taskcluster/issues/4057)
All clients (JS, Python, Go, Web, Shell) now fail when an API method results in a redirect, rather than following that redirect.  The API methods that return redirects are those related to Taskcluster artifacts, and these methods must be accessed by building and fetching a signed URL.

▶ [patch] [#2721](https://github.com/taskcluster/taskcluster/issues/2721)
Taskcluster-proxy now correctly proxies "non-canonical" URLs, such as those containing `//` or urlencoded values.

▶ [patch] [#3878](https://github.com/taskcluster/taskcluster/issues/3878)
The Taskcluster UI now handles artifacts better, avoiding huge URLs that expire quickly.

▶ [patch] [#3983](https://github.com/taskcluster/taskcluster/issues/3983)
The UI will no longer fail when viewing a task with dependencies that have expired.

▶ [patch] [#4199](https://github.com/taskcluster/taskcluster/issues/4199)
The `sift` dependency has been updated again, to a version that does not cause #4061.

▶ [patch] [#1064](https://github.com/taskcluster/taskcluster/issues/1064)
The `taskcluster` command now parses errors from the API, and does not show the command usage when an error occurs.

▶ [patch] [#3758](https://github.com/taskcluster/taskcluster/issues/3758)
The `taskcluster` command will now display a warning after a short delay if it is expecting a request payload on stdin.

### DEVELOPERS

▶ [minor] [#3578](https://github.com/taskcluster/taskcluster/issues/3578)
The queue service now uses `taskQueueId` internally instead of the pair `provisionerId`/`workerType` for tasks.

▶ [patch] [#3894](https://github.com/taskcluster/taskcluster/issues/3894)
Postgres errors now include a Sentry fingerprint to help distinguish them in error reports.

### OTHER

▶ Additional changes not described here: [#2398](https://github.com/taskcluster/taskcluster/issues/2398), [#2875](https://github.com/taskcluster/taskcluster/issues/2875), [#3466](https://github.com/taskcluster/taskcluster/issues/3466), [#3665](https://github.com/taskcluster/taskcluster/issues/3665), [#3739](https://github.com/taskcluster/taskcluster/issues/3739), [#3751](https://github.com/taskcluster/taskcluster/issues/3751), [#3888](https://github.com/taskcluster/taskcluster/issues/3888), [#4072](https://github.com/taskcluster/taskcluster/issues/4072), [#4125](https://github.com/taskcluster/taskcluster/issues/4125), [#4209](https://github.com/taskcluster/taskcluster/issues/4209), [#3718](https://github.com/taskcluster/taskcluster/issues/3718).

### Automated Package Updates

<details>
<summary>57 Renovate updates</summary>

* Update dependency newrelic to v7.1.0 (2cb90683e)
* Update Node.js to v14.15.4 (bd0d9a57a)
* Update dependency @slack/web-api to v5.15.0 (fea65786f)
* Update dependency acorn-walk to v8.0.1 (1d857fc33)
* Update dependency utf-8-validate to v5.0.4 (cbbf60248)
* Update dependency koa to v2.13.1 (cd17fccb9)
* Update dependency googleapis to v66 (b6bd1a987)
* Update sentry monorepo to v5.29.2 (817a223d2)
* Update mui monorepo (c4f1f8c9c)
* Update dependency js-yaml to v4 (b8509c2a4)
* Update dependency bufferutil to v4.0.3 (f691ab48e)
* Update dependency eslint to v7.17.0 (7c79a038f)
* Update mdx monorepo to v1.6.22 (d236a70c6)
* Update module yaml to v2.4.0 (7e637237c)
* Update dependency prismjs to v1.23.0 (dc1886a2e)
* Update module Microsoft/go-winio to v0.4.16 (f562e47b3)
* Update dependency webpack-cli to v4.3.1 (d6b462978)
* Update dependency react-window to v1.8.6 (f3a183920)
* Update dependency react-virtualized to v9.22.3 (a481007f1)
* Update dependency react-ga to v3.3.0 (b3ddb6bd7)
* Update dependency codemirror to v5.59.1 (7bb0feb02)
* Update dependency @azure/arm-network to v23.1.0 (46a8dccc2)
* Update dependency c8 to v7.4.0 (466c3e6f7)
* Update dependency query-string to v6.13.8 (43170db8f)
* Update dependency tar-stream to v2.2.0 (a017d4d28)
* Update dependency ws to v7.4.2 (3dc4ab697)
* Update dependency sanitize-html to v2.3.0 (ff7cd00b0)
* Update dependency webpack-dev-server to v3.11.1 (423cf40ed)
* Update dependency tar-fs to v2.1.1 (28895e6cd)
* Update dependency webpack-cli to v4.3.0 (7211360c8)
* Update dependency utf-8-validate to v5.0.3 (d8d3803ec)
* Update dependency title-case to v3.0.3 (556ed50b6)
* Update dependency taskcluster-client to v39.2.0 (14a427606)
* Update dependency jwks-rsa to v1.12.1 (2d29ca170)
* Update dependency uuid to v8.3.2 (80911d9b4)
* Update neutrino monorepo to v9.5.0 (40b45edc8)
* Update dependency upper-case to v2.0.2 (7d5e79e58)
* Update dependency snake-case to v3.0.4 (c1de6493d)
* Update dependency query-string to v6.13.7 (19d86aa12)
* Update dependency pg to v8.5.1 (baa6a87fc)
* Update dependency highlight.js to v10.5.0 (9d1d25892)
* Update dependency apollo-server-express to v2.19.1 (56f4a7541)
* Update dependency @babel/plugin-proposal-decorators to v7.12.12 (a8b891eb3)
* Update dependency param-case to v3.0.4 (3dac59740)
* Update dependency nodemailer to v6.4.17 (501d01a1c)
* Update dependency nock to v13.0.5 (ad95fa052)
* Update dependency builtin-modules to v3.2.0 (e3c12a224)
* Update dependency mime to v2.4.7 (cd1f0615f)
* Update dependency matrix-js-sdk to v9.4.1 (2c5af7952)
* Update dependency markdown-it to v12.0.4 (078c57cd9)
* Update dependency codemirror to v5.59.0 (da7a9bed2)
* Update babel monorepo (7b34e84c0)
* Update dependency open-editor to v3 (146729258)
* Update dependency eslint to v7.16.0 (977f6bd49)
* Update dependency marked to v1.2.7 (605aae3d8)
* Update dependency hashids to v2.2.8 (0a9dc3b67)
* Update Node.js to v14.15.3 (edd186cab)

</details>

## v39.2.0

### WORKER-DEPLOYERS

▶ [patch]
This version fixes an error where a worker pool with an invalid providerId would cause all worker provisioning to cease.

### USERS

▶ [minor] [#3542](https://github.com/taskcluster/taskcluster/issues/3542)
Docker-worker no longer supports VNC access to interactive tasks.  This support has been broken for ages and unused.

▶ [patch]
The `taskcluster-client-web` library client classes now have a `buildSignedUrlSync` method.

▶ [patch] [#4056](https://github.com/taskcluster/taskcluster/issues/4056)
The taskcluster-proxy no longer follows redirects.  In practice, this is only an issue when calling the artifact-related API methods that return a redirect to the artifact content.  The proxy will now return the redirect response unchanged.

### DEVELOPERS

▶ [minor] [#3578](https://github.com/taskcluster/taskcluster/issues/3578)
The tasks table uses `task_queue_id` instead of separate `provisioner_id/worker_type` to identify task queues.
This change is applied through an online migration process.

### OTHER

▶ Additional change not described here: [#3940](https://github.com/taskcluster/taskcluster/issues/3940).

### Automated Package Updates

<details>
<summary>5 Renovate updates</summary>

* Update Node.js to v14.15.2 (8689b010a)
* Update dependency hashids to v2.2.3 (7e4eec9db)
* Update dependency commander to v6.2.1 (beef8ecea)
* Update dependency newrelic to v7.0.2 (2068dbca1)
* Update dependency marked to v1.2.6 (7b44747e4)

</details>

## v39.1.2

### USERS

▶ [patch]
The octokit throttling plugin has been removed in this release.
We did not appear to understand its assumptions. It will probably
come back later once we understand it better.

### OTHER

▶ Additional changes not described here: [#3892](https://github.com/taskcluster/taskcluster/issues/3892), [#4012](https://github.com/taskcluster/taskcluster/issues/4012).

### Automated Package Updates

<details>
<summary>1 Renovate updates</summary>

* Update dependency sinon to v9.2.2 (0dc9ff6f3)

</details>

## v39.1.1

### DEPLOYERS

▶ [patch] [#4034](https://github.com/taskcluster/taskcluster/issues/4034)
The queue's artifact expiration crontask now uses a much more efficient query and should be able to keep up with the load.

### USERS

▶ [patch] [#3797](https://github.com/taskcluster/taskcluster/issues/3797)
A race condition in github checks updates has been resolved

### DEVELOPERS

▶ [patch] [#4064](https://github.com/taskcluster/taskcluster/issues/4064)
Taskcluster services and docker-worker now use Node 14, the current LTS version.

### OTHER

▶ Additional changes not described here: [#2981](https://github.com/taskcluster/taskcluster/issues/2981), [#4100](https://github.com/taskcluster/taskcluster/issues/4100).

## v39.1.0

### GENERAL

▶ [patch] [#4059](https://github.com/taskcluster/taskcluster/issues/4059)
Fixed an issue fetching GitHub metadata when using a Taskcluster instance without the anonymous role.

This presented as unexpected 'Failed to get your artifact.' errors.

### USERS

▶ [minor] [#4006](https://github.com/taskcluster/taskcluster/issues/4006)
The `takscluster-client-web` library is no longer installable from a `<script>` tag.
Instead, it should be incorporated into the build process of the consuming application, like any other library.

▶ [patch]
Improved error messages related to fetching artifacts for GitHub checks.

▶ [patch] [#4061](https://github.com/taskcluster/taskcluster/issues/4061)
This version fixes an issue with the "actions" button not appearing for task groups.

### DEVELOPERS

▶ [patch] [#3939](https://github.com/taskcluster/taskcluster/issues/3939)
The object service now supports `uploadId` in the upload process.

▶ [patch] [#4074](https://github.com/taskcluster/taskcluster/issues/4074)
We now use github's library for generating app jwt tokens instead of making our own tokens

### OTHER

▶ Additional changes not described here: [#3951](https://github.com/taskcluster/taskcluster/issues/3951), [#3999](https://github.com/taskcluster/taskcluster/issues/3999), [#4036](https://github.com/taskcluster/taskcluster/issues/4036).

## v39.0.0

### GENERAL

▶ [patch] [#3901](https://github.com/taskcluster/taskcluster/issues/3901)
Fixed a bug where signing public S3 artifacts would result in Forbidden errors on the task and task group views.

▶ [patch] [#3867](https://github.com/taskcluster/taskcluster/issues/3867)
Taskcluster-Github should now function correctly in a deployment with no scopes in the `anonymous` role.

If you have a locked-down deployment without allowing public artifacts fetching in your `anonymous` role, you must add
`queue:get-artifact:public/github/customCheckRunText.md` and `queue:get-artifact:public/github/customCheckRunAnnotations.json`
to the scopes of your task to avoid an error comment being added to your
commits. Note that this will change if you choose a custom artifact name (see custom artifact docs for more)

### DEPLOYERS

▶ [MAJOR] [#3713](https://github.com/taskcluster/taskcluster/issues/3713)
This version introduces a new, in-development object service.  It is currently configured for a default replica count of 0, meaning that it will not run, and this is the recommended configuration.  However, it will nonetheless require configuration of a new database user (`<prefix>_object`).

### WORKER-DEPLOYERS

▶ [minor] [#3669](https://github.com/taskcluster/taskcluster/issues/3669)
The Azure worker-manager takes additional steps to verify the identity proof
during worker registration. The identify proof is the output of the
[attested data API](https://docs.microsoft.com/en-us/azure/virtual-machines/windows/instance-metadata-service#attested-data),
which includes details about the worker and is signed by the Azure platform.

Previously, the worker-manager checked that the message signer was issued by
one of four published intermediate certificates issued by a single root CA.
Azure is planning to expand to five more root CAs (see
[Azure TLS certificate changes](https://docs.microsoft.com/en-us/azure/security/fundamentals/tls-certificate-changes)
for details). The worker-manager now downloads an unknown intermediate
certificate, verifies that it was issued by a known root CAs, and adds it to
the list of trusted certificates. The 4 legacy intermediate certificates, still
in use in Azure as of November 2020, are pre-loaded as trusted certificates.

The worker manager now verifies that the message signer is for
`metadata.azure.com` or a subdomain. This is true for any workers in the
Azure public cloud, but not the sovereign clouds like azure.us.

One of the new root CAs uses Elliptic Curve Cryptography (ECC) instead of RSA.
The Azure worker-manager doesn't support this or other ECC certificates.
This is tracked in [issue #3923](https://github.com/taskcluster/taskcluster/issues/3923).

There is no performance change expected until Azure ships the TLS certificate
changes, planned by February 15, 2021. When new intermediate certificates are
used, there will be up to a 5 second delay on worker registration while the new
certificate is downloaded for the first time. A new manager log entry,
``registration-new-intermediate-certificate``, is emitted after a successful
download and verification, and includes the certificate details.

### USERS

▶ [patch] [#3899](https://github.com/taskcluster/taskcluster/issues/3899)
Docker-worker now decompresses downloaded images when they have a compressed content-encoding, as artifacts produced by docker-worker now have.

▶ [patch] [#3637](https://github.com/taskcluster/taskcluster/issues/3637)
Taskcluster-Github should now avoid spamming an identical comment many times in certain situations.

▶ [patch] [#3982](https://github.com/taskcluster/taskcluster/issues/3982)
The quickstart now correctly shows whether the GitHub integration is enabled for a repository.

▶ [patch] [#3578](https://github.com/taskcluster/taskcluster/issues/3578)
There are two new API methods for the queue service: `listTaskQueues` and `getTaskQueue`

### DEVELOPERS

▶ [minor] [#3578](https://github.com/taskcluster/taskcluster/issues/3578)
The queue service now uses taskQueueId internally, instead of provisionerId/workerType, for worker info
purposes (provisioners, worker types and workers).
The `queue_provisioners` table is dropped and the `queue_worker_types` table is renamed to `task_queues`.

▶ [patch] [#3832](https://github.com/taskcluster/taskcluster/issues/3832)
Octokit now uses github's own retry/rate-limit plugins instead of our own.

### OTHER

▶ Additional changes not described here: [#3712](https://github.com/taskcluster/taskcluster/issues/3712), [#3715](https://github.com/taskcluster/taskcluster/issues/3715), [#3717](https://github.com/taskcluster/taskcluster/issues/3717), [#3719](https://github.com/taskcluster/taskcluster/issues/3719), [#3808](https://github.com/taskcluster/taskcluster/issues/3808), [#3881](https://github.com/taskcluster/taskcluster/issues/3881), [#3898](https://github.com/taskcluster/taskcluster/issues/3898), [#3917](https://github.com/taskcluster/taskcluster/issues/3917), [#3935](https://github.com/taskcluster/taskcluster/issues/3935), [#3937](https://github.com/taskcluster/taskcluster/issues/3937), [#3954](https://github.com/taskcluster/taskcluster/issues/3954), [#3986](https://github.com/taskcluster/taskcluster/issues/3986), [#4009](https://github.com/taskcluster/taskcluster/issues/4009).

## v38.0.6

### GENERAL

▶ [patch] [#3906](https://github.com/taskcluster/taskcluster/issues/3906)
Creating comments on github is fixed in this release

▶ [patch] [#3903](https://github.com/taskcluster/taskcluster/issues/3903)
Scopes are now expanded in between using a certificate's scopes and checking `authorizedScopes`
as well.

### USERS

▶ [patch] [#3908](https://github.com/taskcluster/taskcluster/issues/3908)
E-mail and Slack notifications should now correctly link to the group when the group ID does not match the task ID.

## v38.0.5

### GENERAL

▶ [patch] [#3874](https://github.com/taskcluster/taskcluster/issues/3874)
The notify service now has enough scopes to handle notifications on Taskcluster instances without the anonymous role.

### USERS

▶ [patch] [#3884](https://github.com/taskcluster/taskcluster/issues/3884)
Clients created with third-party sign-in (e.g., `taskcluster signin`) will no longer be disabled if they contain `assume:anonymous` or scopes in that role.

▶ [patch] [#3899](https://github.com/taskcluster/taskcluster/issues/3899)
Docker-worker now skips gzipping artifacts with an `.lz4` extension, in addition to the [existing list of extensions](https://github.com/taskcluster/taskcluster/blob/main/workers/docker-worker/config.yml#L160-L164).

▶ [patch] [#3873](https://github.com/taskcluster/taskcluster/issues/3873)
The `/provisioners/<worker-type>` view now works correctly, fixing the error about reading property `replace` of `null`.

### OTHER

▶ Additional change not described here: [#3837](https://github.com/taskcluster/taskcluster/issues/3837).

## v38.0.4

### DEPLOYERS

▶ [patch]
Setting a node `DEBUG` env var via the `debug` field of service configs is supported again.
If left unset it will default to `''`. Example:

```yaml
auth:
    debug: '*'
```

### USERS

▶ [patch] [#3865](https://github.com/taskcluster/taskcluster/issues/3865)
Livelog TLS support is now functional.

▶ [patch] [#3851](https://github.com/taskcluster/taskcluster/issues/3851)
The GitHub quickstart tool now generates correct `.taskcluster.yml` files, among other bugfixes.

▶ [patch] [#3836](https://github.com/taskcluster/taskcluster/issues/3836)
The web UI no longer fails with "ext.certificate.expiry < now".

▶ [patch] [#3831](https://github.com/taskcluster/taskcluster/issues/3831)
This version fixes an issue introduced in v38.0.0 which would cause the log viewer to display 401 errors.

### DEVELOPERS

▶ [patch]
Config types of `env:list` now generate the correct type in helm schemas.

## v38.0.3

### DEVELOPERS

▶ [patch]
Fix one usage of Octokit in release machinery to fix releases

## v38.0.2

### GENERAL

▶ [patch] [#3843](https://github.com/taskcluster/taskcluster/issues/3843)
Two bugs were fixed that together made it so that tasks could not use indexed images.

First is that docker-worker now correctly uses the task's credentials rather than
its own to query the index.
Second is that scopes are now expanded prior to limiting them with `authorizedScopes`
in addition to afterward.

### DEPLOYERS

▶ [patch] [bug 3759](http://bugzil.la/3759)
As of this version, the DB upgrade process correctly checks access rights and table structures of the Postgres database.

### USERS

▶ [patch] [#3839](https://github.com/taskcluster/taskcluster/issues/3839)
This version fixes an error ("e.artifacts is undefined") in the UI when viewing a task without credentials.  It also improves error reporting from the UI in general.

▶ [patch]
This version includes an explicit scope to allow the github service to list task groups.  Without this, GitHub projects using the older status API will appear "running" forever.

### DEVELOPERS

▶ [patch] [#3733](https://github.com/taskcluster/taskcluster/issues/3733)
The database abstraction layer now supports "online" migrations, iterating over large tables without blocking production use of those tables.  These migrations are entirely managed by the existing `db:upgrade` and `db:downgrade` functions, so this presents no change for deployers.

### OTHER

▶ Additional changes not described here: [bug 1609067](http://bugzil.la/1609067), [#3721](https://github.com/taskcluster/taskcluster/issues/3721), [#3731](https://github.com/taskcluster/taskcluster/issues/3731), [#3732](https://github.com/taskcluster/taskcluster/issues/3732), [#3804](https://github.com/taskcluster/taskcluster/issues/3804), [#3807](https://github.com/taskcluster/taskcluster/issues/3807), [#3827](https://github.com/taskcluster/taskcluster/issues/3827), [#3834](https://github.com/taskcluster/taskcluster/issues/3834).

## v38.0.1

### DEVELOPERS

▶ [patch]
This version fixes an error in docker-worker's release script that caused the 38.0.0 release to fail.

### OTHER

▶ Additional change not described here: [#3738](https://github.com/taskcluster/taskcluster/issues/3738).

## v38.0.0

### GENERAL

▶ [MAJOR] [#3615](https://github.com/taskcluster/taskcluster/issues/3615)
[RFC 165](https://github.com/taskcluster/taskcluster-rfcs/blob/main/rfcs/0165-Anonymous-scopes.md) has been implemented, allowing for greater administrator control over "public" endpoints. Previously these were guarded by no scopes and could be accessed by anyone with no way to limit this. In this release all unauthenticated API calls are now granted the scope `assume:anonymous`.  Additionally, most previously unprotected endpoints are now guarded by at least one scope, to enable the following:

* To maintain current behavior, some scopes will need to be granted to the `anonymous`role. Refer to `the [anonymous role section](https://docs.taskcluster.net/docs/manual/deploying/anonymous-role) in the docs.
* To entirely lock down the cluster from anonymous access, do not grant any scopes to role `anonymous`
* Pick and choose specific "public" endpoints to make available to anonymous requests

Performance testing results (refer to https://github.com/taskcluster/taskcluster/issues/3698 for more details):
* Auth service CPU has seen an increase of 0%-15%
* Auth service memory has seen no increase

### WORKER-DEPLOYERS

▶ [MAJOR] [#3015](https://github.com/taskcluster/taskcluster/issues/3015)
Generic-worker no longer supports the `--configure-for-{aws,gcp,azure}` options.  Instead, the expectation is that generic-worker will be started by worker-runner.  While it remains possible to run generic-worker without worker-runner in a "static" configuration, cloud-based deployments using worker-manager now require worker-runner.

### USERS

▶ [patch] [#3791](https://github.com/taskcluster/taskcluster/issues/3791)
The shell client (the `taskcluster` command) now correctly handles the case where no credentials are provided.  In previous versions, if used to call a method which required credentials, this would result in an error: `Bad Request: Bad attribute value: id`.  With the inclusion of [RFC#165](https://github.com/taskcluster/taskcluster-rfcs/blob/main/rfcs/0165-Anonymous-scopes.md) in this release, this error would occur when calling any method.  The short story is, if you see such errors, upgrade the shell client.

▶ [patch] [#3463](https://github.com/taskcluster/taskcluster/issues/3463)
This release fixes a bug that may occur when a new task is quickly inserted
twice into the index service. When the bug is triggered, one of the insert
calls would fail with a server error. With this fix, the UNIQUE_VIOLATION error
is caught, and the previously failed insert will update the task if the rank is
higher.
This bug was first seen in v37.3.0

▶ [patch] [#3767](https://github.com/taskcluster/taskcluster/issues/3767)
This version adjusts the Python client requirements to avoid `aiohttp==3.7.0`, which has a [serious bug preventing use of HTTPS](https://github.com/aio-libs/aiohttp/issues/5110).

### DEVELOPERS

▶ [patch] [#3502](https://github.com/taskcluster/taskcluster/issues/3502)
A bug where `authenticateHawk` calls would occasionally return an invalid response has been fixed. This issue impacted
reliability but not security.

▶ [patch] [#3748](https://github.com/taskcluster/taskcluster/issues/3748)
The source for the `gw-workers` and `occ-workers` administrative tools has been removed.  The `gw-workers` tool is now at https://github.com/taskcluster/community-tc-utils.

### OTHER

▶ Additional changes not described here: [#3655](https://github.com/taskcluster/taskcluster/issues/3655), [#3662](https://github.com/taskcluster/taskcluster/issues/3662), [#3670](https://github.com/taskcluster/taskcluster/issues/3670), [#3704](https://github.com/taskcluster/taskcluster/issues/3704), [#3730](https://github.com/taskcluster/taskcluster/issues/3730), [#3783](https://github.com/taskcluster/taskcluster/issues/3783), [#3788](https://github.com/taskcluster/taskcluster/issues/3788), [#3793](https://github.com/taskcluster/taskcluster/issues/3793).

## v37.5.1



## v37.5.0

### GENERAL

▶ [minor] [#3640](https://github.com/taskcluster/taskcluster/issues/3640)
Notify routes can now include `on-defined`, `on-pending` and `on-running`.

`on-any` is now deprecated and there are two new alternatives:
- `on-transition` for any state transition.
- `on-resolved` for terminal states (completed, failed and exception).

▶ [patch]
taskcluster-web-server is now equipped with the anonymous role. This will allow
it to assign the anonymous role to users who successfuly login.

### USERS

▶ [minor] [#3521](https://github.com/taskcluster/taskcluster/issues/3521)
Taskcluster-proxy now adds a `Content-Type` header to proxied requests lacking one.  While this behavior is not desirable, it matches the behavior of older versions and real tasks depend on it.  A future version of Taskcluster will drop this behavior.

When this occurs, the worker will log a message containing the string "Adding missing Content-Type header".  Use this logging to find tasks that fail to include the `Content-Type` header and adjust accordingly.

### OTHER

▶ Additional change not described here: [#3679](https://github.com/taskcluster/taskcluster/issues/3679).

## v37.4.0

### GENERAL

▶ [patch] [#3659](https://github.com/taskcluster/taskcluster/issues/3659)
Slack and Email notifications' Task Group URLs are now correct (containing `/tasks`).

▶ [patch] [#3639](https://github.com/taskcluster/taskcluster/issues/3639)
`taskDefined` messages will now always have an unscheduled status.

### USERS

▶ [patch] [#3631](https://github.com/taskcluster/taskcluster/issues/3631)
Calling a JS Client constructor with no arguments works again -- assuming that any necessary configuration was passed to `taskcluster.config(..)`.

### DEVELOPERS

▶ [minor] [#3538](https://github.com/taskcluster/taskcluster/issues/3538)
DB function `get_workers` is now deprecated.

▶ [patch] [#3619](https://github.com/taskcluster/taskcluster/issues/3619)
The `tools/workerproto` Go package is now available for external use, and its API is considered stable (in other words, breaking changes will result in a major version bump).

### OTHER

▶ Additional change not described here: [#3591](https://github.com/taskcluster/taskcluster/issues/3591).

## v37.3.0

### DEPLOYERS

▶ [minor]
A new queue deployment configuration variable `sign_public_artifact_urls` has been added which enables AWS URL signing for all S3 artifacts when true.

▶ [minor] [#3606](https://github.com/taskcluster/taskcluster/issues/3606)
Slack support has been added to the notifications service. You can now
send notifications to Slack channels by using a
`notify.slack.C123456.on-any` style route, or by using the new /slack
API endpoint.

▶ [patch] [#3588](https://github.com/taskcluster/taskcluster/issues/3588)
Database URLs can now be specified in the configuration with `ssl=authorized`, in which case Taskcluster will validate the Postgres server's SSL/TLS certificate against trusted root CAs.  It is unusual for databases to be deployed with such certificates.  See [the documentation](https://docs.taskcluster.net/docs/manual/deploying/database#configuration) for details.

▶ [patch]
The tutorial in the documentation has been updated and modified to offer better guidance for different deployments of Taskcluster.  The `ui.site_specific` configuration has a new, optional `tutorial_worker_pool_id` property (documented [here](http://docs.taskcluster.net/docs/manual/deploying/ui)) defining a worker pool for use by readers of the tutorial.

### WORKER-DEPLOYERS

▶ [patch] [#3561](https://github.com/taskcluster/taskcluster/issues/3561)
Bug fix: calls to workermanager.updateWorker for the static provider have been fixed.

### USERS

▶ [patch] [#3358](https://github.com/taskcluster/taskcluster/issues/3358)
The "badge" SVGs provided by the GitHub service now render correctly instead of as black shapes.

▶ [patch] [#3495](https://github.com/taskcluster/taskcluster/issues/3495)
The web-based schema viewer now shows descriptions of each field.

### DEVELOPERS

▶ [minor] [#3579](https://github.com/taskcluster/taskcluster/issues/3579)
The purge-cache, built-in, and worker-manager services now use taskQueueId internally, instead of provisionerId/workerType.

▶ [patch] [#3473](https://github.com/taskcluster/taskcluster/issues/3473)
Docker-worker has been ugpraded to use a newer version of dockerode, and no longer directly uses dockerode-promise.

### OTHER

▶ Additional changes not described here: [bug 1668111](http://bugzil.la/1668111), [#3035](https://github.com/taskcluster/taskcluster/issues/3035), [#3210](https://github.com/taskcluster/taskcluster/issues/3210), [#3287](https://github.com/taskcluster/taskcluster/issues/3287), [#3543](https://github.com/taskcluster/taskcluster/issues/3543), [#3544](https://github.com/taskcluster/taskcluster/issues/3544), [#3599](https://github.com/taskcluster/taskcluster/issues/3599), [#3525](https://github.com/taskcluster/taskcluster/issues/3525).

## v37.2.0

### DEPLOYERS

▶ [patch] [#3513](https://github.com/taskcluster/taskcluster/issues/3513)
Node has been upgraded to 12.18.4 to address CVE-2020-8201.

▶ [patch] [#3501](https://github.com/taskcluster/taskcluster/issues/3501)
The worker-manager `expire-errors` job now correctly runs the error expiration process.

### WORKER-DEPLOYERS

▶ [minor] [#3347](https://github.com/taskcluster/taskcluster/issues/3347)
The Azure provider now accepts an `ignoreFailedProvisioningStates` property in its launch configs which will cause it to ignore `ProvisioningState/failed/<code>` states on VMs.  This is specifically useful for ignoring OSProvisioningTimedOut when the Azure VM agent is not running.

▶ [patch] [#3346](https://github.com/taskcluster/taskcluster/issues/3346)
The Azure provider now looks only for well-understood failure-related states in the Azure API to determine when a worker has failed.  In cases where these measures miss an event, (re)registrationTimeouts will terminate the worker.

▶ [patch] [#3058](https://github.com/taskcluster/taskcluster/issues/3058)
The worker-manager's Azure provider now more accurately tracks the state of workers, and will not mark a worker RUNNING until it has called `registerWorker`.

### OTHER

▶ Additional changes not described here: [#3036](https://github.com/taskcluster/taskcluster/issues/3036), [#3502](https://github.com/taskcluster/taskcluster/issues/3502), [#3503](https://github.com/taskcluster/taskcluster/issues/3503).

## v37.1.0

### DEPLOYERS

▶ [patch] [#3175](https://github.com/taskcluster/taskcluster/issues/3175)
Taskcluster's Github integration has been updated to the new standard for webhooks detailed in [this post](https://developer.github.com/changes/2020-04-15-replacing-the-installation-and-installation-repositories-events/)

▶ [patch]
The taskcluster-hooks-scheduler will no longer crash while trying to report errors firing hooks.

### WORKER-DEPLOYERS

▶ [minor] [#3189](https://github.com/taskcluster/taskcluster/issues/3189)
The `workerManager.removeWorker` API method now works correctly for the static provisioner, and a new `updateWorker` API method supports modifying workers after they have been created.

▶ [patch] [#3483](https://github.com/taskcluster/taskcluster/issues/3483)
Faced with an error reclaiming a task, docker-worker will now correctly call `reportException` with reason `internal-error`.

▶ [patch] [#3456](https://github.com/taskcluster/taskcluster/issues/3456)
The `workerManager.createWorker` API method now correctly limits the `workerGroup` and `workerId` properties as described in the worker schema (38 characters, no dots).

### USERS

▶ [minor] [bug 1563191](http://bugzil.la/1563191)
generic-worker now logs the full task payload json schema if a task's payload fails json schema validation.

▶ [patch] [#3355](https://github.com/taskcluster/taskcluster/issues/3355)
The Taskcluster-GitHub service no longer throws errors on unknown pull-request actions in GitHub webhooks.

▶ [patch] [#3464](https://github.com/taskcluster/taskcluster/issues/3464)
Timestamps in the task status `runs` array are now formatted like all other timestamps in the Taskcluster API, without a trailing `+00:00`.

### DEVELOPERS

▶ [patch] [#3354](https://github.com/taskcluster/taskcluster/issues/3354)
This release handles error from malformed github check artifacts.

### OTHER

▶ Additional changes not described here: [#3309](https://github.com/taskcluster/taskcluster/issues/3309), [#3458](https://github.com/taskcluster/taskcluster/issues/3458).

## v37.0.0

### DEPLOYERS

▶ [MAJOR] [#3216](https://github.com/taskcluster/taskcluster/issues/3216)
The auth, github, hooks, index, and notify services no longer take Helm config `<service>.azure_account_id`, and auth no longer takes Helm config `auth.azure_account_key`, as these services no longer talk to Azure.

▶ [minor] [#3216](https://github.com/taskcluster/taskcluster/issues/3216)
The queue service no longer accepts the optional, and probably-unused, `queue.azure_report_chance` and `queue.azure_report_threshold` Helm configurations.

### WORKER-DEPLOYERS

▶ [minor] [#3168](https://github.com/taskcluster/taskcluster/issues/3168)
The worker-manager now supports a `scalingRatio` that determines how much worker capacity to spawn per pending task.
The `scalingRatio` is a ratio of worker capacity to pending tasks - a ratio of 1.0 means that 1 capacity will be added for each pending task.

▶ [minor] [#3033](https://github.com/taskcluster/taskcluster/issues/3033)
The worker-manager updates the `expires` timestamp for AWS workers that are set to expire in less than a day.
Updating the `expires` timestamp is now handled in the worker-scanner scan() loop for all providers.

▶ [patch] [bug 1637302](http://bugzil.la/1637302)
Docker-worker now allows configuring which artifacts it should compress on upload.

### USERS

▶ [minor] [bug 1623749](http://bugzil.la/1623749)
Docker-worker now allows features to be disabled in the worker config.

▶ [minor] [bug 1623749](http://bugzil.la/1623749)
Docker-worker now allows scopes for devices and privileged containers to be per-pool, rather than global.

▶ [minor] [#2973](https://github.com/taskcluster/taskcluster/issues/2973)
Support docker images from tasks with only a docker v1.2 manifest.

▶ [minor] [#1986](https://github.com/taskcluster/taskcluster/issues/1986)
The maximum length of the `hookGroupId` and `hookId` identifiers is now 1000.

▶ [patch] [#3366](https://github.com/taskcluster/taskcluster/issues/3366)
A serious bug in dependency handling, introduced in v35.0.0, has been fixed.  The issue occurred when a task on which more than 100 other tasks depend was resolved.  In this case, some, but not all, of the dependent tasks would be marked pending.

▶ [patch] [bug 1637302](http://bugzil.la/1637302)
Don't compress dmg files by default in docker worker.

▶ [patch] [bug 1637302](http://bugzil.la/1637302)
Don't compress dmg or zst files by default in generic worker.

▶ [patch] [#2992](https://github.com/taskcluster/taskcluster/issues/2992)
Private artifacts are now accessable via the UI.

▶ [patch] [#3398](https://github.com/taskcluster/taskcluster/issues/3398)
This version upgrades JSON-e to 4.1.0, and in particular the `$switch` operator can now be used in hook task templates and in `.taskcluster.yml` files and everywhere else Taskcluster uses JSON-e.

### DEVELOPERS

▶ [patch] [#3328](https://github.com/taskcluster/taskcluster/issues/3328)
Database function compatbiility guarantees are now included in `db/fns.md` for reference by engineers writing database versions.
Takcluster-lib-entities has been removed from the codebase, as no entities-style tables remain.

### OTHER

▶ Additional changes not described here: [#3178](https://github.com/taskcluster/taskcluster/issues/3178), [#3334](https://github.com/taskcluster/taskcluster/issues/3334), [#3337](https://github.com/taskcluster/taskcluster/issues/3337), [#3342](https://github.com/taskcluster/taskcluster/issues/3342), [#3344](https://github.com/taskcluster/taskcluster/issues/3344), [#2910](https://github.com/taskcluster/taskcluster/issues/2910).

## v36.0.0

### DEPLOYERS

▶ [MAJOR] [#2937](https://github.com/taskcluster/taskcluster/issues/2937)
Github checks are now stored in a table called `github_checks`, and github integrations are now stored in a table called `github_integrations`.  Both are accessed directly, rather than via taskcluster-lib-entities.  This migration takes about 10 seconds for a million-row table.

▶ [MAJOR] [#3216](https://github.com/taskcluster/taskcluster/issues/3216)
The auth, github, hooks, index, and notify services no longer take Helm config `<service>.azure_account_id`, and auth no longer takes Helm config `auth.azure_account_key`, as these services no longer talk to Azure.

▶ [MAJOR] [#3148](https://github.com/taskcluster/taskcluster/issues/3148)
The tables in web-server are now all relational.  The migration drops all data in these tables, which will have the effect of signing out all users and requiring them to sign in again.  But it is a very quick upgrade.

Sign-ins will not work until the web-server service has been upgraded to this version (that is, sign-ins will not work during the time between the database upgrade and the services upgrade, nor if services are downgraded back to v35.0.0).

The web server service continues to honor `web_server.azure_crypto_key`, but now optionally takes an additional Helm variable `web_server.db_crypto_keys` as described in the [deployment documentation](https://docs.taskcluster.net/docs/manual/deploying/database#supporting-encrypted-columns)

▶ [minor] [#2933](https://github.com/taskcluster/taskcluster/issues/2933)
The Queue service's workers, worker_types, and provisioners are now stored in a normal database table and access directly, rather than via taskcluster-lib-entities.  If the `queue_workers_entities` table has many rows, this migration could take some time.  Consider dropping all, or some, rows from the table before beginning the migration.

▶ [minor] [#3083](https://github.com/taskcluster/taskcluster/issues/3083)
The auth service's clients are now stored in the `clients` table and the service accesses that information directly, rather than via taskcluster-lib-entities.  As the number of clients is small, this migration should be very fast.

▶ [minor] [#2936](https://github.com/taskcluster/taskcluster/issues/2936)
The hooks service now stores hooks and ancillary information about Pulse queues and hook history in normal database tables, without the use of taskcluster-lib-entities.  This migration is quick.

The hooks service continues to honor `hooks.azure_crypto_key`, but now optionally takes an additional Helm variable `hooks.db_crypto_keys` as described in the [deployment documentation](https://docs.taskcluster.net/docs/manual/deploying/database#supporting-encrypted-columns)

▶ [minor] [#3216](https://github.com/taskcluster/taskcluster/issues/3216)
The queue service no longer accepts the optional, and probably-unused, `queue.azure_report_chance` and `queue.azure_report_threshold` Helm configurations.

▶ [minor] [#2931](https://github.com/taskcluster/taskcluster/issues/2931)
The secrets service now stores its secrets in a normal table, without the use of taskcluster-lib-entities.  The migration should be quick, as secrets are typically few in number (hundreds).

The secrets service continues to honor `secrets.azure_crypto_key`, but now optionally takes an additional Helm variable `secrets.db_crypto_keys` as described in the [deployment documentation](https://docs.taskcluster.net/docs/manual/deploying/database#supporting-encrypted-columns)

▶ [patch] [#3245](https://github.com/taskcluster/taskcluster/issues/3245)
The `taskcluster/websocktunnel` and `taskcluster/livelog` docker images now include a leading `v` in their tags, e.g., `taskcluster/websocktunnel:v36.0.0`.

### WORKER-DEPLOYERS

▶ [patch]
A worker pool with no launch configs will no longer cause errors (although it will also not create any workers!)

▶ [patch] [#3169](https://github.com/taskcluster/taskcluster/issues/3169)
If `workerTypeMetadata` is given in a generic-worker worker pool definition, its contents will now be merged with the metadata from the provider and passed to generic-worker.

### USERS

▶ [patch] [bug 1654086](http://bugzil.la/1654086)
This version fixes a bug which would cause the hooks service to crash when sending error reports to denylisted addresses.

▶ [patch] [bug 1645032](http://bugzil.la/1645032)
User IDs as received from Auth0 in the Mozilla-Auth0 login strategy are no longer suffixed with github usernames or firefox-accounts emails.  In practice, such user IDs are unused.

### DEVELOPERS

▶ [patch] [#3272](https://github.com/taskcluster/taskcluster/issues/3272)
A mapping between DB and TC versions is now maintained automatically in [`db/versions/README.md`](https://github.com/taskcluster/taskcluster/tree/main/db/versions).

▶ [patch] [#3289](https://github.com/taskcluster/taskcluster/issues/3289)
The DB schema is now documented in `db/schema.md`.

▶ [patch] [#3276](https://github.com/taskcluster/taskcluster/issues/3276)
The main branch of development on the Taskcluster repository is now named `main`.

▶ [patch] [#2928](https://github.com/taskcluster/taskcluster/issues/2928)
taskcluster-lib-postgres now allows calling stored functions with named
arguments.

### OTHER

▶ Additional changes not described here: [#3170](https://github.com/taskcluster/taskcluster/issues/3170), [#3176](https://github.com/taskcluster/taskcluster/issues/3176), [#3184](https://github.com/taskcluster/taskcluster/issues/3184), [#3185](https://github.com/taskcluster/taskcluster/issues/3185), [#3224](https://github.com/taskcluster/taskcluster/issues/3224), [#3285](https://github.com/taskcluster/taskcluster/issues/3285), [#3290](https://github.com/taskcluster/taskcluster/issues/3290), [#3301](https://github.com/taskcluster/taskcluster/issues/3301).

## v35.0.0

### GENERAL

▶ [patch] [#2887](https://github.com/taskcluster/taskcluster/issues/2887)
Generic-worker now supports reporting runtime errors to worker-manager via worker-runner.

### DEPLOYERS

▶ [MAJOR] [#3148](https://github.com/taskcluster/taskcluster/issues/3148)
The web-server service now stores Github access tokens in a dedicated table and accesses them directly, rather than via taskcluster-lib-entities.  This upgrade drops existing tokens, meaning that users will need to sign in again after the upgrade is applied.  This migration is very fast.

▶ [MAJOR]
With this version, the auth, hooks, and secrets services no longer verify signatures on rows read from database tables.  This is in preparation for a future version where these tables will no longer contain signatures.

▶ [minor] [#2937](https://github.com/taskcluster/taskcluster/issues/2937)
Github builds are now stored in a table called `github_builds`, and accessed directly rather than via taskcluster-lib-entities.  This migration can process at least 40,000 rows in no more than a few seconds.  For a table larger than that, deleting the table contents before running the migration is an option.  This table backs the "status" and "badge" endpoints, so missing data is of minor consequence.

▶ [minor] [#2938](https://github.com/taskcluster/taskcluster/issues/2938)
The auth service's roles are now stored in a normal database table and accessed directly.  This is a quick migration.

▶ [minor] [#2935](https://github.com/taskcluster/taskcluster/issues/2935)
The index service now uses its tables directly, rather than via taskcluster-lib-entities.  This is step 2, a continuation of https://github.com/taskcluster/taskcluster/pull/3141. Step 2 involved creating new DB functions and refactoring the service itself to use the new functions. The db upgrade should be very fast.

▶ [minor] [#3112](https://github.com/taskcluster/taskcluster/issues/3112)
The queue service now uses its artifact-related database tables directly, rather than via taskcluster-lib-entities.

▶ [minor] [#2932](https://github.com/taskcluster/taskcluster/issues/2932)
The queue service now uses its task- and task-group-related database tables directly, rather than via taskcluster-lib-entities.

▶ [minor] [#3030](https://github.com/taskcluster/taskcluster/issues/3030)
The worker manager's worker pool errors are now stored in a normal database table. This should be a small migration.

▶ [minor] [#3240](https://github.com/taskcluster/taskcluster/issues/3240)
Worker pool errors are now properly listable by workerPoolId.

▶ [patch] [#3222](https://github.com/taskcluster/taskcluster/issues/3222)
The persistent errors about missing function `digest(text, unknown)` logged by the database are now fixed.

### USERS

▶ [patch] [#3191](https://github.com/taskcluster/taskcluster/issues/3191)
The `task.extra.github.customCheckRun.annotationsArtifactName` property is now correctly consulted for the name of the annotations artifact, as documented.

### DEVELOPERS

▶ [patch]
The taskcluster-lib-postgres library now allows any Postgres collation that sorts ASCII characters correctly.

### OTHER

▶ Additional changes not described here: [#3160](https://github.com/taskcluster/taskcluster/issues/3160), [#3238](https://github.com/taskcluster/taskcluster/issues/3238).

## v34.0.1



## v34.0.0

### DEPLOYERS

▶ [MAJOR] [#3112](https://github.com/taskcluster/taskcluster/issues/3112)
Queue's artifacts table is upgraded to a normalized format. For deployments with
many (millions) of artifacts, this migration will take too long to perform
online, and should be performed in a scheduled downtime. Note that the ["service migration"](https://github.com/taskcluster/taskcluster/blob/main/dev-docs/postgres-phase-2-guidelines.md#service-migration) portion of the process is not included here, and the queue artifact code still uses entities-related functions to acces its data.

### WORKER-DEPLOYERS

▶ [patch] [bug 1637302](http://bugzil.la/1637302)
Docker-worker now correctly calculates artifacts hashes for chain-of-trust before compressing them.

## v33.0.0

### DEPLOYERS

▶ [MAJOR] [#2935](https://github.com/taskcluster/taskcluster/issues/2935)
The `namespaces_entities` and `indexed_tasks_entities` tables have now been
migrated to use relational tables. For deployments with many (millions) of
tasks, this migration will take too long to perform online, and should be performed in a scheduled downtime.  Note that the ["service migration"](https://github.com/taskcluster/taskcluster/blob/main/dev-docs/postgres-phase-2-guidelines.md#service-migration) portion of the process is not included here, and the index code still uses entities-related functions to acces its data.

▶ [patch]
The `db:upgrade` and `dev:db:upgrade` commands can now take an optional database version to upgrade to, defaulting to the most recent version.

### OTHER

▶ Additional changes not described here: [#3092](https://github.com/taskcluster/taskcluster/issues/3092), [#3131](https://github.com/taskcluster/taskcluster/issues/3131).

## v32.0.0

### DEPLOYERS

▶ [MAJOR] [#2934](https://github.com/taskcluster/taskcluster/issues/2934)
Migrates Postgres Phase I table `notify.denylisted_notification_entities` to
Postgres Phase II table `notify.denylisted_notifications`.

▶ [patch] [#3116](https://github.com/taskcluster/taskcluster/issues/3116)
The db upgrade and downgrade scripts now verify that the default database collation is `en_US.UTF8`.  No other collation is allowed.
Unfortunately, changing the default collation requires dumping and re-creating the database.

### OTHER

▶ Additional changes not described here: [bug 1636193](http://bugzil.la/1636193), [#3093](https://github.com/taskcluster/taskcluster/issues/3093), [#3147](https://github.com/taskcluster/taskcluster/issues/3147), [bug 1635455](http://bugzil.la/1635455).

## v31.0.0

### GENERAL

▶ [patch] [bug 1637302](http://bugzil.la/1637302)
Docker-worker now automatically gzips artifacts before
uploading them. It sets content-encoding in the S3 headers so that most
consumers should be able to transparently handle decompression.

### DEPLOYERS

▶ [MAJOR] [#3012](https://github.com/taskcluster/taskcluster/issues/3012)
An encrypted column "secret" has been added to the workers table. The
worker-manager service now requires an additional environment variable `DB_CRYPTO_KEYS`
to be set which is a JSON array where each element is an object of the form.

```json
{
  "id": "a unique identifier",
  "algo": "aes-256",
  "key": "32 bytes of base64 string"
}
```

Note that for this upgrade it will only be an array of a single object.

▶ [patch] [bug 1638921](http://bugzil.la/1638921)
Kubernetes cron tasks are now configured with concurrencyPolicy: Forbid, to prevent multiple pods of the same job from running concurrently.

### WORKER-DEPLOYERS

▶ [patch] [#3080](https://github.com/taskcluster/taskcluster/issues/3080)
Docker-worker is now more careful to shut down only when it is idle and has not begun to claim a task, avoiding race conditions that could lead to `claim-expired` tasks.

▶ [patch] [#3012](https://github.com/taskcluster/taskcluster/issues/3012)
Worker runner can now re-register a worker with worker-manager, refreshing its credentials. This allows workers to run for an unlimited time, so long as they continue to check in with the worker manager periodically.  Both docker-worker and generic-worker, as of this version, support this functionality.  Older worker versions will simply terminate when their credentials expire.

### USERS

▶ [patch]
Docker-worker now includes an error message in the task log when uploading an artifact fails

▶ [patch] [#2883](https://github.com/taskcluster/taskcluster/issues/2883)
Endpoints that return worker pools now contain an `existingCapacity` field that contains the total
amount of capacity for the worker pool between all workers that are not `stopped`.

▶ [patch] [#3004](https://github.com/taskcluster/taskcluster/issues/3004)
Generic-worker now uses the task's credentials to fetch artifacts specified in the `mounts` property of the task's payload.  This will allow use of private artifacts in mounts.

▶ [patch] [#2882](https://github.com/taskcluster/taskcluster/issues/2882)
Workerpools lists and views in the ui now show the amount of currently existing capacity
is provided by the workers in the pool and the pending count of tasks.

### DEVELOPERS

▶ [minor] [#3013](https://github.com/taskcluster/taskcluster/issues/3013)
Github integration can now set [annotations](https://developer.github.com/v3/checks/runs/#annotations-object) for check runs.
By default it will read `public/github/customCheckRunAnnotations.json` but it can be overridden by setting
`task.extra.github.customCheckRun.annotationsArtifactName`. The json will be passed along unmodified.

### OTHER

▶ Additional changes not described here: [bug 1638921](http://bugzil.la/1638921), [#2887](https://github.com/taskcluster/taskcluster/issues/2887), [#2890](https://github.com/taskcluster/taskcluster/issues/2890), [#3021](https://github.com/taskcluster/taskcluster/issues/3021), [#3067](https://github.com/taskcluster/taskcluster/issues/3067), [#3079](https://github.com/taskcluster/taskcluster/issues/3079), [#2962](https://github.com/taskcluster/taskcluster/issues/2962).

## v30.1.1

### GENERAL

▶ [patch]
Worker Manager now avoids scanning all the workers table in memory to avoid possible OOM issues.

### WORKER-DEPLOYERS

▶ [patch] [bug 1607605](http://bugzil.la/1607605)
Generic-worker now supports shutting down gracefully when instructed to do so by worker-runner, such as when a cloud VM is being terminated.

### USERS

▶ [patch] [bug 1639713](http://bugzil.la/1639713)
Tasks using the `hostSharedMemory` device capability will now properly mount `/dev/shm` from the host into the container.

## v30.1.0

### DEPLOYERS

▶ [minor] [#2877](https://github.com/taskcluster/taskcluster/issues/2877)
The `wmworkers_entities` table has now been migrated to use a relational table.
The new table is called `workers`. `wmworkers_entities` will get deleted.

## v30.0.5

### DEVELOPERS

▶ [patch]
Release tasks now have access to taskcluster-proxy

## v30.0.4



### OTHER

▶ Additional change not described here: [#2921](https://github.com/taskcluster/taskcluster/issues/2921).

## v30.0.3

### GENERAL

▶ [patch] [bug 1631824](http://bugzil.la/1631824)
The worker-manager azure provider now properly tracks and deletes all disks when a virtual machine has data disks created for it.

### DEPLOYERS

▶ [patch]
A bug in the Azure provider which caused provisioning to fail when handling operations has been fixed.

▶ [patch]
Taskcluster services now include metadata at the top level of Fields for `generic.*` logging messages, rather than in `meta` or `fields` sub-properties.

### WORKER-DEPLOYERS

▶ [patch] [#2969](https://github.com/taskcluster/taskcluster/issues/2969)
Docker-worker now only considers itself idle if its call to `queue.claimWork` returns no tasks.  This prevents the situation where a very short `afterIdleSeconds` causes the worker to shut down *while* calling `claimWork`.

▶ [patch] [#2925](https://github.com/taskcluster/taskcluster/issues/2925)
Listing workers in the "stopping" state will no longer cause 500 errors.

### USERS

▶ [patch] [bug 1632929](http://bugzil.la/1632929)
Taskcluster-Github now uses a release event's `target_commitish` property instead of the `tag` property to determine the SHA of the released commit.  This is important in cases where tags are created as part of the release-creation call, as GitHub sends the release event before the tag is created.

### DEVELOPERS

▶ [patch] [bug 1636167](http://bugzil.la/1636167)
CI tasks are now generated in a decision task by https://hg.mozilla.org/ci/taskgraph

### OTHER

▶ Additional changes not described here: [bug 1640267](http://bugzil.la/1640267), [#2827](https://github.com/taskcluster/taskcluster/issues/2827), [#2890](https://github.com/taskcluster/taskcluster/issues/2890), [#2912](https://github.com/taskcluster/taskcluster/issues/2912), [#2913](https://github.com/taskcluster/taskcluster/issues/2913), [#2951](https://github.com/taskcluster/taskcluster/issues/2951), [#2952](https://github.com/taskcluster/taskcluster/issues/2952), [bug 1634376](http://bugzil.la/1634376).

## v30.0.2

### USERS

▶ [patch]
An incorrect use of a relative path caused sign-ins to fail in v30.0.1.  This has been fixed.

▶ [patch]
Fix docker worker not working in the latest release of Taskcluster. It was
previously throwing `taskVolumeBindings is not iterable`.

▶ [patch] [#2876](https://github.com/taskcluster/taskcluster/issues/2876)
The purge cache UI view now allows filtering a search result by cache name.

### OTHER

▶ Additional change not described here: [#2845](https://github.com/taskcluster/taskcluster/issues/2845).

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
See [the docs](https://github.com/taskcluster/taskcluster/tree/main/clients/client-go#readme).

[minor] ([bug 1559471](http://bugzil.la/1559471)) The web-server configuration for sign-in now requires a single JWT HS256 key (`JWT_KEY`) instead of a public/private key (`JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`).

Changes are now recorded in the CHANGELOG.md file.

([bug 1547729](http://bugzil.la/1547729)) Hook fire attempts are now logged using structured logging, including when a hook "declines" to create a task.

([bug 1556526](http://bugzil.la/1556526)) The `workerManager.updateWorkerType` API method now allows extra fields such as `lastModified`, making read-modify-write usages easier to implement.

The search box in the log viewer now searches on enter.

The task group inspector now shows the full task name.

([bug 1558346](http://bugzil.la/1558346)) Workers can now report errors directly to the worker manager for display in the worker-manager UI.

## Older Releases

Changes were not tracked for older releases of Taskcluster
