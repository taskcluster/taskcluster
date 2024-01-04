audience: users
level: major
reference: issue 6689
---
Breaking change: Generic Worker now evaluates absolute paths inside `mounts`
(properties `directory` and `file`) and artifacts (property `path`) correctly.
Previously Generic Worker would effectively strip leading path separators and
treat them as relative paths inside the task directory. For example, `/tmp`
would be resolved as the relative path `tmp` from inside the task directory.

Although this is technically a bug fix, it does change the behaviour of Generic
Worker when absolute paths are specified in task payloads. We have examined
production tasks on both the Community and Firefox CI deployments of
taskcluster, and are reasonably confident that this change should not have
adverse affects on existing tasks. However we are bumping the major version
number of the taskcluster release, in recognition of the backward
incompatibility.
