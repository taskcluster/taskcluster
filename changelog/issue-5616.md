audience: admins
level: minor
reference: issue 5616
---
For projects with `policy.pullRequests` set to `public_restricted`, Taskcluster Github will now assume the role `repo:github.com/${ payload.organization }/${ payload.repository }:pull-request-untrusted`. Administrators will need to create this role for all `public_restricted` projects.
