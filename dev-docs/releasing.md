# Releasing

In normal circumstances, releasing Taskcluster is as simple as

```shell
yarn release
```

This will calculate the next revision, make some in-repo changes, and tag and push.
From there, automation will take over and build the necessary bits to represent the release.

## Implementation

Releasing is in two parts: `yarn release` (run from the command line, above) and a release
task graph that CI generates when the `vX.Y.Z` tag is pushed.
`yarn release` prints the checks URL where you can watch the graph.

The graph has five stages, defined in `taskcluster/kinds/release-*`:

1. **release-build**: builds every Docker image, binary and npm tarball as task artifacts.
   These tasks have no access to publishing credentials.
2. **release-gate**: waits for every build.
3. **release-publish**: pushes images to Docker Hub, uploads assets to a *draft* GitHub
   release, and publishes to PyPI and crates.io.
4. **release-finalize**: publishes the GitHub release (which triggers npm publishing
   through GitHub Actions), then updates the Homebrew tap.
5. **release-notify**: emails once every publish and finalize task has succeeded (or when the 4-day deadline expires with something unfinished).
   It does not wait for the npm publishing workflow, so check that workflow separately (see below).

Every publish step checks the destination first, so it can be run any number of times; see below for the one exception, rebuilding images.
Every release task also emails taskcluster-notifications@mozilla.com immediately if it fails or
raises an exception, so you do not need to wait for `release-notify` to learn about a problem. Staging releases do not send email; watch the task group instead.

### When a release task fails

Open the task group linked from the commit's checks page (`yarn release` prints the URL).
Fix the cause if needed, then use **Rerun** on the failed task. Do **not** use Retrigger:
it creates a new task that nothing downstream waits for. When the rerun succeeds, the
waiting tasks continue automatically. Release tasks have a 4-day deadline; after that,
reruns are refused and the release must be finished by re-pushing the tag
(delete and recreate it) to start a new graph.

Re-pushing the tag only works if no `push-image-*` task has succeeded yet and
`github-release-publish` has not run. If some images were already pushed, the new graph's push
tasks for those images will fail by design (the rebuilt image has a different digest). If
`github-release-publish` has run, the GitHub release is public and the new graph's
`github-release-draft` task refuses to change its assets (the rebuilt binaries differ). In either
case the way forward is a new patch release (`yarn release` again, which bumps the version)
rather than re-tagging.

Once `pypi` or `crates` has succeeded, a re-pushed tag must point at the same commit. Those
tasks skip files and versions the registry already has, so a tag moved to a different commit
would leave PyPI or crates.io with the old code while the GitHub release gets the new. If the
code needs to change, make a new patch release instead.

Never rerun an `image-*` build after its `push-image-*` task has succeeded. The rebuilt image
has a different digest, so the push task will (correctly) refuse to overwrite the tag.

If the "Publish NPM Packages" GitHub Actions workflow fails after `github-release-publish`,
re-run the failed job from the repository's Actions tab: it replays the same `release: published`
event and downloads the npm tarballs from the release. Rerunning `github-release-publish` will not
trigger it again, because the release is already published.

## Staging Releases

If you are modifying the publish code, it can be very difficult to effectively test things locally.
To run a "staging release", run `yarn staging-release`.
This will push a specially-named branch to the `taskcluster/staging-releases` repository, where CI will run the same release graph described above.

So that staging builds exactly what a real release builds, `yarn staging-release` makes the same version bump and changelog update as `yarn release`, but commits them on a throwaway detached commit.
It pushes that commit to `staging-release/vX.Y.Z` and then returns you to your branch, which is not modified (if the run fails, the partial changes are discarded and you are still returned to your branch).
It requires a clean working copy, and the same local tools as `yarn release` (for example, `uv` for the Python client lockfile update).
Unlike a real release, it does not require your branch to match upstream `main`, and it never creates or pushes a tag.
Staging build tasks do create a local (never pushed) `vX.Y.Z` tag at the checked-out commit, so Go binaries and goreleaser behave exactly as in a real release.

The staging graph is the same as the release graph, except that images are pushed to a
throwaway registry on the worker (not Docker Hub), PyPI and crates.io steps run in dry-run
mode, the release is published on `staging-releases`, the Homebrew tap is not touched, and no
emails are sent.
