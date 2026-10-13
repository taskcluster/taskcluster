audience: developers
level: silent
reference: issue 7022
---
Releases are now built and published by a task graph instead of a single task. Each build and publish step can be rerun on its own, nothing is published until every build succeeds, and the GitHub release is only made public, and the Homebrew tap only updated, after Docker Hub, PyPI and crates.io have the new version.
