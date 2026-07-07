audience: users
level: patch
reference: bug 2053178
---
Fix a way for PRs from forks to bypass the `public_restricted` policy by
declaring `version: 0` in their own taskcluster.yml
