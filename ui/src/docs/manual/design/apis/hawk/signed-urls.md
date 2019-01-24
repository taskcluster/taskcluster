---
filename: design/apis/hawk/signed-urls.md
title: Pre-signed URLs
order: 27
---

Hawk allows you to generate a _bewit_ signature for any `GET` request. Including
this _bewit_ signature in your request will then authenticate and authorize the
request. All Taskcluster APIs support authentication of `GET` requests using
these bewit signatures. And you'll find that the official
[taskcluster-client](https://github.com/taskcluster/taskcluster-client)
offers an API for generating these signatures.

Pre-signed URLs are allow an HTTP client which does not directly support Hawk
-- such as a browser or a command-line tool -- to access Taskcluster resources.
A common use-case is to provide a link to a private artifact.