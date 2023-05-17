audience: admins
level: patch
reference: issue 5621
---

Several Github service improvements:
* auto cancel task groups is not enabled by default
* auto cancel task groups reports when it cannot seal and cancel task groups with github comments
* when cancelling task groups, it will filter by same event type (push, pull_request, etc)
* calling queue with limited scopes: assumes `repo:github.com/org/repo:*` role(s) to make sure that given repository has correct permissions to seal and cancel task groups
* github api exposes `github.cancelBuilds({ organization, repository, sha?, pullNumber? })` to cancel existing running builds
