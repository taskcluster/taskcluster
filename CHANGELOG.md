# Change Log

<!-- `yarn release` will insert the existing changelog snippets here: -->
<!-- NEXT RELEASE HERE -->

## v14.2.0

[minor] The AWS Provisioner and Provisioner views are no longer available, as the AWS provisioner itself will be removed in favor of the worker manager service.

[minor] ([bug 1560649](http://bugzil.la/1560649)) The Go client is now hosted in the repository together with the services and other clients, and co-versioned with them.
See [the docs](https://github.com/taskcluster/taskcluster/tree/master/clients/client-go#readme).

[minor] ([bug 1559471](http://bugzil.la/1559471)) The web-server configuration for sign-in now requires a single JWT HS256 key (`JWT_KEY`) instead of a public/private key (`JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`).

Changes are now recorded in the CHANGELOG.md file.

([bug 1547729](http://bugzil.la/1547729)) Hook fire attempts are now logged using structured logging, including when a hook "declines" to create a task.

([bug 1556526](http://bugzil.la/1556526)) The `workerManager.updateWorkerType` API method now allows extra fields such as `lastModified`, making read-modify-write usages easier to implement.

The search box in the log viewer now searches on enter.

The task group inspector now shows the full task name.

([bug 1558346](http://bugzil.la/1558346)) Workers can now report errors directly to the worker manager for display in the worker-manager UI.

## Older Releases

Changes were not tracked for older releases of Taskcluster
