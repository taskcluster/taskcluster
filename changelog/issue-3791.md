audience: users
level: patch
reference: issue 3791
---
The shell client (the `taskcluster` command) now correctly handles the case where no credentials are provided.  In previous versions, if used to call a method which required credentials, this would result in an error: `Bad Request: Bad attribute value: id`.  With the inclusion of [RFC#165](https://github.com/taskcluster/taskcluster-rfcs/blob/main/rfcs/0165-Anonymous-scopes.md)in this release, this error would occur when calling any method.  The short story is, if you see such errors, upgrade the shell client.
