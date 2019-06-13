# generic-worker

<img align="right" src="https://avatars3.githubusercontent.com/u/6257436?s=256" /> A generic worker for [taskcluster](https://tools.taskcluster.net/), written in go.

[![Taskcluster CI Status](https://github.taskcluster.net/v1/repository/taskcluster/generic-worker/master/badge.svg)](https://github.taskcluster.net/v1/repository/taskcluster/generic-worker/master/latest)
[![Linux Build Status](https://img.shields.io/travis/taskcluster/generic-worker.svg?style=flat-square&label=linux+build)](https://travis-ci.org/taskcluster/generic-worker)
[![GoDoc](https://godoc.org/github.com/taskcluster/generic-worker?status.svg)](https://godoc.org/github.com/taskcluster/generic-worker)
[![Coverage Status](https://coveralls.io/repos/taskcluster/generic-worker/badge.svg?branch=master&service=github)](https://coveralls.io/github/taskcluster/generic-worker?branch=master)
[![License](https://img.shields.io/badge/license-MPL%202.0-orange.svg)](http://mozilla.org/MPL/2.0)

# Engines

## Simple engine

This was the first engine to be written, and is, pretty simple. It executes
processes as child processes of the generic-worker process, under the same user
account that the generic-worker process runs as. Note, this means that anything
that the worker has access to, the tasks will also have access to.

This is therefore a pretty insecure engine (tasks can read generic-worker
config file and thus access taskcluster credentials for claiming work from the
Queue).

Also it is impossible for the worker to guarantee a clean task environment
between task runs, since any task can potentially soil the environment by
changing user settings or for example, leaving files around.

## Multiuser engine

This was the next engine to be written, and solves the problem of task
isolation by creating unique OS user accounts for each task that is to be run.
Each task user account (by default) is unprivileged, much like a guest user
account. Once the task has completed, the task user account is purged, and
there should be no further trace of the task on the system. The task user does
not have permission to alter system-wide settings, so after the user account is
purged, the host environment should be restored to a pristine state.

Since the generic-worker process runs under a different user account to the
task processes, taskcluster credentials, signing keys, and other private matter
can be protected from task access. Note, it is the responsibility of the host
owner to lock down resources as necessary, to ensure that an unprivleged
account does not have access to anything private on the machine.

Since tasks run on the host of the worker (without any container technology or
virtualisation technology), toolchains that need to be installed as an
Administrator typically need to be installed on the host environment.
Toolchains that do not require Administrator privileges to be installed can be
installed as task steps.

## Docker engine

Work has started to provide a docker engine, that allows tasks to be executed
in the context of a docker container running on the host system. This has
similar benefits as the multiuser engine (task isolation, protection of host
secrets) but additionally has the advantage that the target execution
environment can be defined in a docker image, varying significantly from the
host environment. This makes it possible to have arbitrary toolchains available
to a task, without needing to roll new host environments, and also allows tasks
to run task steps as the root user, without impacting the security of the host
environment.

At the moment there is only elementary support for running tasks inside a
docker container, and this should not be used in production. The features are
being implemented in [bug 1499055](https://bugzil.la/1499055).

# Obtain prebuilt release

* Download the latest release for your platform from https://github.com/taskcluster/generic-worker/releases
* Download the latest release of taskcluster-proxy for your platform from https://github.com/taskcluster/taskcluster-proxy/releases
* Download the latest release of livelog for your platform from https://github.com/taskcluster/livelog/releases
* For darwin/linux, make the binaries executable: `chmod a+x {generic-worker,livelog,taskcluster-proxy}*`

# Build from source

If you prefer not to use a prepackaged binary, or want to have the latest unreleased version from the development head:

* Head over to https://golang.org/dl/ and follow the instructions for your platform. __NOTE: go 1.8 or higher is required__. Be sure to set your GOPATH to something appropriate.
* Run `go get github.com/taskcluster/livelog`
* Run `go get github.com/taskcluster/taskcluster-proxy`

Run `go get -tags multiuser github.com/taskcluster/generic-worker` (windows/darwin) and/or `go get -tags simple github.com/taskcluster/generic-worker` (linux/darwin) and/or `go get -tags docker github.com/taskcluster/generic-worker` (linux). This should also build binaries for your platform.

Run `./build.sh` to check go version, generate code, build binaries, compile (but not run) tests, perform linting, and ensure there are no ineffective assignments in go code.

`./build.sh` takes optional arguments, `-a` to build all platforms, and `-t` to run tests. By default tests are not run and only the current platform is built.

All being well, the binaries will be built in the directory you executed the `build.sh` script from.

# Guide to installation on worker machines

The following instructions should be considered more as a guide rather than
concrete requirements.

They document _possible_ (and simple) ways to install and run generic-worker on
various platforms. Real life production deployments may be integrated quite
differently.

Each installation guide provides a bootstrap script to runs the generic-worker
binary. The bootstrapping script can be easily customised (for example, to deal
with automatic quarantining of workers, waiting for custom events, etc).

## Windows - multiuser build

1. Build or download a `generic-worker.exe` windows multiuser binary.

2. Run the following command to generate an ed25519 private key for signing
   artifacts:

   * `generic-worker.exe new-ed25519-keypair --file C:\generic-worker\ed25519_key`

   The private key will be written to the file `C:\generic-worker\ed25519_key`,
   and the public key will be written to standard out. Keep a copy of the
   public key if you wish to validate artifact signatures.

3. Download NSSM 2.24 from https://nssm.cc/release/nssm-2.24.zip and extract it
   under `C:\`.

4. Install generic-worker as a Windows service running under the `LocalSystem`
   account, by running the following command as an `Administrator`:

   * `generic-worker.exe install service` (see `generic-worker.exe --help` to
     apply non-default configuration settings)

5. Download livelog from https://github.com/taskcluster/livelog/releases and
   place it in `C:\generic-worker\livelog.exe`.

6. Download taskcluster proxy from
   https://github.com/taskcluster/taskcluster-proxy/releases and place it in
   `C:\generic-worker\taskcluster-proxy.exe`.

7. Run `C:\generic-worker\run-generic-worker.bat` as an `Administrator` to
   create `C:\generic-worker\generic-worker.config`.

8. Edit file `C:\generic-worker\generic-worker.config` with appropriate
   settings (see `generic-worker.exe --help` for information).

9. Reboot the machine, and the worker should be running. Check logs under
   `C:\generic-worker\generic-worker.log`.


## macOS - multiuser/simple build

 1. Log into target user account:

    __Simple build__: Create user account `genericworker` to run the worker
	under, and log in as `genericworker` in a shell.

    __Multiuser build__: Log in as root (`sudo su -`) in a shell.

 2. Obtain a copy of `generic-worker` and install it under `/usr/local/bin/generic-worker`.

 3. Obtain a copy of `taskcluster-proxy` and install it under `/usr/local/bin/taskcluster-proxy`.

 4. Obtain a copy of `livelog` and install it under `/usr/local/bin/livelog`.

 5. Make `generic-worker`, `taskcluster-proxy`, `livelog` binaries executable:

    * `chmod a+x /usr/local/bin/{generic-worker,taskcluster-proxy,livelog}`

 6. Generate a key for signing artifacts:

    * `mkdir /etc/generic-worker`

    * __Simple build only__: `sudo chown genericworker:staff /etc/generic-worker`

    * `/usr/local/bin/generic-worker new-ed25519-keypair --file /etc/generic-worker/ed25519_key`

    The private key will be written to the file
    `/etc/generic-worker/ed25519_key`, and the public key will be written to
    standard out. Keep a copy of the public key if you wish to validate artifact
    signatures.

 6. Create the file `/usr/local/bin/run-generic-worker.sh` with the following content:

    ```
    #!/bin/bash

    . /etc/rc.common

    CheckForNetwork

    while [ "${NETWORKUP}" != "-YES-" ]
    do
      sleep 5
      NETWORKUP=
      CheckForNetwork
    done

    /usr/local/bin/generic-worker run --config /etc/generic-worker/config
    ```

 7. Run the following to make the `run-generic-worker.sh` script executable:

    * `chmod a+x /usr/local/bin/run-generic-worker.sh`

 8. Execute `run-generic-worker.sh` in order to create `/etc/generic-worker/config` file:

    * `/usr/local/bin/run-generic-worker.sh`

 9. Edit `/etc/generic-worker/config` to have appropriate configuration settings
    (see `generic-worker --help` for details).

10. Create launch daemon:

    Create the file `/Library/LaunchDaemons/com.mozilla.genericworker.plist`
    with the following content:

    ```
    <?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
    <plist version="1.0">
        <dict>
            <key>Label</key>
            <string>com.mozilla.genericworker</string>
            <key>Program</key>
            <string>/usr/local/bin/run-generic-worker.sh</string>
            <key>StandardOutPath</key>
            <string>/var/log/genericworker/stdout.log</string>
            <key>StandardErrorPath</key>
            <string>/var/log/genericworker/stderr.log</string>
            <key>RunAtLoad</key>
            <true/>
            <key>UserName</key>
            <string>root</string> <----------- (for multiuser build)
            <string>genericworker</string> <----------- (for simple build)
        </dict>
    </plist>
    ```

11. Install launch daemon:

    * `sudo launchctl load -w /Library/LaunchDaemons/com.mozilla.genericworker.plist`

12. Reboot machine, and watch for logs in `/var/log/generic-worker/`.

## Linux simple/docker build

See
https://github.com/mozilla-releng/build-puppet/tree/531513eae6109d9baca2675f013f9c61b770af19/modules/generic_worker
and
https://github.com/mozilla-releng/build-puppet/blob/master/modules/packages/manifests/mozilla/generic_worker.pp
for inspiration.

# Acquire taskcluster credentials for running tests

There are two alternative mechanisms to acquire the scopes you need.

## Option 1

This method works if you log into Taskcluster via mozillians, *or* you log into
taskcluster via LDAP *using the same email address as your mozillians account*,
*or* if you do not currently have a mozillians account but would like to create
one.

* Sign up for a [Mozillians account](https://mozillians.org/en-US/) (if you do not already have one)
* Request membership of the [taskcluster-contributors](https://mozillians.org/en-US/group/taskcluster-contributors/) mozillians group

## Option 2

This method is for those who wish not to create a mozillians account, but
already authenticate into taskcluster via some other means, or have a
mozillians account but it is registered to a different email address than the
one they use to log into Taskcluster with (e.g. via LDAP integration).

* Request the scope `assume:project:taskcluster:generic-worker-tester` to be
  granted to you via a [bugzilla
  request](https://bugzilla.mozilla.org/enter_bug.cgi?product=Taskcluster&component=Service%20Request),
  including your [currently active `ClientId`](https://tools.taskcluster.net/credentials/)
  in the bug description. From the ClientId, we will be able to work out which role to assign the scope
  to, in order that you acquire the scope with the client you log into Taskcluster tools site with.

Once you have been granted the above scope:

* If you are signed into tools.taskcluster.net already, **sign out**
* Sign into [tools.taskcluster.net](https://tools.taskcluster.net/) using either your new Mozillians account, _or_ your LDAP account **if it uses the same email address as your Mozillians account**
* Check that a role or client of yours appears in [this list](https://tools.taskcluster.net/auth/scopes/assume%3Aproject%3Ataskcluster%3Ageneric-worker-tester)
* Create a permanent client (taskcluster credentials) for yourself in the [Client Manager](https://tools.taskcluster.net/auth/clients/) granting it the single scope `assume:project:taskcluster:generic-worker-tester`

# Set up your env

* Generate an ed25519 key pair with `generic-worker new-ed25519-keypair --file <file>` where `file` is where you want the generated ed25519 private key to be written to
* Create a generic worker configuration file somewhere, with the following content:

```
{
    "accessToken":                "<access token of your permanent credentials>",
    "certificate":                "",
    "clientId":                   "<client ID of your permanent credentials>",
    "ed25519SigningKeyLocation":  "<file location you wrote ed25519 private key to>",
    "livelogSecret":              "<anything you like>",
    "provisionerId":              "test-provisioner",
    "publicIP":                   "<ideally an IP address of one of your network interfaces>",
    "workerGroup":                "test-worker-group",
    "workerId":                   "test-worker-id",
    "workerType":                 "<a unique name that only you will use for your test worker(s)>"
}
```

To see a full description of all the config options available to you, run `generic-worker --help`:

```
generic-worker (multiuser engine) 15.0.0

generic-worker is a taskcluster worker that can run on any platform that supports go (golang).
See http://taskcluster.github.io/generic-worker/ for more details. Essentially, the worker is
the taskcluster component that executes tasks. It requests tasks from the taskcluster queue,
and reports back results to the queue.

  Usage:
    generic-worker run                      [--config         CONFIG-FILE]
                                            [--configure-for-aws | --configure-for-gcp]
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
    --configure-for-aws                     Use this option when installing or running a worker
                                            that is spawned by the AWS provisioner. It will cause
                                            the worker to query the EC2 metadata service when it
                                            is run, in order to retrieve data that will allow it
                                            to self-configure, based on AWS metadata, information
                                            from the provisioner, and the worker type definition
                                            that the provisioner holds for the worker type.
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
                                            'https://taskcluster.net'. Individual services can
                                            override this setting - see the *BaseURL settings.
          workerId                          A name to uniquely identify your worker.
          workerType                        This should match a worker_type managed by the
                                            provisioner you have specified.

        ** OPTIONAL ** properties
        =========================

          authBaseURL                       The base URL for taskcluster auth API calls.
                                            If not provided, the base URL for API calls is
                                            instead derived from rootURL setting as follows:
                                              * https://auth.taskcluster.net/v1 for rootURL https://taskcluster.net
                                              * <rootURL>/api/auth/v1 for all other rootURLs
          availabilityZone                  The EC2 availability zone of the worker.
          cachesDir                         The directory where task caches should be stored on
                                            the worker. The directory will be created if it does
                                            not exist. This may be a relative path to the
                                            current directory, or an absolute path.
                                            [default: caches]
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
                                            an absolute path. [default: downloads]
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
                                            [default: livelog]
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
          provisionerBaseURL                The base URL for aws-provisioner API calls.
                                            If not provided, the base URL for API calls is
                                            instead derived from rootURL setting as follows:
                                              * https://aws-provisioner.taskcluster.net/v1 for rootURL https://taskcluster.net
                                              * <rootURL>/api/aws-provisioner/v1 for all other rootURLs
          provisionerId                     The taskcluster provisioner which is taking care
                                            of provisioning environments with generic-worker
                                            running on them. [default: test-provisioner]
          purgeCacheBaseURL                 The base URL for purge cache API calls.
                                            If not provided, the base URL for API calls is
                                            instead derived from rootURL setting as follows:
                                              * https://purge-cache.taskcluster.net/v1 for rootURL https://taskcluster.net
                                              * <rootURL>/api/purge-cache/v1 for all other rootURLs
          queueBaseURL                      The base URL for API calls to the queue service.
                                            If not provided, the base URL for API calls is
                                            instead derived from rootURL setting as follows:
                                              * https://queue.taskcluster.net/v1 for rootURL https://taskcluster.net
                                              * <rootURL>/api/queue/v1 for all other rootURLs
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
          runTasksAsCurrentUser             If true, users will not be created for tasks, but
                                            the current OS user will be used. [default: false]
          secretsBaseURL                    The base URL for taskcluster secrets API calls.
                                            If not provided, the base URL for API calls is
                                            instead derived from rootURL setting as follows:
                                              * https://secrets.taskcluster.net/v1 for rootURL https://taskcluster.net
                                              * <rootURL>/api/secrets/v1 for all other rootURLs
          sentryProject                     The project name used in https://sentry.io for
                                            reporting worker crashes. Permission to publish
                                            crash reports is granted via the scope
                                            auth:sentry:<sentryProject>. If the taskcluster
                                            client (see clientId property above) does not
                                            posses this scope, no crash reports will be sent.
                                            Similarly, if this property is not specified or
                                            is the empty string, no reports will be sent.
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
                                            [default: taskcluster-worker.net]
          taskclusterProxyExecutable        Filepath of taskcluster-proxy executable to use; see
                                            https://github.com/taskcluster/taskcluster-proxy
                                            [default: taskcluster-proxy]
          taskclusterProxyPort              Port number for taskcluster-proxy HTTP requests.
                                            [default: 80]
          tasksDir                          The location where task directories should be
                                            created on the worker. [default: /Users]
          workerGroup                       Typically this would be an aws region - an
                                            identifier to uniquely identify which pool of
                                            workers this worker logically belongs to.
                                            [default: test-worker-group]
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
```

# Start the generic worker

Simply run:

```
generic-worker run --config <config file>
```

where `<config file>` is the generic worker config file you created above.

# Create a test job

Go to https://tools.taskcluster.net/task-creator/ and create a task to run on your generic worker.

Use [this example](worker_types/win2012r2/task-definition.json) as a template, but make sure to edit `provisionerId` and `workerType` values so that they match what you set in your config file.

Don't forget to submit the task by clicking the *Create Task* icon.

If all is well, your local generic worker should pick up the job you submit, run it, and report back status.

# Modify dependencies

To add, remove, or update dependencies, use [dep](https://golang.github.io/dep/docs/installation.html).
Do not manually edit anything under the `vendor/` directory!

# Run the generic worker test suite

For this you need to have the source files (you cannot run the tests from the binary package).

Then cd into the source directory, and run:

```
go test -v ./...
```

# Making a new generic worker release

Run the `release.sh` script like so:

```
$ ./release.sh 15.0.0
```

This will perform some checks, tag the repo, push the tag to github, which will then trigger travis-ci to run tests, and publish the new release.

# Creating and updating worker types

See [worker_types README.md](https://github.com/taskcluster/generic-worker/blob/master/worker_types/README.md).

# Release notes

In v14.1.2 since v14.1.1
========================

* [Bug 1552465 - generic-worker: only prepare new task environment when task has been claimed](https://bugzil.la/1552465)

In v14.1.1 since v14.1.0
========================

__Please don't use release v14.1.1 on any platform due to [bug 1552465](https://bugzil.la/1552465) which will be fixed in v14.1.2__

* [Bug 1548829 - generic-worker: log header should mention provisionerId](https://bugzil.la/1548829)
* [Bug 1551164 - [mounts] Not able to rename dir caches/*** as tasks/task_***/***: rename caches/*** tasks/task_***/***: file exists](https://bugzil.la/1551164)

In v14.1.0 since v14.0.2
========================

__Please don't use release 14.1.0 on macOS/linux due to [bug 1551164](https://bugzil.la/1551164) which will be fixed in v14.1.1.__

* [Bug 1436195 - Add support for live-logs via websocktunnel](https://bugzil.la/1436195) (note that existing livelog support via stateless DNS still works)

  To enable websocktunnel, include configuration options `wstAudience` and `wstServerURL` to correspond to the websocktunnel server the worker should use.
  For the current production environment that would be:

  ```json
  {
    "wstAudience": "taskcluster-net",
    "wstServerURL": "https://websocktunnel.tasks.build"
  }
  ```

  Omit the configuration items `subdomain`, `livelogGETPort`, `livelogCertificate`, `livelogKey`, and `livelogSecret`.
  These options will be removed in a future release.

  Ensure that the worker's credentials have scope `auth:websocktunnel-token:<wstAudience>/<workerGroup>.<workerId>.*`.

In v14.0.2 since v14.0.1
========================

* [Bug 1533694 - generic-worker: create new task user *before* using current task user](https://bugzil.la/1533694)
* [Bug 1543082 - generic-worker: sentry issue GENERIC-WORKER-1J - runtime error: invalid memory address or nil pointer dereference](https://bugzil.la/1543082)

In v14.0.1 since v14.0.0
========================

Please do not use this release! It has a buggy implementation of bug 1533694 which was fixed in v14.0.2.
* [Bug 1533694 - generic-worker: create new task user *before* using current task user](https://bugzil.la/1533694)

The following bug was backed out:
* [Bug 1436195 - Deploy websocktunnel on generic-worker](https://bugzil.la/1436195)

Support for websocktunnel will be added back in, in generic-worker release 14.1.0.

In v14.0.0 since v13.0.4
========================

The backwardly-incompatible change in release 14.0.0 is that open pgp support has been removed from
Chain Of Trust feature. The following configuration property is no longer supported, and is not
allowed in the generic-worker config file:

```
openpgpSigningKeyLocation
```

**Please note, you need to remove this config property from your config file, if it exists, in order to 
work with generic-worker 14 onwards.**

* [Bug 1436195 - Deploy websocktunnel on generic-worker](https://bugzil.la/1436195)
* [Bug 1502335 - Support running a task inside a fixed docker image](https://bugzil.la/1502335)
* [Bug 1534506 - remove cot gpg support](https://bugzil.la/1534506)

In v13.0.4 since v13.0.3
========================

* [Bug 1533402 - Fix for mounting archives in tasks which contain hard links](https://bugzil.la/1533402)

In v13.0.3 since v13.0.2
========================

* [Bug 1531457 - Don't replace existing generic-worker.config file on startup](https://bugzil.la/1531457)

In v13.0.2 since v12.0.0
========================

The backwardly incompatible change for version 13 is that AWS provisioner worker type definitions no longer
store generic-worker secrets. Instead, the secrets should be placed in a taskcluster secrets secret called
`worker-type:aws-provisioner-v1/<workerType>`. The secret could look _something like this_:

```
config:
  livelogSecret: <secret key>
files:
  - content: >-
      <base64>
    description: SSL certificate for livelog
    encoding: base64
    format: file
    path: 'C:\generic-worker\livelog.crt'
  - content: >-
      <base64>
    description: SSL key for livelog
    encoding: base64
    format: file
    path: 'C:\generic-worker\livelog.key'
```

The `secrets` section of the AWS provisioner worker type definition should be an empty json object:

```json
  "secrets": {}
```

Now the `userdata` section of the worker type definition should contain the remaining (non-secret) configuration, e.g.

```json
  "userData": {
    "genericWorker": {
      "config": {
        "deploymentId": "axlvK6p9SNa-HJgPCVXKEA",
        "ed25519SigningKeyLocation": "C:\\generic-worker\\generic-worker-ed25519-signing-key.key",
        "idleTimeoutSecs": 60,
        "livelogCertificate": "C:\\generic-worker\\livelog.crt",
        "livelogExecutable": "C:\\generic-worker\\livelog.exe",
        "livelogKey": "C:\\generic-worker\\livelog.key",
        "openpgpSigningKeyLocation": "C:\\generic-worker\\generic-worker-gpg-signing-key.key",
        "shutdownMachineOnInternalError": false,
        "subdomain": "taskcluster-worker.net",
        "taskclusterProxyExecutable": "C:\\generic-worker\\taskcluster-proxy.exe",
        "workerTypeMetadata": {
          "machine-setup": {
            "maintainer": "pmoore@mozilla.com",
            "script": "https://raw.githubusercontent.com/taskcluster/generic-worker/53f1d934688f9e9c6ba60db6cc9185e5c9e9c0ce/worker_types/nss-win2012r2/userdata"
          }
        }
      }
    }
  },

```

* [Bug 1375200 - [generic-worker] Remove support for reading secrets from AWS worker type definition](https://bugzil.la/1375200)
* [Bug 1524630 - `generic-worker --help` should state that xxxBaseURL settings are optional overrides for the global rootURL setting](https://bugzil.la/1524630)
* [Bug 1524792 - Bring GCP integration up-to-date with recent changes](https://bugzil.la/1524792)

v13.0.1
=======

Please do not use this release! It is broken.

v13.0.0
=======

Please do not use this release! It is broken.

In v12.0.0 since v11.1.1
========================

The backwardly incompatible change for version 12 is that you need to create both a openpgp signing key
_and_ an ed25519 signing key before running the worker.

```
    generic-worker new-ed25519-keypair      --file ED25519-PRIVATE-KEY-FILE
    generic-worker new-openpgp-keypair      --file OPENPGP-PRIVATE-KEY-FILE
```

Note, *both* are required.

The config property `signingKeyLocation` has been renamed to `openpgpSigningKeyLocation` and the new config property
`ed25519SigningKeyLocation` is needed. For _example_, could changes could look like this:

```diff
-        "signingKeyLocation": "C:\\generic-worker\\generic-worker-gpg-signing-key.key",
+        "openpgpSigningKeyLocation": "C:\\generic-worker\\generic-worker-gpg-signing-key.key",
+        "ed25519SigningKeyLocation": "C:\\generic-worker\\generic-worker-ed25519-signing-key.key",
```

* [Bug 1518913 - generic-worker: add ed25519 cot signature support; deprecate gpg](https://bugzil.la/1518913)

In v11.1.1 since v11.1.0
========================

* [Bug 1428422 - Update go client for r14y](https://bugzil.la/1428422)
* [Bug 1469614 - Upgrade generic-worker to use rootUrl](https://bugzil.la/1469614)

In v11.1.0 since v11.0.1
========================

* [Bug 1495732 - Inline source for mounts](https://bugzil.la/1495732)
* [Bug 1479415 - Executing non-executable file is task failure not worker panic](https://bugzil.la/1479415)
* [Bug 1493688 - Avoid panic on Windows 10 Build 1803 if task directory not on default drive](https://bugzil.la/1493688)
* [Bug 1506621 - Use new archiver library](https://bugzil.la/1506621)
* [Bug 1516458 - Provide taskcluster-proxy with rootURL](https://bugzil.la/1516458)

In v11.0.1 since v11.0.0
========================

* [Bug 1486800 - Don't start task timer until Purge Cache service interaction has completed](https://bugzil.la/1486800)

In v11.0.0 since v10.11.3
=========================

The backwardly incompatible change for version 11 is that you need to specify `--configure-for-aws`
at installation time, if the workers will run in AWS. Previously, this was assumed to always be
the case.

```
    generic-worker install service          [--nssm           NSSM-EXE]
                                            [--service-name   SERVICE-NAME]
                                            [--config         CONFIG-FILE]
                                            [--configure-for-aws]
```

* [Bug 1495435 - Require --configure-for-aws at installation time, if needed at runtime](https://bugzil.la/1495435)

### In v10.11.3 since v10.11.2

* [Bug 1480412 - allow empty osGroups list on non-Windows platforms](https://bugzil.la/1480412#c10)

### In v10.11.2 since v10.11.1

* [Bug 1475689 - osx generic-worker not rebooting after some failed jobs](https://bugzil.la/1475689)

### In v10.11.1 since v10.11.1alpha1

* [Bug 1439588 - Add feature to support running Windows tasks in an elevated process (Administrator)](https://bugzil.la/1439588)

### In v10.10.0 since v10.9.0

* [Bug 1469402 - Support for onExitStatus on generic-worker](https://bugzil.la/1469402)

### In v10.8.5 since v10.8.4

* [Bug 1468155 - Enforce that tasks depend on the tasks whose content they mount](https://bugzil.la/1468155)

### In v10.8.4 since v10.8.3

* [Bug 1433854 - clean up after tasks on windows test workers](https://bugzil.la/1433854)
* [Bug 1465479 - Don't block task abortion waiting for cmd.Wait() to complete](https://bugzil.la/1465479)
* [Bug 1466803 - Could not copy from backing log to livelog: io: read/write on closed pipe](https://bugzil.la/1466803)

### In v10.8.2 since v10.8.1

* [Bug 1462369 - Kill entire process tree when aborting a task](https://bugzil.la/1462369)

### In v10.8.0 since v10.7.12

* [Bug 1459376 - Log information about files downloaded via "mounts"](https://bugzil.la/1459376)

### In v10.7.12 since v10.7.11

* [Bug 1452095 - Upgrade mac taskcluster workers to generic-worker 10.8.4](https://bugzil.la/1452095)
* [Bug 1458873 - Process termination when aborting task not always successful on Windows](https://bugzil.la/1458873)

### In v10.7.11 since v10.7.10

* [Bug 1456357 - Intermittent [taskcluster:error] Get http://schemas.taskcluster.net/generic-worker/v1/payload.json: dial tcp 52.84.128.102:80: i/o timeout](https://bugzil.la/1456357)

### In v10.7.10 since v10.7.9

* [Bug 1444118 - Better log message if chain of trust key is not valid](https://bugzil.la/1444118)

### In v10.7.6 since v10.7.5

* [Bug 1447265 - Use go 1.10 os/exec package for running processes with CreateProcessAsUser on Windows](https://bugzil.la/1447265)

### In v10.7.3 since v10.7.2

* [Bug 1180187 - generic-worker: listen for and handle worker shutdown](https://bugzil.la/1180187)

### In v10.6.1 since v10.6.0

* [Bug 1443595 - github binary downloads are broken in occ due to the tls upgrade](https://bugzil.la/1443595)

### In v10.6.0 since v10.5.1

* [Bug 1358545 - [generic-worker] startup tests for CoT privkey protection](https://bugzil.la/1358545)
* [Bug 1439517 - generic-worker: support taskcluster-proxy](https://bugzil.la/1439517)
* [Bug 1441482 - generic-worker should free up disk space *before* claiming a task](https://bugzil.la/1441482)

### In v10.5.1 since v10.5.0

* [Bug 1333957 - Make "Aborting task - max run time exceeded!" a Treeherder-parseable message](https://bugzil.la/1333957)

### In v10.5.0 since v10.5.0alpha4

* [Bug 1172273 - generic-worker (windows): RDP into task users](https://bugzil.la/1172273)
* [Bug 1429370 - Changing PR title causes new tasks to be triggered](https://bugzil.la/1429370)

### In v10.4.1 since v10.4.0

* [Bug 1424986 - No attempt in logs to reclaim task](https://bugzil.la/1424986)
* [Bug 1425438 - Idle time inaccurate when (and after) computer sleeps/hibernates/is not being watched](https://bugzil.la/1425438)

### In v10.4.0 since v10.3.1

* [Bug 1423215 - Uploaded gzipped job artifacts (such as runnable-jobs.json.gz) have incorrect Content-Encoding/Type](https://bugzil.la/1423215)

### In v10.3.0 since v10.2.3

* [Bug 1415088 - Include generic worker version number when reporting crashes to sentry](https://bugzil.la/1415088)

### In v10.2.3 since v10.2.2

* [Bug 1397373 - Move superseding docs out of docker-worker](https://bugzil.la/1397373)
* [Bug 1401007 - Ensure generic worker runs on Windows Server 2016](https://bugzil.la/1401007)
* [Bug 1402152 - Use temporary credentials from claimWork, reclaimTask in reclaimTask, createArtifact, reportCompleted](https://bugzil.la/1402152)

### In v10.2.2 since v10.2.1

* [Bug 1382204 - Enable coalescing for scm level 2,3 test tasks on macOS and win10 gpu and linux](https://bugzil.la/1382204)

### In v10.2.1 since v10.2.0

* [Bug 1394557 - Intermittent "400 Bad Request" errors when uploading to the TC queue causing Windows job failures](https://bugzil.la/1394557)

### In v10.2.0 since v10.1.8

* [Bug 1383024 - generic-worker: Implement coalescing/superseding](https://bugzil.la/1383024)

### In v10.1.8 since v10.1.7

* [Bug 1387015 - Python wheel artifact should not be gzipped](https://bugzil.la/1387015)

### In v10.1.7 since v10.1.6

* [Bug 1385870 - generic-worker: Do not gzip content encode artifacts with .xz extension](https://bugzil.la/1385870)

### In v10.1.6 since v10.1.5

* [Bug 1381801 - Task payload timestamps have inconsistent precision with top level task timestamps](https://bugzil.la/1381801)

### In v10.1.5 since v10.1.4

* [Bug 1360198 - Don't explicitly set artifact expiry for generic-worker tasks, if it is just task expiry](https://bugzil.la/1360198)

### In v10.1.4 since v10.1.3

* [Bug 1380978 - generic-worker: chain of trust artifacts should be indexed by artifact name, not artifact path](https://bugzil.la/1380978)

### In v10.0.5 since v10.0.4

* [Bug 1372210 - CoT on generic worker for windows uploads to 'public/logs/' when it should upload to 'public/'](https://bugzil.la/1372210)

### In v8.5.0 since v8.4.1

* [Bug 1360539 - generic-worker 8.3.0 to 8.4.1 causing process failures on win2012r2 worker types (runTasksAsCurrentUser: false)](https://bugzil.la/1360539)

### In v8.3.0 since v8.2.0

* [Bug 1347956 - Some public-artifacts.taskcluster.net files are not served gzipped](https://bugzil.la/1347956)

### In v8.2.0 since v8.1.1

* [Bug 1356800 - [generic-worker] Handle some errors during artifact uploading more gracefully](https://bugzil.la/1356800)

### In v8.1.0 since v8.0.1

* [Bug 1352457 - Support artifact name in task payload](https://bugzil.la/1352457)

### In v8.0.1 since v8.0.0

* [Bug 1337132 - 64-bit Windows static builds are very frequently timing out since the worker change from bug 1336948 happened](https://bugzil.la/1337132)

### In v7.2.13 since v7.2.12

* [Bug 1261188 - test_Edge_availability.js fails on Win10 in automation](https://bugzil.la/1261188)

### In v7.2.6 since v7.2.5

* [Bug 1329617 - generic-worker 7.2.5 stops claiming tasks after a task it is running gets cancelled](https://bugzil.la/1329617)

### In v7.2.2 since v7.2.1

* [Bug 1323827 - [generic-worker] Worker tries reclaiming resolved task](https://bugzil.la/1323827)

### In v7.1.1 since v7.1.0

* [Bug 1312383 - taskcluster windows 7 ec2 instances underperform](https://bugzil.la/1312383)

### In v7.1.0 since v7.0.3alpha1

* [Bug 1307204 - Convert gecko-L-b-win2012 workers to c4.4xlarge](https://bugzil.la/1307204)

### In v7.0.3alpha1 since v7.0.2alpha1

* [Bug 1303455 - TC Windows tests run without JOB_OBJECT_LIMIT_BREAKAWAY_OK](https://bugzil.la/1303455)

### In v6.1.0 since v6.1.0alpha1

* [Bug 1298010 - update Generic Worker to terminate host instance if the worker type definition has changed since the instance was started](https://bugzil.la/1298010)

### In v6.0.0 since v5.4.0

* [Bug 1306988 - GenericWorker task user groups should be configurable or task dependent](https://bugzil.la/1306988)
* [Bug 1307383 - win2012r2 hung / didn't run correctly](https://bugzil.la/1307383)

### In v5.4.0 since v5.3.1

* [Bug 1182451 - preloaded writable directory caches / empty writable directory caches / preloaded readonly directory mounts / preloaded readonly files](https://bugzil.la/1182451)
* [Bug 1305048 - Add node/npm to the generic "win2012r2" worker](https://bugzil.la/1305048)

### In v5.3.0 since v5.2.0

* [Bug 1287112 - enable chain-of-trust artifact generation in generic-worker](https://bugzil.la/1287112)

### In v5.1.0 since v5.0.3

* [Bug 1291249 - Logs uploaded by generic-worker to public-artifacts.taskcluster.net aren't using gzip](https://bugzil.la/1291249)

### In v4.0.0alpha1 since v3.0.0alpha1

* [Bug 1181524 - generic-worker: Reject tasks w. malformed-payload if artifact.expires x3c task.deadline](https://bugzil.la/1181524)
* [Bug 1191524 - [Browser] Suggestions in youtube search bar overlap with icon.](https://bugzil.la/1191524)
* [Bug 1285197 - package github.com/taskcluster/taskcluster-client-go: no buildable Go source files in x3cGOPATHx3e/src/github.com/taskcluster/taskcluster-client-go](https://bugzil.la/1285197)

### In v3.0.0alpha1 since v2.1.0

* [Bug 1279019 - Generic worker should log metadata about itself and the worker type it is running on](https://bugzil.la/1279019)

### In v2.0.0alpha44 since v2.0.0alpha43

* [Bug 1277568 - Generic worker live log artifacts are unreachable after task completes](https://bugzil.la/1277568)


# Further information

Please see:

* [Taskcluster Documentation](https://docs.taskcluster.net/)
* [Generic Worker presentations](https://docs.taskcluster.net/presentations) (focus on Windows platform)
* [Taskcluster Web Tools](https://tools.taskcluster.net/)
* [Generic Worker Open Bugs](https://bugzilla.mozilla.org/buglist.cgi?f1=product&resolution=---&o1=equals&o2=equals&query_format=advanced&f2=component&v1=Taskcluster&v2=Generic-Worker)

Useful information on win32 APIs:

* [Starting an Interactive Client Process in C++](https://msdn.microsoft.com/en-us/9e9ed9b7-ea23-4dec-8b92-a86aa81267ab?f=255&MSPPError=-2147217396)
* [Getting the Logon SID in C++](https://msdn.microsoft.com/en-us/aa446670?f=255&MSPPError=-2147217396)
* [Modifying the ACLs of an Object in C++](https://docs.microsoft.com/en-us/windows/desktop/secauthz/modifying-the-acls-of-an-object-in-c--)
* [Window Station Security and Access Rights](https://docs.microsoft.com/en-us/windows/desktop/winstation/window-station-security-and-access-rights)
