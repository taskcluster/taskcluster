# TaskCluster Queue [![Build Status](https://travis-ci.org/taskcluster/taskcluster-queue.png?branch=master)](https://travis-ci.org/taskcluster/taskcluster-queue)

This the central queue coordinating execution of tasks in the TaskCluster setup.

Project Structure
-----------------
_The following itemization of folders outlines how this project is structured._

 * `queue/`, contains queue application logic.
 * `config/`, contains nconf based configuration for tests / production.
 * `routes/`, contains all forms of HTTP entries, including the API, though the
   API is mainly implemented by the application logic in `queue/`
   (or at least this is the intention, as we improve the implementation).
 * `schemas/`, JSON Schemas against which all input and output, i.e. messages,
    S3 files, requests and responses should be validated against.
 * `tests/`, automated tests using `nodeunit`, launched with `node tests` so
   that we can stick in other test frameworks should we ever need it.


Development
-----------

To run tests under vagrant you'll need a configuration file with access
credentials for S3 and Azure Blob and Table Storage. It is useful overwrite
the configs given in `config/test.js` with a local configuration file
`taskcluster-queue.conf.json` as illustrated below:

```
{
  "aws": {
    "accessKeyId":        "...",
    "secretAccessKey":    "...",
    "region":             "us-west-2"
  },
  "azure": {
    "accountName":        "...",
    "accountKey":         "..."
  }
}
```

For S3 we have a dummy bucket called `test-bucket-for-any-garbage` which stores objects for 24 hours. Mozilla developers can get access from a taskcluster
developer, or you can setup a custom a bucket and overwrite the bucket name
as well as the credentials.

Same thing applies for azure, though it's as nicely scoped, and doesnt clean up
on it's own.


Deployment
----------
Code is deployed from master to heroku whenever code hits master
(and it passes travis ci)

The following processes are designed to run constantly:

 * `./bin/server.js production`
 * `./bin/reaper.js production`

With the following processes running as cron jobs on daily basis:

 * `./bin/expire-artifacts.js production`
 * `./bin/retire-tasks.js production`

On heroku these are configured using the scheduler.

Monitoring
----------
This server will print log messages it is recommend run with `DEBUG` as
`"* -superagent -babel -mocha:* -express:*"`.
Notice that messages printed containing the substring `[alert-operator]` should
be monitored by the maintainer. It's recommended that an email alert it setup
to alert the maintainer of these messages.

Messages labeled `[not-a-bug]` should not be confused with errors or bugs. It's
simply special conditions that can arise. Sometimes they can be useful to
diagnose unrelated bugs.


AWS Access Policies Required
----------------------------
The taskcluster queue uses an S3 bucket for storing artifacts, in addition API
and exchange meta-data is published buckets `schemas.taskcluster.net` and
`references.taskcluster.net` as these are configured as defaults in
`taskcluster-base`.
In order to operate on these resources the following access policy is needed:

```js
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::schemas.taskcluster.net/queue/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::references.taskcluster.net/queue/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::<task-bucket>/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetBucketLocation",
        "s3:ListBucket",
        "s3:PutBucketCORS"
      ],
      "Resource": [
        "arn:aws:s3:::<task-bucket>"
      ]
    }
  ]
}
```