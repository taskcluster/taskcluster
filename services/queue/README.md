# TaskCluster Queue [![Build Status](https://travis-ci.org/taskcluster/taskcluster-queue.png?branch=master)](https://travis-ci.org/taskcluster/taskcluster-queue)

This the central queue coordinating execution of tasks in the TaskCluster setup.

**Warning:** This is still very much a prototype.

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
 * `utils/`, various helpful utilities, monkey-patches, etc. that are useful,
   but not exactly query specific.


Deployment
----------
Code is deployed from master to heroku whenever code hits master (and it passes travis ci)


AWS Access Policies Required
----------------------------
The taskcluster queue uses an S3 bucket for storing tasks meta-data, artifacts
and results, in addition API and exchange meta-data is published buckets
`schemas.taskcluster.net` and `references.taskcluster.net` as these are
configured as defaults in `taskcluster-base`.
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
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::<task-bucket>/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetBucketLocation",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::<task-bucket>"
      ]
    }
  ]
}
```
