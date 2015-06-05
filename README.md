# generic-worker
A generic worker for task cluster, written in go.

# Getting started with Generic Worker

Although the generic worker is not yet fully implemented, or feature complete, here is some information about how you might use it when it is ready. This might also serve as a useful guide if you interested in contributing to its development.

## Install binary directly

* Download the latest release for your platform from https://github.com/taskcluster/generic-worker/releases.
* Download the latest payload schema from https://raw.githubusercontent.com/taskcluster/generic-worker/master/schema.json (this step will be gone very soon - whoops).

## Build from source

If you prefer not to use a prepackaged binary, or want to have the latest unreleased version from the development head:

* Head over to http://golang.org/doc/install and follow the instructions for your platform. Be sure to set your GOPATH to something appropriate.
* Run `go get github.com/taskcluster/generic-worker`
* Run `go install github.com/taskcluster/generic-worker`

All being well, the binary will be built under `${GOPATH}/bin`.

## Create TaskCluster account

Head over to https://tools.taskcluster.net/auth/ and create yourself an account with scopes `*` and a decently long expiry for running jobs. Keep a note of the ClientId and AccessToken you are given.

## Set up your env

```
export PAYLOAD_SCHEMA="${GOPATH}/src/github.com/taskcluster/generic-worker/schema.json"
export PROVISIONER_ID='<choose_whatever_you_like>'
export REFRESH_URLS_PREMATURELY_SECS=300
export TASKCLUSTER_ACCESS_TOKEN='<your_access_token_from_above>'
export TASKCLUSTER_CLIENT_ID='<your_client_id_from_above>'
export WORKER_GROUP='<anything>'
export WORKER_ID='<something_to_identify_your_machine_eg_hostname>'
export WORKER_TYPE='<choose_whatever_you_like>'
```

You may also consider putting this in a file that is sourced when your shell starts.

## Start the generic worker

Simply run:

```
generic-worker
```

and watch logs for a successful startup. If you can see it is polling the Queue, and the process does not exit, then you can continue. If it reports a problem, follow any instructions it provides. If you are really stuck, join #taskcluster channel on irc.mozilla.org, and ask for help.

It should look something like this:

```
pmoore@laptop:~ $ generic-worker
2015/03/27 15:39:55   Delete URL: https://taskclusterqueuev1.queue.core.windows.net/queue-uxvv56u25c7cwivco6vq-uxvv56ykfoi6u-1/messages/{{messageId}}?popreceipt={{popReceipt}}&st=2015-04-20T13%3A24%3A55Z&se=2015-04-20T14%3A09%3A55Z&sp=p&sv=2014-02-14&sig=hQvrbc5zPVsaHFZ9EA5JpTl0OedEt20ED3I2wnt9AAw%3D
2015/03/27 15:39:55   Poll URL:   https://taskclusterqueuev1.queue.core.windows.net/queue-uxvv56u25c7cwivco6vq-uxvv56ykfoi6u-1/messages?visibilitytimeout=300&st=2015-04-20T13%3A24%3A55Z&se=2015-04-20T14%3A09%3A55Z&sp=p&sv=2014-02-14&sig=hQvrbc5zPVsaHFZ9EA5JpTl0OedEt20ED3I2wnt9AAw%3D
2015/03/27 15:39:56 Zero tasks returned in Azure XML QueueMessagesList
2015/03/27 15:39:56 No task claimed from any Azure queue...
2015/03/27 15:39:56 Zero tasks returned in Azure XML QueueMessagesList
2015/03/27 15:39:56 No task claimed from any Azure queue...
2015/03/27 15:39:57 Zero tasks returned in Azure XML QueueMessagesList
2015/03/27 15:39:57 No task claimed from any Azure queue...
2015/03/27 15:39:58 Zero tasks returned in Azure XML QueueMessagesList
2015/03/27 15:39:58 No task claimed from any Azure queue...

```

## Create a test job

Go to https://tools.taskcluster.net/task-creator/ and create a task to run on your generic worker.

This page provides a decent example task, but first make sure to edit `provisionerId` value should match what you set your `PROVISIONER_ID` env variable to, and the value of `workerType` should match what you set your `WORKER_TYPE` env variable to.

Please note you should *NOT* use the default value of `aws-provisioner` for the `provisionerId` since then the production aws provisioner may start spawning ec2 instances, and the docker-worker may try to run the job. By specifying something unique for your local environment, the aws provisioner and docker workers will leave this task alone, and only your machine will claim the task.

Don't forget to submit the task by clicking the *Create Task* icon.

If all is well, your local generic worker should pick up the job you submit, run it, and report back status.

*Please note the Generic Worker is still undergoing development, and is not complete yet.*
