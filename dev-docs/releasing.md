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
To run a "staging release", push your work to a branch on the `taskcluster/taskcluster` repo with a name starting wtih `staging-release/`, e.g., `staging-release/bug1234567`.
A specialized release task will be created that will build a release (v9999.99.99) but not push it anywhere.
