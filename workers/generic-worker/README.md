# Generic Worker

A generic worker for [Taskcluster](https://docs.taskcluster.net/), written in Go.

For documentation of the worker from a user's perspective, see the [online documentation](https://docs.taskcluster.net/docs/reference/workers/generic-worker).

# Usage

<!-- HELP BEGIN -->
```
$ generic-worker --help

generic-worker is a taskcluster worker that can run on any platform that supports go (golang).
See http://taskcluster.github.io/generic-worker/ for more details. Essentially, the worker is
the taskcluster component that executes tasks. It requests tasks from the taskcluster queue,
and reports back results to the queue.

  Usage:
    generic-worker run                      [--config         CONFIG-FILE]
                                            [--with-worker-runner]
                                            [--worker-runner-protocol-pipe PIPE]
    generic-worker show-payload-schema
    generic-worker new-ed25519-keypair      --file ED25519-PRIVATE-KEY-FILE
    generic-worker copy-to-temp-file        --copy-file COPY-FILE
    generic-worker create-file              --create-file CREATE-FILE
    generic-worker create-dir               --create-dir CREATE-DIR
    generic-worker unarchive                --archive-src ARCHIVE-SRC --archive-dst ARCHIVE-DST --archive-fmt ARCHIVE-FMT
    generic-worker status
    generic-worker --help
    generic-worker --version
    generic-worker --short-version

  Targets:
    run                                     Runs the generic-worker.  Pass --with-worker-runner if
                                            running under that service, otherwise generic-worker will
                                            not communicate with worker-runner.
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
    copy-to-temp-file                       This will copy the specified file to a temporary
                                            location and will return the temporary file path
                                            to stdout. Intended for internal use.
    create-file                             This will create a file at the specified path.
                                            Intended for internal use.
    create-dir                              This will create a directory (including missing
                                            parent directories) at the specified path.
                                            Intended for internal use.
    unarchive                               This will unarchive the specified archive file
                                            to the specified destination directory.
                                            Intended for internal use.
    status                                  This will print whether the worker is currently
                                            running a task, and if so, what the task ID is.

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
    --file PRIVATE-KEY-FILE                 The path to the file to write the private key
                                            to. The parent directory must already exist.
                                            If the file exists it will be overwritten,
                                            otherwise it will be created.
    --copy-file COPY-FILE                   The path to the file to copy.
    --create-file CREATE-FILE               The path to the file to create.
    --create-dir CREATE-DIR                 The path to the directory to create.
    --archive-src ARCHIVE-SRC               The path to the archive file to unarchive.
    --archive-dst ARCHIVE-DST               The path to the directory to unarchive to.
    --archive-fmt ARCHIVE-FMT               The format of the archive file to unarchive.
                                            One of:
                                              * rar
                                              * tar.bz2
                                              * tar.gz
                                              * tar.lz4
                                              * tar.xz
                                              * tar.zst
                                              * zip
    --help                                  Display this help text.
    --version                               The release version of the generic-worker.
    --short-version                         Only the semantic version of generic-worker.


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
          rootURL                           The root URL of the taskcluster deployment to which
                                            clientId and accessToken grant access. For example,
                                            'https://community-tc.services.mozilla.com/'.
          workerId                          A name to uniquely identify your worker.
          workerType                        This should match a worker_type managed by the
                                            provisioner you have specified.

        ** OPTIONAL ** properties
        =========================

          allowedHighMemoryDurationSecs     The number of seconds the resource monitor will
                                            allow the system memory usage to be above the high
                                            memory thresholds (see minAvailableMemoryBytes
                                            and maxMemoryUsagePercent) before aborting
                                            the task. If the memory usage is above the high
                                            memory thresholds for longer than this time, the
                                            worker will abort the task. Does nothing if
                                            disableOOMProtection is set to true.
                                            [default: 5]
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
          createObjectArtifacts             If true, use artifact type 'object' for artifacts
                                            containing data.  If false, use artifact type 's3'.
                                            The 'object' type will become the default when the
                                            's3' type is deprecated.
          disableNativePayloads             Disables native Generic Worker payloads. D2G should be
                                            enabled (d2gConfig.enableD2G) when this is set to true.
                                            Tasks submitted with native payloads will be resolved
                                            as exception/malformed-payload. [default: false]
          disableReboots                    If true, no system reboot will be initiated by
                                            generic-worker program, but it will still return
                                            with exit code 67 if the system needs rebooting.
                                            This allows custom logic to be executed before
                                            rebooting, by patching run-generic-worker.bat
                                            script to check for exit code 67, perform steps
                                            (such as formatting a hard drive) and then
                                            rebooting in the run-generic-worker.bat script.
                                            [default: false]
          disableOOMProtection              If true, the worker will continue to monitor system
                                            memory usage, but will not abort tasks when the
                                            system memory usage hits the minAvailableMemoryBytes
                                            AND maxMemoryUsagePercent for longer than
                                            allowedHighMemoryDurationSecs seconds.
                                            [default: false]
          downloadsDir                      The directory to cache downloaded files for
                                            populating preloaded caches and readonly mounts. The
                                            directory will be created if it does not exist. This
                                            may be a relative path to the current directory, or
                                            an absolute path. [default: "downloads"]
          d2gConfig                         D2G-specific (Docker Worker to Generic Worker payload
                                            transformation) configuration. This allows finer tuning
                                            of the internal D2G payload translation. Available
                                            config with provided defaults:
                                              * enableD2G - Enables D2G. [default: false]
                                              * allowChainOfTrust - Allows Chain of Trust. [default: true]
                                              * allowDisableSeccomp - Allows disabling Seccomp. [default: true]
                                              * allowGPUs - Allows the use of NVIDIA GPUs. [default: false]
                                              * allowHostSharedMemory - Allows Host Shared Memory. [default: true]
                                              * allowInteractive - Allows Interactive. [default: true]
                                              * allowKVM - Allows KVM. [default: true]
                                              * allowLoopbackAudio - Allows Loopback Audio. [default: true]
                                              * allowLoopbackVideo - Allows Loopback Video. [default: true]
                                              * allowPrivileged - Allows Privileged. [default: true]
                                              * allowPtrace - Allows Ptrace. [default: true]
                                              * allowTaskclusterProxy - Allows Taskcluster Proxy. [default: true]
                                              * gpus - The NVIDIA GPUs to make available to the running container.
                                                Only used if allowGPUs is true. [default: "all"]
                                              * logTranslation (unused) - Logs the D2G-translated task definition to the task logs.
                                                [default: true]
          enableChainOfTrust                Enables the Chain of Trust feature to be used in the
                                            task payload. [default: true]
          enableLiveLog                     Enables the LiveLog feature to be used in the task
                                            payload. [default: true]
          enableMetadata                    Enables the Metadata feature to have generic worker
                                            write out a file "generic-worker-metadata.json"
                                            (in the current working directory of the generic
                                            worker process) containing information about the
                                            last task run. [default: true]
          enableMounts                      Enables the Mounts feature to be used in the task
                                            payload. [default: true]
          enableOSGroups                    Enables the OS Groups feature to be used in the task
                                            payload. [default: true]
          enableResourceMonitor             Enables the Resource Monitor feature to be used in
                                            the task payload. [default: true]
          enableTaskclusterProxy            Enables the Taskcluster Proxy feature to be used in
                                            the task payload. [default: true]
          enableInteractive                 Enables the Interactive feature to be used in the
                                            task payload. [default: true]
          enableLoopbackAudio               Enables the Loopback Audio feature to be used in the
                                            task payload. [default: true]
          enableLoopbackVideo               Enables the Loopback Video feature to be used in the
                                            task payload. [default: true]
          enableRunTaskAsCurrentUser        Enables the Run Task As Current User feature to be
                                            used in the task payload. [default: true]
          headlessTasks                     If true, no dedicated graphical session will be available to tasks.
                                            There will also be no reboots between tasks and multiple workers
                                            can be run on the same host. Useful for tasks that don't require
                                            a graphical session, such as software builds. [default: false]
          idleTimeoutSecs                   How many seconds to wait without getting a new
                                            task to perform, before the worker process exits.
                                            An integer, >= 0. A value of 0 means "never reach
                                            the idle state" - i.e. continue running
                                            indefinitely. See also shutdownMachineOnIdle.
                                            [default: 0]
          instanceID                        The EC2 instance ID of the worker. Used by chain of trust.
          instanceType                      The EC2 instance Type of the worker. Used by chain of trust.
          interactivePort                   Set the port number for an interactive shell. This
                                            is used to allow interactive access to the worker
                                            while it is running.
                                            [default: 53654]
          livelogExecutable                 Filepath of LiveLog executable to use; see
                                            https://github.com/taskcluster/livelog
                                            [default: "livelog"]
          livelogPortBase                   Set the base port number for livelog. Livelog requires two
                                            ports: livelogPortBase & livelogPortBase + 1 are used.
                                            [default: 60098]
          livelogExposePort                 When not using websocktunnel, livelog would be exposed using this port.
                                            If it is set to 0, logs would be exposed using a random port.
                                            [default: 0]
          loopbackAudioDeviceNumber         The audio loopback device number. The resulting devices inside /dev/snd
                                            will take the form controlC<DEVICE_NUMBER>, pcmC<DEVICE_NUMBER>D0c,
                                            pcmC<DEVICE_NUMBER>D0p, pcmC<DEVICE_NUMBER>D1c, pcmC<DEVICE_NUMBER>D1p
                                            where <DEVICE_NUMBER> is an integer between 0 and 31.
                                            [default: 16]
          loopbackVideoDeviceNumber         The video loopback device number. Its value will take the form
                                            /dev/video<DEVICE_NUMBER> where <DEVICE_NUMBER> is an integer
                                            between 0 and 255. This setting may be used to change it.
                                            [default: 0]
          maxMemoryUsagePercent             A percent used by the resource monitor to determine
                                            when to abort a task due to high memory usage.
                                            This is a relative value, meaning that it is
                                            relative to the total memory available on the
                                            worker. For example, if the value is 90, then
                                            the worker will abort a task if the memory
                                            usage is at 90% or higher for longer than
                                            allowedHighMemoryDurationSecs seconds. Can be used
                                            in conjunction with minAvailableMemoryBytes.
                                            Does nothing if disableOOMProtection is set to true.
                                            [default: 90]
          maxTaskRunTime                    The maximum value allowed for maxRunTime on generic-worker payloads.
                                            [default: 86400]
          minAvailableMemoryBytes           Number of bytes the resource monitor uses to
                                            determine when to abort a task due to high
                                            memory usage. This is an absolute number of bytes
                                            needed of available memory before aborting the task.
                                            For example, if the value is 524288000, then the worker will
                                            abort a task if the memory available is 500MiB or less
                                            for longer than allowedHighMemoryDurationSecs seconds.
                                            Can be used in conjunction with maxMemoryUsagePercent.
                                            Does nothing if disableOOMProtection is set to true.
                                            [default: 524288000] (500MiB)
          numberOfTasksToRun                If zero, run tasks indefinitely. Otherwise, after
                                            this many tasks, exit. [default: 0]
          privateIP                         The private IP of the worker, used by chain of trust.
          provisionerId                     The taskcluster provisioner which is taking care
                                            of provisioning environments with generic-worker
                                            running on them. [default: "test-provisioner"]
          publicIP                          The IP address for VNC access.  Also used by chain of
                                            trust when present.
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
                                            Administrator.
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
          taskclusterProxyExecutable        Filepath of taskcluster-proxy executable to use; see
                                            https://github.com/taskcluster/taskcluster/tree/main/tools/taskcluster-proxy
                                            [default: "taskcluster-proxy"]
          taskclusterProxyPort              Port number for taskcluster-proxy HTTP requests.
                                            [default: 80]
          tasksDir                          The location where task directories should be
                                            created on the worker.
                                            [default varies by platform]
          workerGroup                       Typically this would be an aws region - an
                                            identifier to uniquely identify which pool of
                                            workers this worker logically belongs to.
                                            [default: "test-worker-group"]
          workerLocation                    If a non-empty string, task commands will have environment variable
                                            TASKCLUSTER_WORKER_LOCATION set to the value provided.

                                            Otherwise TASKCLUSTER_WORKER_LOCATION environment
                                            variable will not be implicitly set in task commands.
                                            [default: ""]
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
    70     Worker Manager advised this worker that it is no longer needed and should be
           terminated.
    71     The worker was terminated via an interrupt signal (e.g. Ctrl-C pressed).
    72     The worker is running on spot infrastructure and has been served a
           spot termination notice, and therefore has shut down.
    73     The config provided to the worker is invalid.
    75     Not able to create an ed25519 key pair.
    76     Not able to copy --copy-file to a temporary file.
    77     Not able to apply required file access permissions to the generic-worker config
           file so that task users can't read from or write to it.
    78     Not able to connect to --worker-runner-protocol-pipe.
    79     Not able to create file at --create-file path.
    80     Not able to create directory at --create-dir path.
    81     Not able to unarchive --archive-src to --archive-dst.
    82     Missing ed25519 private key. Did you run generic-worker new-ed25519-keypair?
```
<!-- HELP END -->

# Start the generic worker

Simply run:

```
generic-worker run --config <config file>
```

where `<config file>` is the generic worker config file you created above.

# Development

## Documentation

See the [![GoDoc](https://pkg.go.dev/github.com/taskcluster/taskcluster/v42/workers/generic-worker?status.svg)](https://pkg.go.dev/github.com/taskcluster/taskcluster/v42/workers/generic-worker).

## Build from source

Set up to build Taskcluster in general.
See [development process](../../dev-docs/development-process.md).


In the `workers/generic-worker` directory, run `./build.sh` to check go version, generate code, build binaries, compile (but not run) tests, perform linting, and ensure there are no ineffective assignments in go code.

`./build.sh` takes optional arguments, `-a` to build all platforms, and `-t` to run tests. By default tests are not run and only the current platform is built.

All being well, the binaries will be built in the directory you executed the `build.sh` script from.

## Run the generic worker test suite

For this you need to have the source files (you cannot run the tests from the binary package).

Then cd into the source directory, and run:

```
./build.sh -t
```

Note that this will require `sudo` access on Linux.

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
