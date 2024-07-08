audience: users
level: major
reference: issue 7126
---
d2g no longer includes `--privileged` in all generated `podman run` commands. This was previously introduced as a breaking change in release 61.0.0 (PR #6891) but has broken some tasks. The original reason for adding it (#6890) seems to no longer apply, as the original bug report is no longer reproducible. This therefore reverts the d2g treatment of the --privileged flag to how it was before release 61.0.0.
