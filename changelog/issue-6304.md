audience: users
level: patch
reference: issue 6304
---
GitHub service no longer skips CI based on PR description. It will only skip CI based on the PR title or the commit message, [as GitHub does](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/skipping-workflow-runs).
