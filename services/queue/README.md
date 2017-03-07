# TaskCluster Queue [![Build Status](https://travis-ci.org/taskcluster/taskcluster-queue.png?branch=master)](https://travis-ci.org/taskcluster/taskcluster-queue)

This is the central queue coordinating execution of tasks in the TaskCluster setup.

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
 * `tests/`, automated tests using `mocha`, launched with `node tests` so
   that we can stick in other test frameworks should we ever need it.


Development
-----------

To run tests you'll need a configuration file with access credentials for S3
and Azure Blob and Table Storage, as well as pulse credentials.
To do this, create a local configuration file
`user-config.yml` in the root directory of the taskcluster-queue
project. For safety reasons, this file is added to the `.gitignore` file. There
is an example `user-config-example.yml` to use for initial setup.

For S3 we have a dummy bucket called `test-bucket-for-any-garbage` which stores
objects for 24 hours. Mozilla developers can get access from a taskcluster
developer, or you can setup a custom a bucket and overwrite the bucket name as
well as the credentials.

Same thing applies for azure, though it's not as nicely scoped, and doesn't
clean up on its own.

Deployment
----------
Code is deployed from master to heroku whenever code hits master (and it passes
travis ci)

The following processes are designed to run constantly:

 * `npm run start`
 * `npm run claim-reaper`
 * `npm run deadline-reaper`

With the following processes running as cron jobs on daily basis:

 * `npm run expire-artifacts`
 * `npm run retire-tasks`

On heroku these are configured using the scheduler.

Monitoring
----------
Taskcluster-queue writes to both Sentry and Statsum via the
`taskcluster-lib-monitor` library. Errors will be automatically reported
and alerted upon.

In addition, this server will print log messages it is recommend run with `DEBUG` as
`"* -superagent -babel -mocha:* -express:*"`.

AWS Access Policies Required
----------------------------
The taskcluster queue uses an S3 bucket for storing artifacts, in addition API
and exchange meta-data is published buckets `schemas.taskcluster.net` and
`references.taskcluster.net` as these are configured as defaults in
`taskcluster-base`.
In order to operate on these resources the following access policy is needed:

```js
{
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
        "arn:aws:s3:::<public-artifact-bucket>/*"
        "arn:aws:s3:::<private-artifact-bucket>/*"
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
        "arn:aws:s3:::<public-artifact-bucket>"
        "arn:aws:s3:::<private-artifact-bucket>"
      ]
    }
  ]
}
```

Furthermore, you'll need to set the following _bucket policy_ on you public
artifact bucket:
```js
{
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": {
        "AWS": "*"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::<public-artifact-bucket>/*"
    }
  ]
}
```

Service Owner
-------------

Service Owner: jonasfj@mozilla.com

Deployment Testing
------------------
To test a deployment create a simple task with the [task-creator](https://tools.taskcluster.net/task-creator/).
Monitoring logs and sentry is also a good idea.
