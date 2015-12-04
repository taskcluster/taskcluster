# generic-worker
<img src="https://tools.taskcluster.net/lib/assets/taskcluster-120.png" />
[![Build Status](https://travis-ci.org/taskcluster/generic-worker.svg?branch=master)](http://travis-ci.org/taskcluster/generic-worker)
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
    generic-worker run                     [--config         CONFIG-FILE]
                                           [--configure-for-aws]
    generic-worker install                 [--config         CONFIG-FILE]
                                           [--nssm           NSSM-EXE]
                                           [--password       PASSWORD]
                                           [--service-name   SERVICE-NAME]
                                           [--username       USERNAME]
    generic-worker show-payload-schema
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

  Options:
    --configure-for-aws                     This will create the CONFIG-FILE for an AWS
                                            installation by querying the AWS environment
                                            and setting appropriate values.
    --config CONFIG-FILE                    Json configuration file to use. See
                                            configuration section below to see what this
                                            file should contain.
                                            [default: generic-worker.config]
    --help                                  Display this help text.
    --nssm NSSM-EXE                         The full path to nssm.exe to use for
                                            installing the service.
                                            [default: C:\nssm-2.24\win64\nssm.exe]
    --password PASSWORD                     The password for the username specified
                                            with -u|--username option. If not specified
                                            a random password will be generated.
    --service-name SERVICE-NAME             The name that the Windows service should be
                                            installed under. [default: Generic Worker]
    --username USERNAME                     The Windows user to run the generic worker
                                            Windows service as. If the user does not
                                            already exist on the system, it will be
                                            created. [default: GenericWorker]
    --version                               The release version of the generic-worker.


  Configuring the generic worker:

    The configuration file for the generic worker is specified with -c|--config CONFIG-FILE
    as described above. Its format is a json dictionary of name/value pairs.

        ** REQUIRED ** properties
        =========================

          access_token                      Taskcluster access token used by generic worker
                                            to talk to taskcluster queue.
          client_id                         Taskcluster client id used by generic worker to
                                            talk to taskcluster queue.
          worker_group                      Typically this would be an aws region - an
                                            identifier to uniquely identify which pool of
                                            workers this worker logically belongs to.
          worker_id                         A name to uniquely identify your worker.
          worker_type                       This should match a worker_type managed by the
                                            provisioner you have specified.
          livelog_secret                    This should match the secret used by the
                                            stateless dns server; see
                                            https://github.com/taskcluster/stateless-dns-server
          public_ip                         The IP address for clients to be directed to
                                            for serving live logs; see
                                            https://github.com/taskcluster/livelog and
                                            https://github.com/taskcluster/stateless-dns-server

        ** OPTIONAL ** properties
        =========================

          certificate                       Taskcluster certificate, when using temporary
                                            credentials only.
          provisioner_id                    The taskcluster provisioner which is taking care
                                            of provisioning environments with generic-worker
                                            running on them. [default: aws-provisioner-v1]
          refresh_urls_prematurely_secs     The number of seconds before azure urls expire,
                                            that the generic worker should refresh them.
                                            [default: 310]
          debug                             Logging filter; see
                                            https://github.com/tj/go-debug [default: *]
          livelog_executable                Filepath of LiveLog executable to use; see
                                            https://github.com/taskcluster/livelog
          subdomain                         Subdomain to use in stateless dns name for live
                                            logs; see
                                            https://github.com/taskcluster/stateless-dns-server
                                            [default: taskcluster-worker.net]

    Here is an syntactically valid example configuration file:

            {
              "access_token":               "123bn234bjhgdsjhg234",
              "client_id":                  "hskdjhfasjhdkhdbfoisjd",
              "worker_group":               "dev-test",
              "worker_id":                  "IP_10-134-54-89",
              "worker_type":                "win2008-worker",
              "provisioner_id":             "my-provisioner",
              "livelog_secret":             "baNaNa-SouP4tEa",
              "public_ip":                  "12.24.35.46"
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
21:22:28.016 4ms    4ms    generic-worker - Detected darwin platform
21:22:28.016 5ms    5ms    queue - Making http request: &{GET https://queue.taskcluster.net/v1/poll-task-url/test-provisioner/IKS0ndoITKKaRfytmhmn7A HTTP/1.1 1 1 map[Content-Type:[application/json] Authorization:[Hawk id="hkhwW8sQRFiau1ie1b29tQ", mac="9fb6kOZFnPPkGlLFFUdkYlVQn2DMVnF+vEZRQXj2tZY=", ts="1449264148", nonce="zn2CRy0e"]] <nil> 0 [] false queue.taskcluster.net map[] map[] <nil> map[]   <nil> <nil>}
21:22:29.261 1s     1s     generic-worker - Refreshing signed urls in 24m49.966236028s
21:22:29.261 3us    3us    generic-worker -   Priority (1) Delete URL: https://taskclusterqueuev1.queue.core.windows.net/queue-cnvdrxdarepvm5abnzfwx5ek-cgajs77bixgp6ckx67cditsd-5/messages/{{messageId}}?popreceipt={{popReceipt}}&sv=2015-04-05&se=2015-12-04T21%3A52%3A29Z&sp=p&spr=https&sig=F0pBtAwEU7GKUPVgv9a0ztKTUv%2FEWGGnttQkGaNzHq8%3D&st=2015-12-04T21%3A07%3A29Z
21:22:29.261 889ns  879ns  generic-worker -   Priority (1) Poll URL:   https://taskclusterqueuev1.queue.core.windows.net/queue-cnvdrxdarepvm5abnzfwx5ek-cgajs77bixgp6ckx67cditsd-5/messages?visibilitytimeout=300&sv=2015-04-05&se=2015-12-04T21%3A52%3A29Z&sp=p&spr=https&sig=F0pBtAwEU7GKUPVgv9a0ztKTUv%2FEWGGnttQkGaNzHq8%3D&st=2015-12-04T21%3A07%3A29Z
21:22:29.261 791ns  781ns  generic-worker -   Priority (2) Delete URL: https://taskclusterqueuev1.queue.core.windows.net/queue-cnvdrxdarepvm5abnzfwx5ek-cgajs77bixgp6ckx67cditsd-1/messages/{{messageId}}?popreceipt={{popReceipt}}&sv=2015-04-05&se=2015-12-04T21%3A52%3A29Z&sp=p&spr=https&sig=dMIZ6%2FyVhl5FaOxSXthdQV7VIGlr3IA0QrffTr5%2B0vw%3D&st=2015-12-04T21%3A07%3A29Z
21:22:29.261 722ns  712ns  generic-worker -   Priority (2) Poll URL:   https://taskclusterqueuev1.queue.core.windows.net/queue-cnvdrxdarepvm5abnzfwx5ek-cgajs77bixgp6ckx67cditsd-1/messages?visibilitytimeout=300&sv=2015-04-05&se=2015-12-04T21%3A52%3A29Z&sp=p&spr=https&sig=dMIZ6%2FyVhl5FaOxSXthdQV7VIGlr3IA0QrffTr5%2B0vw%3D&st=2015-12-04T21%3A07%3A29Z
2015/12/04 22:22:30 Binding queue/pmoore_test1/44889277-c3f6-4f23-936c-c5a338cf0592 to exchange/taskcluster-queue/v1/artifact-created with routing key *.d9vbIkBAS_-9MAEdE9zbJw.*.*.*.test-provisioner.IKS0ndoITKKaRfytmhmn7A.*.*.#
2015/12/04 22:22:30 Binding queue/pmoore_test1/44889277-c3f6-4f23-936c-c5a338cf0592 to exchange/taskcluster-queue/v1/task-completed with routing key *.d9vbIkBAS_-9MAEdE9zbJw.*.*.*.test-provisioner.IKS0ndoITKKaRfytmhmn7A.*.*.#
21:22:30.488 1s     1s     generic-worker - Zero tasks returned in Azure XML QueueMessagesList
21:22:30.678 189ms  189ms  generic-worker - Zero tasks returned in Azure XML QueueMessagesList
21:22:30.678 1us    1us    generic-worker - No task claimed from any Azure queue...
21:22:30.876 197ms  197ms  generic-worker - Zero tasks returned in Azure XML QueueMessagesList
21:22:31.065 189ms  189ms  generic-worker - Zero tasks returned in Azure XML QueueMessagesList
21:22:31.065 1us    1us    generic-worker - No task claimed from any Azure queue...
```

# Create a test job

Go to https://tools.taskcluster.net/task-creator/ and create a task to run on your generic worker.

Use [this example](task-definition-example.json) as a template, but make sure to edit `provisionerId` and `workerType` values so that they match what you set in your config file.

Please note you should *NOT* use the default value of `aws-provisioner` for the `provisionerId` since then the production aws provisioner may start spawning ec2 instances, and the docker-worker may try to run the job. By specifying something unique for your local environment, the aws provisioner and docker workers will leave this task alone, and only your machine will claim the task.

Don't forget to submit the task by clicking the *Create Task* icon.

If all is well, your local generic worker should pick up the job you submit, run it, and report back status.

# Run the generic worker test suite

For this you need to have the source files (you cannot run the tests from the binary package).

Then cd into the source directory, and run:

```
go test -v ./...
```

# Further information

Please see:

* [TaskCluster Documentation](http://docs.taskcluster.net/)
* [Generic Worker presentations](http://docs.taskcluster.net/presentations/) (focus on Windows platform)
* [TaskCluster Web Tools] (http://tools.taskcluster.net/)
* [Generic Worker Open Bugs] (https://bugzilla.mozilla.org/buglist.cgi?f1=product&list_id=12722874&o1=equals&query_based_on=Taskcluster%20last%202%20days&o2=equals&query_format=advanced&f2=component&v1=Taskcluster&v2=Generic-Worker&known_name=Taskcluster%20last%202%20days)
