# Releasing

In normal circumstances, releasing Taskcluster is as simple as

```shell
yarn release
```

This will calculate the next revision, make some in-repo changes, and tag and push.
From there, automation will take over and build the necessary bits to represent the release.

## Implementation

Releasing is in two parts: `yarn release` (run from the command line, above) and `yarn release:publish` (run in automation).
These are defined in `infrastructure/tooling/src/release` and `../publish`, respectively.

## Staging Releases

If you are modifying the publish code, it can be very difficult to effectively test things locally.
To run a "staging release", run `yarn staging-release`.
This will push a specially-named branch to the `taskcluster/staging-releases` repository, where CI will create a draft release containing all of the expected artifacts.
The process will build docker images and client packges, but not push or upload them.
