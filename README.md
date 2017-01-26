# generic-worker
<img src="https://tools.taskcluster.net/lib/assets/taskcluster-120.png" />
[![Linux Build Status](https://img.shields.io/travis/taskcluster/generic-worker.svg?style=flat-square&label=linux+build)](https://travis-ci.org/taskcluster/generic-worker)
[![Windows Build Status](https://img.shields.io/appveyor/ci/petemoore/generic-worker.svg?style=flat-square&label=windows+build)](https://ci.appveyor.com/project/petemoore/generic-worker)
[![GoDoc](https://godoc.org/github.com/taskcluster/generic-worker?status.svg)](https://godoc.org/github.com/taskcluster/generic-worker)
[![Coverage Status](https://coveralls.io/repos/taskcluster/generic-worker/badge.svg?branch=master&service=github)](https://coveralls.io/github/taskcluster/generic-worker?branch=master)
[![License](https://img.shields.io/badge/license-MPL%202.0-orange.svg)](http://mozilla.org/MPL/2.0)

A generic worker for task cluster, written in go.

# Install binary

* Download the latest release for your platform from https://github.com/taskcluster/generic-worker/releases
* Download the latest release of livelog for your platform from https://github.com/taskcluster/livelog/releases
* For darwin/linux, make the binaries executable: `chmod a+x {generic-worker,livelog}*`

# Build from source

If you prefer not to use a prepackaged binary, or want to have the latest unreleased version from the development head:

* Head over to http://golang.org/doc/install and follow the instructions for your platform. Be sure to set your GOPATH to something appropriate.
* Run `go get github.com/taskcluster/generic-worker`
* Run `go get github.com/taskcluster/livelog`

All being well, the binaries will be built under `${GOPATH}/bin`.

# Create TaskCluster account

Head over to https://tools.taskcluster.net/auth/clients/ and create yourself a clientId with permanent credentials. Then go to https://tools.taskcluster.net/auth/roles/ and create a role called `client-id:<your-client-id>` and give it the scope `worker-developer`. Keep a note of your clientId and accessToken.

# Set up your env

View the generic worker help, to see what config you need to set up:

```
generic-worker --help
```

This should display something like this:

```
generic-worker
generic-worker is a taskcluster worker that can run on any platform that supports go (golang).
See http://taskcluster.github.io/generic-worker/ for more details. Essentially, the worker is
the taskcluster component that executes tasks. It requests tasks from the taskcluster queue,
and reports back results to the queue.

  Usage:
    generic-worker run                      [--config         CONFIG-FILE]
                                            [--configure-for-aws]
    generic-worker install (startup|service [--nssm           NSSM-EXE]
                                            [--service-name   SERVICE-NAME])
                                            [--config         CONFIG-FILE]
                                            [--username       USERNAME]
                                            [--password       PASSWORD]
    generic-worker show-payload-schema
    generic-worker new-openpgp-keypair      --file PRIVATE-KEY-FILE
    generic-worker --help
    generic-worker --version

  Targets:
    run                                     Runs the generic-worker in an infinite loop.
    show-payload-schema                     Each taskcluster task defines a payload to be
                                            interpreted by the worker that executes it. This
                                            payload is validated against a json schema baked
                                            into the release. This option outputs the json
                                            schema used in this version of the generic
                                            worker.
    install                                 This will install the generic worker as a
                                            Windows service. If the Windows user USERNAME
                                            does not already exist on the system, the user
                                            will be created. This user will be used to run
                                            the service.
    new-openpgp-keypair                     This will generate a fresh, new OpenPGP
                                            compliant private/public key pair. The public
                                            key will be written to stdout and the private
                                            key will be written to the specified file.

  Options:
    --config CONFIG-FILE                    Json configuration file to use. See
                                            configuration section below to see what this
                                            file should contain. When calling the install
                                            target, this is the config file that the
                                            installation should use, rather than the
                                            config to use during install.
                                            [default: generic-worker.config]
    --configure-for-aws                     This will create the CONFIG-FILE for an AWS
                                            installation by querying the AWS environment
                                            and setting appropriate values.
    --nssm NSSM-EXE                         The full path to nssm.exe to use for
                                            installing the service.
                                            [default: C:\nssm-2.24\win64\nssm.exe]
    --service-name SERVICE-NAME             The name that the Windows service should be
                                            installed under. [default: Generic Worker]
    --username USERNAME                     The Windows user to run the generic worker
                                            Windows service as. If the user does not
                                            already exist on the system, it will be
                                            created. [default: GenericWorker]
    --password PASSWORD                     The password for the username specified
                                            with -u|--username option. If not specified
                                            a random password will be generated.
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
          clientId                          Taskcluster client id used by generic worker to
                                            talk to taskcluster queue.
          livelogSecret                     This should match the secret used by the
                                            stateless dns server; see
                                            https://github.com/taskcluster/stateless-dns-server
          publicIP                          The IP address for clients to be directed to
                                            for serving live logs; see
                                            https://github.com/taskcluster/livelog and
                                            https://github.com/taskcluster/stateless-dns-server
          signingKeyLocation                The PGP signing key for signing artifacts with.
          workerGroup                       Typically this would be an aws region - an
                                            identifier to uniquely identify which pool of
                                            workers this worker logically belongs to.
          workerId                          A name to uniquely identify your worker.
          workerType                        This should match a worker_type managed by the
                                            provisioner you have specified.

        ** OPTIONAL ** properties
        =========================

          cachesDir                         The location where task caches should be stored on
                                            the worker. [default: C:\generic-worker\caches]
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
          downloadsDir                      The location where resources are downloaded for
                                            populating preloaded caches and readonly mounts.
                                            [default: C:\generic-worker\downloads]
          idleShutdownTimeoutSecs           How many seconds to wait without getting a new
                                            task to perform, before shutting down the computer.
                                            An integer, >= 0. A value of 0 means "do not shut
                                            the computer down" - i.e. continue running
                                            indefinitely. [default: 0]
          livelogCertificate                SSL certificate to be used by livelog for hosting
                                            logs over https. If not set, http will be used.
          livelogExecutable                 Filepath of LiveLog executable to use; see
                                            https://github.com/taskcluster/livelog
                                            [default: livelog]
          livelogKey                        SSL key to be used by livelog for hosting logs
                                            over https. If not set, http will be used.
          livelogPUTPort                    Port number for livelog HTTP PUT requests.
                                            [default: 60022]
          livelogGETPort                    Port number for livelog HTTP GET requests.
                                            [default: 60023]
          numberOfTasksToRun                If zero, run tasks indefinitely. Otherwise, after
                                            this many tasks, exit. [default: 0]
          provisioner_id                    The taskcluster provisioner which is taking care
                                            of provisioning environments with generic-worker
                                            running on them. [default: aws-provisioner-v1]
          refreshURLsPrematurelySecs        The number of seconds before azure urls expire,
                                            that the generic worker should refresh them.
                                            [default: 310]
          requiredDiskSpaceMegabytes        The garbage collector will ensure at least this
                                            number of megabytes of disk space are available
                                            when each task starts. If it cannot free enough
                                            disk space, the worker will shut itself down.
                                            [default: 10240]
          runTasksAsCurrentUser             If true, users will not be created for tasks, but
                                            the current OS user will be used. Useful if not an
                                            administrator, e.g. when running tests. Should not
                                            be used in production! [default: false]
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
          tasksDir                          The location where task directories should be
                                            created on the worker. [default: C:\Users]
          workerTypeMetaData                This arbitrary json blob will be uploaded as an
                                            artifact called worker_type_metadata.json with each
                                            task. Providing information here, such as a URL to
                                            the code/config used to set up the worker type will
                                            mean that people running tasks on the worker type
                                            will have more information about how it was set up
                                            (for example what has been installed on the
                                            machine).

    Here is an syntactically valid example configuration file:

            {
              "accessToken":                "123bn234bjhgdsjhg234",
              "clientId":                   "hskdjhfasjhdkhdbfoisjd",
              "workerGroup":                "dev-test",
              "workerId":                   "IP_10-134-54-89",
              "workerType":                 "win2008-worker",
              "provisionerId":              "my-provisioner",
              "livelogSecret":              "baNaNa-SouP4tEa",
              "publicIP":                   "12.24.35.46",
              "signingKeyLocation":         "C:\\generic-worker\\generic-worker-gpg-signing-key.key"
            }


    If an optional config setting is not provided in the json configuration file, the
    default will be taken (defaults documented above).

    If no value can be determined for a required config setting, the generic-worker will
    exit with a failure message.

```

# Start the generic worker

Simply run:

```
generic-worker --config CONFIG-FILE
```

and watch logs for a successful startup. If you can see it is polling the Queue, and the process does not exit, then you can continue. If it reports a problem, follow any instructions it provides. If you are really stuck, join #taskcluster channel on irc.mozilla.org, and ask for help.

It should look something like this:

```
22:29:40.326 2ms    2ms    generic-worker - Detected darwin platform
22:29:40.327 3ms    3ms    queue - Making http request: &{GET https://queue.taskcluster.net/v1/poll-task-url/aws-provisioner-v1/win2012r2 HTTP/1.1 1 1 map[Content-Type:[application/json] Authorization:[Hawk id="aws-provisioner", mac="MVfkV6dfr36FFDR3434GoOxPRV+Bsdpqnyso9mtejHY=", ts="1449354580", nonce="pKTcnRfr", ext="eyJjZXJgFGHsdfVFTSI6eyJ2ZXJzaW9uFDf9gu3hjdkrh3khykfkj45zdW1lOndvcmtlci10eXBlOmF3cy1wcm92aXNpb25lci12MS93aW4yMDEycjIiLCJhc3N1bWU6d29ya2VyLWlkOioiXSwic3RhcnQiOjE0NDkzMjg0MTc1MDYsImV4cGlyeSI6MTQ0OTY3NDMxNzUwNiwic2VlZCI6ImR2eGdReXVFVFltUzZzeTE3ZFY2TUFmYjdLVWd0WVNTeUs3V2FWajZLR2dBIiwic2lnbmF0dXJlIjoiUjVPL3Jtdk5OR2RPNXNxcEZibWppcitGM3FKZ2RYNS90QU1DQ3ltK2ZIdz0ifX0="]] <nil> 0 [] false queue.taskcluster.net map[] map[] <nil> map[]   <nil> <nil>}
22:29:41.455 1s     1s     generic-worker - Refreshing signed urls in 24m49.928485914s
22:29:41.455 20us   20us   generic-worker -   Priority (1) Delete URL: https://taskclusterqueuev1.queue.core.windows.net/queue-b7s5ezzeusysb327h2qdcv4y-sergv56zmysxaedc7n2h5t5a-5/messages/{{messageId}}?popreceipt={{popReceipt}}&sv=2015-04-05&se=2015-12-05T22%3A59%3A41Z&sp=p&spr=https&sig=wPRqqdRtqnIK3n6Qss4rkMiAO0KSE12P8Y3E3S0cLmU%3D&st=2015-12-05T22%3A14%3A41Z
22:29:41.455 1us    1us    generic-worker -   Priority (1) Poll URL:   https://taskclusterqueuev1.queue.core.windows.net/queue-b7s5ezzeusysb327h2qdcv4y-sergv56zmysxaedc7n2h5t5a-5/messages?visibilitytimeout=300&sv=2015-04-05&se=2015-12-05T22%3A59%3A41Z&sp=p&spr=https&sig=wPRqqdRtqnIK3n6Qss4rkMiAO0KSE12P8Y3E3S0cLmU%3D&st=2015-12-05T22%3A14%3A41Z
22:29:41.455 1us    1us    generic-worker -   Priority (2) Delete URL: https://taskclusterqueuev1.queue.core.windows.net/queue-b7s5ezzeusysb327h2qdcv4y-sergv56zmysxaedc7n2h5t5a-1/messages/{{messageId}}?popreceipt={{popReceipt}}&sv=2015-04-05&se=2015-12-05T22%3A59%3A41Z&sp=p&spr=https&sig=H%2B5fkdbb8A3FMODzY94k7bmVXur18mbRQA%2FJDxNgUoc%3D&st=2015-12-05T22%3A14%3A41Z
22:29:41.455 1us    1us    generic-worker -   Priority (2) Poll URL:   https://taskclusterqueuev1.queue.core.windows.net/queue-b7s5ezzeusysb327h2qdcv4y-sergv56zmysxaedc7n2h5t5a-1/messages?visibilitytimeout=300&sv=2015-04-05&se=2015-12-05T22%3A59%3A41Z&sp=p&spr=https&sig=H%2B5fkdbb8A3FMODzY94k7bmVXur18mbRQA%2FJDxNgUoc%3D&st=2015-12-05T22%3A14%3A41Z
22:29:42.337 881ms  881ms  generic-worker - Zero tasks returned in Azure XML QueueMessagesList
22:29:42.564 226ms  226ms  generic-worker - Zero tasks returned in Azure XML QueueMessagesList
22:29:42.564 994ns  978ns  generic-worker - No task claimed from any Azure queue...
22:29:42.767 203ms  203ms  generic-worker - Zero tasks returned in Azure XML QueueMessagesList
22:29:42.970 202ms  202ms  generic-worker - Zero tasks returned in Azure XML QueueMessagesList
22:29:42.970 1us    1us    generic-worker - No task claimed from any Azure queue...
22:29:43.767 797ms  797ms  generic-worker - Zero tasks returned in Azure XML QueueMessagesList
22:29:43.968 201ms  201ms  generic-worker - Zero tasks returned in Azure XML QueueMessagesList
22:29:43.968 928ns  918ns  generic-worker - No task claimed from any Azure queue...
22:29:44.767 798ms  798ms  generic-worker - Zero tasks returned in Azure XML QueueMessagesList
22:29:44.959 192ms  192ms  generic-worker - Zero tasks returned in Azure XML QueueMessagesList
```

# Create a test job

Go to https://tools.taskcluster.net/task-creator/ and create a task to run on your generic worker.

Use [this example](worker_types/win2012r2/task-definition.json) as a template, but make sure to edit `provisionerId` and `workerType` values so that they match what you set in your config file.

Please note you should *NOT* use the default value of `aws-provisioner` for the `provisionerId` since then the production aws provisioner may start spawning ec2 instances, and the docker-worker may try to run the job. By specifying something unique for your local environment, the aws provisioner and docker workers will leave this task alone, and only your machine will claim the task.

Don't forget to submit the task by clicking the *Create Task* icon.

If all is well, your local generic worker should pick up the job you submit, run it, and report back status.

# Run the generic worker test suite

For this you need to have the source files (you cannot run the tests from the binary package).

Then cd into the source directory, and run:

```
go test -v ./...
```

# Making a new generic worker release

Run the `release.sh` script like so:

```
$ ./release.sh 7.2.9
```

This will perform some checks, tag the repo, push the tag to github, which will then trigger travis-ci to run tests, and publish the new release.

# Creating and updating worker types

See [worker_types README.md](https://github.com/taskcluster/generic-worker/blob/master/worker_types/README.md).

# Further information

Please see:

* [TaskCluster Documentation](https://docs.taskcluster.net/)
* [Generic Worker presentations](https://docs.taskcluster.net/presentations) (focus on Windows platform)
* [TaskCluster Web Tools] (https://tools.taskcluster.net/)
* [Generic Worker Open Bugs] (https://bugzilla.mozilla.org/buglist.cgi?f1=product&list_id=12722874&o1=equals&query_based_on=Taskcluster%20last%202%20days&o2=equals&query_format=advanced&f2=component&v1=Taskcluster&v2=Generic-Worker&known_name=Taskcluster%20last%202%20days)
