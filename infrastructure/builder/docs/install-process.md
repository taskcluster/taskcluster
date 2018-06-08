---
title: Installing Taskcluster
order: 10
---

Taskcluster installation breaks down into two phases:

 * Build a Taskcluster release
 * Deploy that release

A release can be deployed anywhere, so the build process does not contain any deployment-specific settings.
Most installations of Taskcluster will deploy the "upstream" release produced by the Taskcluster team, incorporating deployment-specific configuration.

# Build

The build phase takes a [cluster spec](./cluster-spec) and source code and, along with lots of external resources like docker images, third-party packages, and so on, produces a "release".
The build process uses a *build config* for credentials to access artifact repositories, etc.
The content of the configuration does not affect the result of the build.

The output of the build process is also a cluster spec, but one that contains links to artifacts to support the deployment, as well as information about the precise revision of the source code used in the build.

Note that builds are not deterministic.
Two builds of exactly the same source may produce artifacts with different hashes.
In practice, the results are similar enough that this is not an issue.

## Usage

To build a release:

```
./taskcluster-installer build --push --base-dir /tmp/base-dir taskcluster-spec/ release.tf.json
```

Omit `--push` to skip pushing to a Docker registry (e.g., for local testing).
For best results, the `--base-dir` option should be on fast, large storage.

The build process attempts to skip steps that need not be performed, so re-running the build process is often quite fast.
The `--no-cache` option will destroy any cached state and start from scratch.
