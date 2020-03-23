# Generic Worker

A generic worker for [Taskcluster](https://tdocs.taskcluster.net/), written in Go.

For documentation of the worker from a user's perspective, see the [online documentation](https://docs.taskcluster.net/reference/workers/generic-worker).

# Usage

To see a full description of all the config options available to you, run `generic-worker --help`:
```
generic-worker (multiuser engine) 16.6.1

generic-worker is a taskcluster worker that can run on any platform that supports go (golang).
See http://taskcluster.github.io/generic-worker/ for more details. Essentially, the worker is
the taskcluster component that executes tasks. It requests tasks from the taskcluster queue,
and reports back results to the queue.

  Usage:
    generic-worker run                      [--config         CONFIG-FILE]
                                            [--worker-runner-protocol-pipe PIPE]
                                            [--configure-for-aws | --configure-for-gcp | --configure-for-azure]
    generic-worker show-payload-schema
    generic-worker new-ed25519-keypair      --file ED25519-PRIVATE-KEY-FILE
    generic-worker --help
    generic-worker --version

  Targets:
    run                                     Runs the generic-worker.
    show-payload-schema                     Each taskcluster task defines a payload to be
                                            interpreted by the worker that executes it. This
                                            payload is validated against a json schema baked
                                            into the release. This option outputs the json
                                            schema used in this version of the generic
                                            worker.
    new-ed25519-keypair                     This will generate a fresh, new ed25519
                                            compliant private/public key pair. The public
                                            key will be written to stdout and the private
                                            key will be written to the specified file.

  Options:
    --config CONFIG-FILE                    Json configuration file to use. See
                                            configuration section below to see what this
                                            file should contain. When calling the install
                                            target, this is the config file that the
                                            installation should use, rather than the config
                                            to use during install.
                                            [default: generic-worker.config]
    --worker-runner-protocol-pipe PIPE      Use this option when running generic-worker under
                                            worker-runner, passing the same value as given for
                                            'worker.protocolPipe' in the runner configuration.
                                            This specifies a named pipe that is used for
                                            communication between the two processes.
    --configure-for-aws                     Use this option when installing or running a worker
                                            that is spawned by the AWS provisioner. It will cause
                                            the worker to query the EC2 metadata service when it
                                            is run, in order to retrieve data that will allow it
                                            to self-configure, based on AWS metadata, information
                                            from the provisioner, and the worker type definition
                                            that the provisioner holds for the worker type.
    --configure-for-azure                   This will create the CONFIG-FILE for an Azure
                                            installation by querying the Azure environment
                                            and setting appropriate values.
    --configure-for-gcp                     This will create the CONFIG-FILE for a GCP
                                            installation by querying the GCP environment
                                            and setting appropriate values.
    --file PRIVATE-KEY-FILE                 The path to the file to write the private key
                                            to. The parent directory must already exist.
                                            If the file exists it will be overwritten,
                                            otherwise it will be created.
    --help                                  Display this help text.
    --version                               The release version of the generic-worker.


  Configuring the generic worker:

    The configuration file for the generic worker is specified with -c|--config CONFIG-FILE
    as described above. Its format is a json dictionary of name/value pairs.

        ** REQUIRED ** properties
        =========================

          accessToken                       Taskcluster access token used by generic worker
                                            to talk to taskcluster queue.
          clientId                          Taskcluster client ID used by generic worker to
                                            talk to taskcluster queue.
          ed25519SigningKeyLocation         The ed25519 signing key for signing artifacts with.
          publicIP                          The IP address for clients to be directed to
                                            for serving live logs; see
                                            https://github.com/taskcluster/livelog and
                                            https://github.com/taskcluster/stateless-dns-server
                                            Also used by chain of trust.
          rootURL                           The root URL of the taskcluster deployment to which
                                            clientId and accessToken grant access. For example,
                                            'https://community-tc.services.mozilla.com/'.
          workerId                          A name to uniquely identify your worker.
          workerType                        This should match a worker_type managed by the
                                            provisioner you have specified.

        ** OPTIONAL ** properties
        =========================

          authRootURL                       The root URL for taskcluster auth API calls.
                                            If not provided, the value from config property
                                            rootURL is used. Intended for development/testing.
          availabilityZone                  The EC2 availability zone of the worker.
          cachesDir                         The directory where task caches should be stored on
                                            the worker. The directory will be created if it does
                                            not exist. This may be a relative path to the
                                            current directory, or an absolute path.
                                            [default: "caches"]
          certificate                       Taskcluster certificate, when using temporary
                                            credentials only.
          checkForNewDeploymentEverySecs    The number of seconds between consecutive calls
                                            to the provisioner, to check if there has been a
                                            new deployment of the current worker type. If a
                                            new deployment is discovered, worker will shut
                                            down. See deploymentId property. [default: 1800]
          cleanUpTaskDirs                   Whether to delete the home directories of the task
                                            users after the task completes. Normally you would
                                            want to do this to avoid filling up disk space,
                                            but for one-off troubleshooting, it can be useful
                                            to (temporarily) leave home directories in place.
                                            Accepted values: true or false. [default: true]
          deploymentId                      If running with --configure-for-aws, then between
                                            tasks, at a chosen maximum frequency (see
                                            checkForNewDeploymentEverySecs property), the
                                            worker will query the provisioner to get the
                                            updated worker type definition. If the deploymentId
                                            in the config of the worker type definition is
                                            different to the worker's current deploymentId, the
                                            worker will shut itself down. See
                                            https://bugzil.la/1298010
          disableReboots                    If true, no system reboot will be initiated by
                                            generic-worker program, but it will still return
                                            with exit code 67 if the system needs rebooting.
                                            This allows custom logic to be executed before
                                            rebooting, by patching run-generic-worker.bat
                                            script to check for exit code 67, perform steps
                                            (such as formatting a hard drive) and then
                                            rebooting in the run-generic-worker.bat script.
                                            [default: false]
          downloadsDir                      The directory to cache downloaded files for
                                            populating preloaded caches and readonly mounts. The
                                            directory will be created if it does not exist. This
                                            may be a relative path to the current directory, or
                                            an absolute path. [default: "downloads"]
          idleTimeoutSecs                   How many seconds to wait without getting a new
                                            task to perform, before the worker process exits.
                                            An integer, >= 0. A value of 0 means "never reach
                                            the idle state" - i.e. continue running
                                            indefinitely. See also shutdownMachineOnIdle.
                                            [default: 0]
          instanceID                        The EC2 instance ID of the worker. Used by chain of trust.
          instanceType                      The EC2 instance Type of the worker. Used by chain of trust.
          livelogCertificate                SSL certificate to be used by livelog for hosting
                                            logs over https. If not set, http will be used.
          livelogExecutable                 Filepath of LiveLog executable to use; see
                                            https://github.com/taskcluster/livelog
                                            [default: "livelog"]
          livelogGETPort                    Port number for livelog HTTP GET requests.
                                            [default: 60023]
          livelogKey                        SSL key to be used by livelog for hosting logs
                                            over https. If not set, http will be used.
          livelogPUTPort                    Port number for livelog HTTP PUT requests.
                                            [default: 60022]
          livelogSecret                     This should match the secret used by the
                                            stateless dns server; see
                                            https://github.com/taskcluster/stateless-dns-server
                                            Optional if stateless DNS is not in use.
          numberOfTasksToRun                If zero, run tasks indefinitely. Otherwise, after
                                            this many tasks, exit. [default: 0]
          privateIP                         The private IP of the worker, used by chain of trust.
          provisionerId                     The taskcluster provisioner which is taking care
                                            of provisioning environments with generic-worker
                                            running on them. [default: "test-provisioner"]
          purgeCacheRootURL                 The root URL for taskcluster purge cache API calls.
                                            If not provided, the value from config property
                                            rootURL is used. Intended for development/testing.
          queueRootURL                      The root URL for taskcluster queue API calls.
                                            If not provided, the value from config property
                                            rootURL is used. Intended for development/testing.
          region                            The EC2 region of the worker. Used by chain of trust.
          requiredDiskSpaceMegabytes        The garbage collector will ensure at least this
                                            number of megabytes of disk space are available
                                            when each task starts. If it cannot free enough
                                            disk space, the worker will shut itself down.
                                            [default: 10240]
          runAfterUserCreation              A string, that if non-empty, will be treated as a
                                            command to be executed as the newly generated task
                                            user, after the user has been created, the machine
                                            has rebooted and the user has logged in, but before
                                            a task is run as that user. This is a way to
                                            provide generic user initialisation logic that
                                            should apply to all generated users (and thus all
                                            tasks) and be run as the task user itself. This
                                            option does *not* support running a command as
                                            Administrator. Furthermore, even if
                                            runTasksAsCurrentUser is true, the script will still
                                            be executed as the task user, rather than the
                                            current user (that runs the generic-worker process).
          runTasksAsCurrentUser             If true, users will not be created for tasks, but
                                            the current OS user will be used. [default: false]
          secretsRootURL                    The root URL for taskcluster secrets API calls.
                                            If not provided, the value from config property
                                            rootURL is used. Intended for development/testing.
          sentryProject                     The project name used in https://sentry.io for
                                            reporting worker crashes. Permission to publish
                                            crash reports is granted via the scope
                                            auth:sentry:<sentryProject>. If the taskcluster
                                            client (see clientId property above) does not
                                            posses this scope, no crash reports will be sent.
                                            Similarly, if this property is not specified or
                                            is the empty string, no reports will be sent.
                                            [default: "generic-worker"]
          shutdownMachineOnIdle             If true, when the worker is deemed to have been
                                            idle for enough time (see idleTimeoutSecs) the
                                            worker will issue an OS shutdown command. If false,
                                            the worker process will simply terminate, but the
                                            machine will not be shut down. [default: false]
          shutdownMachineOnInternalError    If true, if the worker encounters an unrecoverable
                                            error (such as not being able to write to a
                                            required file) it will shutdown the host
                                            computer. Note this is generally only desired
                                            for machines running in production, such as on AWS
                                            EC2 spot instances. Use with caution!
                                            [default: false]
          subdomain                         Subdomain to use in stateless dns name for live
                                            logs; see
                                            https://github.com/taskcluster/stateless-dns-server
                                            [default: "taskcluster-worker.net"]
          taskclusterProxyExecutable        Filepath of taskcluster-proxy executable to use; see
                                            https://github.com/taskcluster/taskcluster-proxy
                                            [default: "taskcluster-proxy"]
          taskclusterProxyPort              Port number for taskcluster-proxy HTTP requests.
                                            [default: 80]
          tasksDir                          The location where task directories should be
                                            created on the worker. [default: "/Users"]
          workerGroup                       Typically this would be an aws region - an
                                            identifier to uniquely identify which pool of
                                            workers this worker logically belongs to.
                                            [default: "test-worker-group"]
          workerLocation                    If a non-empty string, task commands will have environment variable
                                            TASKCLUSTER_WORKER_LOCATION set to the value provided.

                                            If an empty string, and --configure-for-aws is specified,
                                            TASKCLUSTER_WORKER_LOCATION environment variable will be set to a
                                            string containing the JSON object:
                                            {"cloud":"aws","region":"<REGION>","availabilityZone":"<AZ>"}
                                            See: https://github.com/taskcluster/taskcluster/tree/master/tools/worker-runner#aws

                                            If an empty string, and --configure-for-gcp is specified,
                                            TASKCLUSTER_WORKER_LOCATION environment variable will be set to a
                                            string containing the JSON object:
                                            {"cloud":"google","region":"<REGION>","zone":"<ZONE>"}
                                            See: https://github.com/taskcluster/taskcluster/tree/master/tools/worker-runner#google

                                            Otherwise TASKCLUSTER_WORKER_LOCATION environment
                                            variable will not be implicitly set in task commands.
                                            [default: ""]
          workerManagerRootURL              The root URL for taskcluster worker manager API calls.
                                            If not provided, the value from config property
                                            rootURL is used. Intended for development/testing.
          workerTypeMetaData                This arbitrary json blob will be included at the
                                            top of each task log. Providing information here,
                                            such as a URL to the code/config used to set up the
                                            worker type will mean that people running tasks on
                                            the worker type will have more information about how
                                            it was set up (for example what has been installed on
                                            the machine).
          wstAudience                       The audience value for which to request websocktunnel
                                            credentials, identifying a set of WST servers this
                                            worker could connect to.  Optional if not using websocktunnel
                                            to expose live logs.
          wstServerURL                      The URL of the websocktunnel server with which to expose
                                            live logs.  Optional if not using websocktunnel to expose
                                            live logs.

    If an optional config setting is not provided in the json configuration file, the
    default will be taken (defaults documented above).

    If no value can be determined for a required config setting, the generic-worker will
    exit with a failure message.

  Exit Codes:

    0      Tasks completed successfully; no more tasks to run (see config setting
           numberOfTasksToRun).
    64     Not able to load generic-worker config. This could be a problem reading the
           generic-worker config file on the filesystem, a problem talking to AWS/GCP
           metadata service, or a problem retrieving config/files from the taskcluster
           secrets service.
    65     Not able to install generic-worker on the system.
    67     A task user has been created, and the generic-worker needs to reboot in order
           to log on as the new task user. Note, the reboot happens automatically unless
           config setting disableReboots is set to true - in either code this exit code will
           be issued.
    68     The generic-worker hit its idle timeout limit (see config settings idleTimeoutSecs
           and shutdownMachineOnIdle).
    69     Worker panic - either a worker bug, or the environment is not suitable for running
           a task, e.g. a file cannot be written to the file system, or something else did
           not work that was required in order to execute a task. See config setting
           shutdownMachineOnInternalError.
    70     A new deploymentId has been issued in the AWS worker type configuration, meaning
           this worker environment is no longer up-to-date. Typcially workers should
           terminate.
    71     The worker was terminated via an interrupt signal (e.g. Ctrl-C pressed).
    72     The worker is running on spot infrastructure in AWS EC2 and has been served a
           spot termination notice, and therefore has shut down.
    73     The config provided to the worker is invalid.
    75     Not able to create an ed25519 key pair.
    76     Not able to save generic-worker config file after fetching it from AWS provisioner
           or Google Cloud metadata.
    77     Not able to apply required file access permissions to the generic-worker config
           file so that task users can't read from or write to it.
    78     Not able to connect to --worker-runner-protocol-pipe.
```

# Start the generic worker

Simply run:

```
generic-worker run --config <config file>
```

where `<config file>` is the generic worker config file you created above.

# Development

## Documentation

See the [![GoDoc](https://godoc.org/github.com/taskcluster/taskcluster/workers/generic-worker?status.svg)](https://godoc.org/github.com/taskcluster/taskcluster/workers/generic-worker).

## Build from source

Set up to build Taskcluster in general.
See [development process](../../dev-docs/development-process.md).

* Run `go get github.com/taskcluster/livelog`
* Run `go get github.com/taskcluster/taskcluster-proxy`

In the `workers/generic-worker` directory, run `./build.sh` to check go version, generate code, build binaries, compile (but not run) tests, perform linting, and ensure there are no ineffective assignments in go code.

`./build.sh` takes optional arguments, `-a` to build all platforms, and `-t` to run tests. By default tests are not run and only the current platform is built.

All being well, the binaries will be built in the directory you executed the `build.sh` script from.

## Run the generic worker test suite

For this you need to have the source files (you cannot run the tests from the binary package).

Then cd into the source directory, and run:

```
./build.sh -t
```

Note that this will require `sudo` access on Linux, unless you set `GW_TESTS_RUN_AS_CURRENT_USER` (see below).

Most tests run without needing credentials, but some will skip or fail in that circumstance.
To run all tests, you will need to provide Taskcluster credentials.
To run the tests against the Community-TC deployment of Taskcluster, you will need the [project:taskcluster:generic-worker-tester role](https://community-tc.services.mozilla.com/auth/roles/project%3Ataskcluster%3Ageneric-worker-tester).
Consult a member of the Taskcluster team on the [#taskcluster channel](https://chat.mozilla.org/#/room/#taskcluster:mozilla.org) to get this set up.

There are a few environment variables that you can set to influence the tests:

### `GW_SKIP_PYTHON_TESTS`

Set to a non-empty string if you wish to skip all tests that require python to
be installed.

### `GW_SKIP_MOZILLA_BUILD_TESTS`

Set to a non-empty string if you wish to skip all tests that require
mozilla-build to be installed.

### `GW_SKIP_INTEGRATION_TESTS`

Set to a non-empty string if you wish to skip all tests that submit tasks to a
real taskcluster Queue service.

Otherwise you'll need to configure the taskcluster credentials for talking to
the taskcluster Queue service:

* `TASKCLUSTER_CLIENT_ID`
* `TASKCLUSTER_ACCESS_TOKEN`
* `TASKCLUSTER_ROOT_URL`
* `TASKCLUSTER_CERTIFICATE` (only if using temp credentials)

### `GW_SKIP_PERMA_CREDS_TESTS`

Set to a non-empty string if you wish to skip tests that require permanent
taskcluster credentials (e.g. if you only have temp credentials, and don't feel
like creating a permanent client, or don't have the scopes to do so).

### `GW_SKIP_Z_DRIVE_TESTS`

Only used in a single __Windows-specific__ test - if you don't have a Z: drive
setup on your computer, or you do but you also run tests from the Z: drive, you
can set this env var to a non-empty string to skip this test.

### `GW_TESTS_RUN_AS_CURRENT_USER`

This environment variable applies only to the __multiuser__ engine.

If `GW_TESTS_RUN_AS_CURRENT_USER` is not set, generic-worker will be tested
running in its normal operational mode, i.e. running tasks as task users
(config setting `runTasksAsCurrentUser` will be `false`).

If `GW_TESTS_RUN_AS_CURRENT_USER` is a non-empty string, generic-worker will be
tested running tasks as the same user that runs `go test` (config setting
`runTasksAsCurrentUser` will be `true`). This is how the CI multiuser workers
are configured, in order that the generic-worker under test has the required
privileges to function correctly. Set this environment variable to ensure that
the generic-worker under test will function correctly as a generic-worker CI
worker.

## Older Releases

Before version 25, this project was released from a dedicated GitHub repository.
See [the release history](https://github.com/taskcluster/generic-worker/releases) in that repository.

## Further information

Please see:

* [Taskcluster Documentation](https://docs.taskcluster.net/)
* [Generic Worker Open Bugs](https://bugzilla.mozilla.org/buglist.cgi?f1=product&resolution=---&o1=equals&o2=equals&query_format=advanced&f2=component&v1=Taskcluster&v2=Generic-Worker)

Useful information on win32 APIs:

* [Starting an Interactive Client Process in C++](https://msdn.microsoft.com/en-us/9e9ed9b7-ea23-4dec-8b92-a86aa81267ab?f=255&MSPPError=-2147217396)
* [Getting the Logon SID in C++](https://msdn.microsoft.com/en-us/aa446670?f=255&MSPPError=-2147217396)
* [Modifying the ACLs of an Object in C++](https://docs.microsoft.com/en-us/windows/desktop/secauthz/modifying-the-acls-of-an-object-in-c--)
* [Window Station Security and Access Rights](https://docs.microsoft.com/en-us/windows/desktop/winstation/window-station-security-and-access-rights)
